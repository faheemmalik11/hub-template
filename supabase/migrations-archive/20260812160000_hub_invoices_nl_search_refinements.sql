-- 20260812160000_hub_invoices_nl_search_refinements
--
-- Three fixes to invoices_filtered_search / invoices_filtered_aggregate (migrations
-- 20260811120000, 20260811150000, 20260811151349), found while comparing this repo's
-- natural-language search against a sibling repo's independently-refined fork of the same
-- feature:
--
-- 1. p_payment_state ('open' | 'paid' | 'overdue', default null): previously "what's still
--    unpaid" had no dedicated filter at all and fell through to semantic ranking, answering from
--    whatever invoice TEXT happened to look similar to the words "unpaid"/"offen" -- not from the
--    actual paid_at/due_date columns the rest of the app already uses for this (ZahlungBadge,
--    the list page's own separate zahlung Combobox). 'overdue' = unpaid AND past due_date; an
--    invoice with due_date is null is NEVER overdue -- never invent a deadline the document
--    doesn't carry. An unrecognised value filters nothing (a typo must not silently hide
--    invoices).
--
-- 2. p_issuer_like is now escaped against '%' and '_' before use in ILIKE: unescaped, a literal
--    supplier-name fragment containing either character acted as a SQL wildcard (e.g. a fragment
--    "50_" would also match "500", "501", "50A").
--
-- 3. cost_category comparison is now case-insensitive: the model always proposes an exactly-cased
--    value from live bwa_categories.name_de (see intentSchema's enum), but nothing enforced that
--    invoices.cost_category itself was always written with matching casing -- a silent-undercount
--    risk with no visible signal that anything was even wrong.
--
-- Duplicate-invoice-row exclusion (present in the sibling repo's version) is deliberately NOT
-- ported here: this repo's ingestion pipeline (adapters/repo/receipts.py's _resolve_and_screen)
-- never inserts an `invoices` row for a status='duplikat' verdict in the first place (mark_imported
-- + processing_log only, "NEVER insert_beleg") -- there is no duplicate row for these RPCs to
-- accidentally include, so there is nothing to exclude.
--
-- Idempotent: drops + recreates (signature changes, CREATE OR REPLACE cannot add a parameter).

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'paid_at')
  then
    raise exception '20260812160000 preconditions failed: column invoices.paid_at is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'due_date')
  then
    raise exception '20260812160000 preconditions failed: column invoices.due_date is missing';
  end if;
end $$;

drop function if exists public.invoices_filtered_search(
  vector, text, text, text, text, date, date, text, int
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
  id uuid,
  invoice_number text,
  issuer text,
  document_date date,
  amount_gross numeric,
  company_code text,
  property_code text,
  cost_category text,
  service_description text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    id, invoice_number, issuer, document_date, amount_gross, company_code, property_code,
    cost_category, service_description,
    case when p_query_embedding is not null then 1 - (embedding <=> p_query_embedding) end as similarity
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (p_company_code  is null or company_code  = p_company_code)
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
  text, text, text, text, date, date, text
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
  total_count int,
  total_gross numeric,
  total_net   numeric,
  total_vat   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::int,
    coalesce(sum(amount_gross), 0),
    coalesce(sum(amount_net), 0),
    coalesce(sum(vat_amount), 0)
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (p_company_code  is null or company_code  = p_company_code)
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
    and (p_issuer_like   is null
         or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (
      p_payment_state is null
      or (p_payment_state = 'paid'    and paid_at is not null)
      or (p_payment_state = 'open'    and paid_at is null)
      or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
    );
$$;

grant execute on function public.invoices_filtered_aggregate(
  text, text, text, text, date, date, text, text
) to authenticated;

commit;
