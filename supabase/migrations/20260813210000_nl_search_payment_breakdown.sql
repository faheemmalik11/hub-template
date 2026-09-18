-- Payment-grounded answers for the natural-language invoice search. Ported from immonetz's
-- 20260813210000_nl_search_payment_breakdown.sql, same day, same bug class.
--
-- REPORTED LIVE ON IMMONETZ (2026-08-13), and reproducible here because both projects run the same
-- retrieval design: the SAME question asked in two languages gave opposite answers.
--   EN "How much have we paid <supplier>?"  -> intent paymentState='paid' -> sum over SETTLED
--        invoices only -> "0 EUR".
--   DE "Wie viel haben wir für <supplier> bezahlt?" -> intent paymentState=null -> sum over ALL
--        matching invoices -> "... insgesamt X € bezahlt", listing invoices the table itself shows
--        as Zahlung: OFFEN. The answer contradicted the rows printed directly underneath it.
--
-- The prompt half of the fix (ONE explicit, language-symmetric rule: a question about what was
-- PAID always filters to settled invoices, in either language; a question about invoiced volume
-- never does) lives in src/lib/api/invoice-nl-retrieval.functions.ts. This migration fixes the half
-- that makes the ANSWER verifiable regardless of how that classification lands: the synthesis step
-- now always sees how the matched invoices split into settled vs. still-open.
--
-- 1. invoices_filtered_aggregate additionally returns all_paid_* / all_open_* — the settled and
--    outstanding parts of the set matched by the NON-payment filters (supplier, company, property,
--    category, dates). They deliberately ignore p_payment_state, so they mean the same thing no
--    matter how the question was classified: with p_payment_state='paid', total_* is the settled
--    answer the user asked for while all_open_* still says how much is outstanding behind it.
--    Computed in the same single scan (the payment filter moved from WHERE into a FILTER clause on
--    the total_* aggregates), so the numbers can never disagree with each other.
-- 2. invoices_filtered_search additionally returns paid_at, so a LIST-shaped answer is grounded in
--    each row's real payment status too — same failure mode, other query shape.
--
-- Both functions are recreated in full below rather than patched, because both change their return
-- type (drop + create is required for that). The bodies are otherwise the live ones verbatim,
-- including the p_payment_state support that was applied straight to the live DB earlier without a
-- migration file (the code comments referenced a "migration 20260812160000" that does not exist in
-- this repo) — so this file also brings the tracked history back in step with the database.
-- Two deliberate corrections while restating them:
--   * total_count becomes bigint (was count(*)::int) to match invoices_filtered_search's own
--     limits and immonetz's copy; every caller already reads it through Number().
--   * an unrecognised p_payment_state value now filters nothing instead of filtering everything
--     out — a typo in that argument must not silently hide every invoice.

drop function if exists public.invoices_filtered_search(
  vector, text, text, text, text, date, date, text, int, text
);
create function public.invoices_filtered_search(
  p_query_embedding vector(1536) default null,
  p_company_code    text default null,
  p_property_code   text default null,
  p_cost_category   text default null,
  p_issuer_like     text default null,
  p_date_from       date default null,
  p_date_to         date default null,
  p_status          text default null,
  p_limit           int  default 15,
  p_payment_state   text default null
)
returns table(
  id                  uuid,
  invoice_number      text,
  issuer              text,
  document_date       date,
  amount_gross        numeric,
  company_code        text,
  property_code       text,
  cost_category       text,
  service_description text,
  -- NEW: the row's real settlement status. Null = still open. The answering model gets this per
  -- row so a list answer cannot call an unpaid invoice "bezahlt" either.
  paid_at             timestamptz,
  similarity          double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    id, invoice_number, issuer, document_date, amount_gross, company_code, property_code,
    cost_category, service_description, paid_at,
    case when p_query_embedding is not null then 1 - (embedding <=> p_query_embedding) end as similarity
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (
      p_company_code is null
      or company_code = p_company_code
      or (p_company_code = 'NZO' and company_code is null)
    )
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
    and (p_issuer_like   is null
         or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (p_query_embedding is null or embedding is not null)
    and (
      p_payment_state is null
      or (p_payment_state = 'paid'    and paid_at is not null)
      or (p_payment_state = 'open'    and paid_at is null)
      or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
      or p_payment_state not in ('paid', 'open', 'overdue')
    )
  order by
    (case when p_query_embedding is not null then embedding <=> p_query_embedding end) asc nulls last,
    document_date desc nulls last
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

grant execute on function public.invoices_filtered_search(
  vector, text, text, text, text, date, date, text, int, text
) to authenticated;

drop function if exists public.invoices_filtered_aggregate(
  text, text, text, text, date, date, text, text
);
create function public.invoices_filtered_aggregate(
  p_company_code  text default null,
  p_property_code text default null,
  p_cost_category text default null,
  p_issuer_like   text default null,
  p_date_from     date default null,
  p_date_to       date default null,
  p_status        text default null,
  p_payment_state text default null
)
returns table(
  -- The answer to the question as asked: every filter applied, p_payment_state included.
  total_count    bigint,
  total_gross    numeric,
  total_net      numeric,
  total_vat      numeric,
  -- Context, NOT the answer: the same set with the payment filter left off, split by settlement
  -- status. all_paid_* + all_open_* is always the full non-payment-filtered set, so these two mean
  -- exactly the same thing whether or not the question was classified as a payment question.
  all_paid_count bigint,
  all_paid_gross numeric,
  all_paid_net   numeric,
  all_paid_vat   numeric,
  all_open_count bigint,
  all_open_gross numeric,
  all_open_net   numeric,
  all_open_vat   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with scope as (
    select amount_gross, amount_net, vat_amount, paid_at,
      (
        p_payment_state is null
        or (p_payment_state = 'paid'    and paid_at is not null)
        or (p_payment_state = 'open'    and paid_at is null)
        or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
        or p_payment_state not in ('paid', 'open', 'overdue')
      ) as matches_payment_filter
    from public.v_invoices_review
    where archived_at is null
      and not_relevant_at is null
      and (
        p_company_code is null
        or company_code = p_company_code
        or (p_company_code = 'NZO' and company_code is null)
      )
      and (p_property_code is null or property_code = p_property_code)
      and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
      and (p_issuer_like   is null
           or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
      and (p_date_from     is null or document_date >= p_date_from)
      and (p_date_to       is null or document_date <= p_date_to)
      and (p_status        is null or status = p_status)
  )
  select
    count(*)                   filter (where matches_payment_filter),
    coalesce(sum(amount_gross) filter (where matches_payment_filter), 0),
    coalesce(sum(amount_net)   filter (where matches_payment_filter), 0),
    coalesce(sum(vat_amount)   filter (where matches_payment_filter), 0),
    count(*)                   filter (where paid_at is not null),
    coalesce(sum(amount_gross) filter (where paid_at is not null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is not null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is not null), 0),
    count(*)                   filter (where paid_at is null),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is null), 0)
  from scope;
$$;

grant execute on function public.invoices_filtered_aggregate(
  text, text, text, text, date, date, text, text
) to authenticated;
