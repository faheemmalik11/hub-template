begin;

drop function if exists public.invoices_filtered_search(vector, text, text, text, text, date, date, text, int, text);
drop function if exists public.invoices_filtered_aggregate(text, text, text, text, date, date, text, text);

create or replace function public.invoices_filtered_search(
  p_query_embedding vector default null,
  p_company_code    text default null,
  p_property_code   text default null,
  p_cost_category   text default null,
  p_issuer_like     text default null,
  p_date_from       date default null,
  p_date_to         date default null,
  p_status          text default null,
  p_limit           int  default 15,
  p_payment_state   text default null,
  p_amount_min      numeric default null,
  p_amount_max      numeric default null
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
  paid_at             timestamptz,
  similarity          double precision
)
language sql
stable
set search_path to 'public'
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
    and (p_amount_min    is null or amount_gross >= p_amount_min)
    and (p_amount_max    is null or amount_gross <= p_amount_max)
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

create or replace function public.invoices_filtered_aggregate(
  p_company_code  text default null,
  p_property_code text default null,
  p_cost_category text default null,
  p_issuer_like   text default null,
  p_date_from     date default null,
  p_date_to       date default null,
  p_status        text default null,
  p_payment_state text default null,
  p_amount_min    numeric default null,
  p_amount_max    numeric default null
)
returns table(
  total_count bigint, total_gross numeric, total_net numeric, total_vat numeric,
  all_paid_count bigint, all_paid_gross numeric, all_paid_net numeric, all_paid_vat numeric,
  all_open_count bigint, all_open_gross numeric, all_open_net numeric, all_open_vat numeric
)
language sql
stable
set search_path to 'public'
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
      and (p_amount_min    is null or amount_gross >= p_amount_min)
      and (p_amount_max    is null or amount_gross <= p_amount_max)
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

revoke execute on function public.invoices_filtered_search(vector, text, text, text, text, date, date, text, int, text, numeric, numeric) from public, anon;
grant execute on function public.invoices_filtered_search(vector, text, text, text, text, date, date, text, int, text, numeric, numeric) to authenticated;
revoke execute on function public.invoices_filtered_aggregate(text, text, text, text, date, date, text, text, numeric, numeric) from public, anon;
grant execute on function public.invoices_filtered_aggregate(text, text, text, text, date, date, text, text, numeric, numeric) to authenticated;

commit;
