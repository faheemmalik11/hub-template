-- 20260811150000_hub_invoices_nl_search_description.sql
--
-- Extends invoices_filtered_search (migration 20260811120000) to also return
-- service_description, found necessary by live testing: a real invoice ("Kreditrate, bestehend
-- aus Amortisierung und monatlichen Zinsen", Qred Bank AB, cost_category='Zinsaufwand') was
-- semantically related to a user's question ("Amortisierung") but the returned match only carried
-- issuer/category/amount/similarity -- no text explaining WHY it might be relevant. The answer-
-- synthesis step (invoice-nl-ask.functions.ts) needs the actual description text to credibly
-- explain a semantic (not exact-filter) match, especially when the matched category disagrees
-- with the question's wording (the whole point of the similarity-over-category weighting already
-- in its prompt).
--
-- Also raises the default row limit 10 -> 15: the same live test found the relevant invoice
-- ranked #10 by cosine distance among all embedded invoices for a single ambiguous keyword query
-- ("Amortisierung" alone, similarity ~0.39) -- right at the previous limit's edge, headroom is
-- cheap and this is a `limit`, not a per-row cost.
--
-- Idempotent: drops + recreates (return type changes, CREATE OR REPLACE cannot add a column).

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'service_description')
  then
    raise exception '20260811150000 preconditions failed: column invoices.service_description is missing';
  end if;
end $$;

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
  p_limit           int  default 15
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
    and (p_cost_category is null or cost_category = p_cost_category)
    and (p_issuer_like   is null or issuer ilike '%' || p_issuer_like || '%')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (p_query_embedding is null or embedding is not null)
  order by
    (case when p_query_embedding is not null then embedding <=> p_query_embedding end) asc nulls last,
    document_date desc nulls last
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

grant execute on function public.invoices_filtered_search(
  vector, text, text, text, text, date, date, text, int
) to authenticated;

-- Self-check (run manually against a throwaway DB; rolls back, changes nothing)
-- begin;
-- do $$
-- declare
--   v_supplier uuid;
--   v_invoice  uuid;
--   v_search   record;
-- begin
--   insert into public.suppliers (name) values ('20260811150000 Selfcheck GmbH') returning id into v_supplier;
--   insert into public.invoices (
--     supplier_id, issuer, status, amount_gross, company_code, property_code, cost_category,
--     document_type, document_date, service_description
--   ) values (
--     v_supplier, '20260811150000 Selfcheck GmbH', 'erkannt', 100.00, 'IMKO', 'KLMUE4', 'Energie',
--     'Eingangsrechnung', current_date, 'Testbeschreibung fuer Selfcheck'
--   ) returning id into v_invoice;
--
--   select * into v_search from public.invoices_filtered_search(
--     null, 'IMKO', null, null, null, null, null, null, 10
--   ) where id = v_invoice;
--   if v_search.service_description is distinct from 'Testbeschreibung fuer Selfcheck' then
--     raise exception '20260811150000 self-check FAILED: service_description not returned correctly';
--   end if;
--
--   raise notice '20260811150000 self-check PASSED';
-- end $$;
-- rollback;

commit;
