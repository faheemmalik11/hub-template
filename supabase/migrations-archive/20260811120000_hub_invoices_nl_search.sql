-- 20260811120000_hub_invoices_nl_search.sql
--
-- Named with a timestamp, not the next sequential number (0095), because the last migration
-- actually applied to the remote database (20260810062807_revoke_anon_...) already switched to
-- the timestamp scheme -- `supabase db push` orders migrations by this prefix as a plain string,
-- and "0095" < "20260810062807" lexicographically, so a sequential name here would have sorted
-- BEFORE an already-applied migration and been rejected as out-of-order.
-- Natural-language invoice search (ported from immonetz, migration 20260810151421). Adds two
-- read-only RPCs the front end's AI search box (askInvoiceQuestion server fn) calls after an LLM
-- has turned a free-text German question into structured filters + an optional query embedding:
--   * invoices_filtered_search    -- exact filters + optional pgvector cosine ranking, row list
--   * invoices_filtered_aggregate -- same filters, count/sum only (for "how much did we pay for…")
--
-- Both are `security invoker`, built on v_invoices_review (not the base `invoices` table), so
-- RLS/company scoping applies exactly as it already does for every other read in this app --
-- see migration 0066's header for why that distinction matters (a `security definer` version, or
-- one reading `invoices` directly under a service-role connection, would silently leak
-- other-company invoices to a company-restricted user).
--
-- Idempotent: drops + recreates: safe to rerun.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
  v_col     text;
begin
  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_invoices_review')
  then v_missing := v_missing || 'view public.v_invoices_review'; end if;

  foreach v_col in array array[
    'id', 'invoice_number', 'issuer', 'document_date', 'amount_gross', 'company_code',
    'property_code', 'cost_category', 'status', 'archived_at', 'not_relevant_at', 'embedding'
  ]
  loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'invoices' and column_name = v_col)
    then v_missing := v_missing || ('column invoices.' || v_col); end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception '20260811120000 preconditions failed, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;

  raise notice '20260811120000 preconditions ok';
end $$;

-- ===========================================================================
-- 1. invoices_filtered_search -- exact filters (all optional/AND'd) + optional cosine ranking
--    against the query embedding. Row order: by similarity when an embedding is given (closest
--    first), else by document_date desc.
-- ===========================================================================
drop function if exists public.invoices_filtered_search(
  vector, text, text, text, text, date, date, text, int
);

create or replace function public.invoices_filtered_search(
  p_query_embedding vector(1536) default null,
  p_company_code    text default null,
  p_property_code   text default null,
  p_cost_category   text default null,
  p_issuer_like     text default null,
  p_date_from       date default null,
  p_date_to         date default null,
  p_status          text default null,
  p_limit           int  default 10
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
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    id, invoice_number, issuer, document_date, amount_gross, company_code, property_code, cost_category,
    case when p_query_embedding is not null then 1 - (embedding <=> p_query_embedding) end as similarity
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (p_company_code  is null or company_code  = p_company_code)
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or cost_category = p_cost_category)
    and (p_issuer_like   is null or issuer ilike '%' || p_issuer_like || '%')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (p_query_embedding is null or embedding is not null)
  order by
    (case when p_query_embedding is not null then embedding <=> p_query_embedding end) asc nulls last,
    document_date desc nulls last
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

grant execute on function public.invoices_filtered_search(
  vector, text, text, text, text, date, date, text, int
) to authenticated;

-- ===========================================================================
-- 2. invoices_filtered_aggregate -- same filter set (no embedding: an aggregate has no "top-N by
--    similarity" concept), returns count + gross sum for a "how many / how much" question.
-- ===========================================================================
drop function if exists public.invoices_filtered_aggregate(text, text, text, text, date, date, text);

create or replace function public.invoices_filtered_aggregate(
  p_company_code  text default null,
  p_property_code text default null,
  p_cost_category text default null,
  p_issuer_like   text default null,
  p_date_from     date default null,
  p_date_to       date default null,
  p_status        text default null
)
returns table(total_count bigint, total_gross numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*), coalesce(sum(amount_gross), 0)
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (p_company_code  is null or company_code  = p_company_code)
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or cost_category = p_cost_category)
    and (p_issuer_like   is null or issuer ilike '%' || p_issuer_like || '%')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status);
$$;

grant execute on function public.invoices_filtered_aggregate(
  text, text, text, text, date, date, text
) to authenticated;

-- ===========================================================================
-- 3. Self-check (run manually against a throwaway DB; rolls back, changes nothing)
-- ===========================================================================
-- begin;
-- do $$
-- declare
--   v_supplier uuid;
--   v_invoice  uuid;
--   v_search   record;
--   v_agg      record;
-- begin
--   insert into public.suppliers (name) values ('20260811120000 Selfcheck GmbH') returning id into v_supplier;
--   insert into public.invoices (
--     supplier_id, issuer, status, amount_gross, company_code, property_code, cost_category,
--     document_type, document_date
--   ) values (
--     v_supplier, '20260811120000 Selfcheck GmbH', 'erkannt', 250.00, 'IMKO', 'KLMUE4', 'Energie',
--     'Eingangsrechnung', current_date
--   ) returning id into v_invoice;
--
--   select * into v_search from public.invoices_filtered_search(
--     null, 'IMKO', null, null, null, null, null, null, 10
--   ) where id = v_invoice;
--   if v_search.id is null then
--     raise exception '20260811120000 self-check FAILED: invoices_filtered_search did not find the seeded row';
--   end if;
--
--   select * into v_agg from public.invoices_filtered_aggregate('IMKO', null, null, null, null, null, null);
--   if v_agg.total_count < 1 then
--     raise exception '20260811120000 self-check FAILED: invoices_filtered_aggregate did not count the seeded row';
--   end if;
--
--   raise notice '20260811120000 self-check PASSED';
-- end $$;
-- rollback;

commit;
