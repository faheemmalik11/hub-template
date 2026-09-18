-- 0010_belege_list_pagination.sql
-- Server-side pagination support for the incoming-invoice list (/eingangsrechnungen).
--
-- READ-ONLY / ADDITIVE ONLY: creates one view, two STABLE functions, and supporting
-- indexes. No table/column/data changes, no destructive statements. Safe to roll back.
--
-- - v_belege_list : non-deleted invoices + a computed `pruef_score` (mirrors the front-end
--   pruefScore/pruefGruende exactly) + `steller_sort` (issuer name for server sorting).
--   security_invoker = on  -> the querying user's RLS on belege/lieferanten still applies.
-- - belege_kpis   : filter-aware KPI counts + gross sum (excludes the status filter, so the
--   KPI cards keep working as status toggles).
-- - belege_facets : distinct filter-option lists over the whole non-deleted table.

begin;

-- ---------------------------------------------------------------------------
-- View: paginated/sortable list source with computed review-priority score
-- ---------------------------------------------------------------------------
create or replace view public.v_belege_list with (security_invoker = on) as
select
  b.*,
  coalesce(l.name, b.issuer) as steller_sort,
  (
      case when (b.validation ->> 'brutto_vorhanden') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'steller_vorhanden') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'summe_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'ust_satz_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'iban_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'datum_plausibel') = 'false' then 10 else 0 end
    + case when coalesce(b.validation ->> 'is_small_amount', '') <> 'true'
                and (b.validation ->> 'rechnungsnr_vorhanden') = 'false' then 10 else 0 end
    + case when coalesce(b.validation ->> 'is_small_amount', '') <> 'true'
                and (b.validation ->> 'datum_vorhanden') = 'false' then 10 else 0 end
    + case when b.status = 'zu_pruefen' then 5 else 0 end
    + case
        when (
          select min(v::numeric)
          from jsonb_each_text(coalesce(b.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
          where v ~ '^[0-9.]+$'
        ) < 0.8 then 3
        when (
          select min(v::numeric)
          from jsonb_each_text(coalesce(b.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
          where v ~ '^[0-9.]+$'
        ) < 0.95 then 1
        else 0
      end
  )::int as pruef_score
from public.invoices b
left join public.suppliers l on l.id = b.supplier_id
where b.deleted_at is null;

grant select on public.v_belege_list to authenticated;

-- ---------------------------------------------------------------------------
-- Function: KPI aggregates (filter-aware; deliberately ignores the status filter)
-- ---------------------------------------------------------------------------
create or replace function public.belege_kpis(
  p_q            text default null,
  p_gesellschaft text default null,
  p_objekt       text default null,
  p_belegart     text default null,
  p_zahlung      text default null,
  p_von          date default null,
  p_bis          date default null
)
returns table(total bigint, erkannt bigint, zu_pruefen bigint, volumen numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where status = 'erkannt'),
    count(*) filter (where status = 'zu_pruefen'),
    coalesce(sum(amount_gross), 0)
  from public.v_belege_list
  where (p_q is null or fts @@ websearch_to_tsquery('german', p_q))
    and (p_gesellschaft is null or company_code = p_gesellschaft)
    and (p_objekt is null or property_code = p_objekt)
    and (p_belegart is null or document_type = p_belegart)
    and (
      p_zahlung is null
      or (p_zahlung = 'bezahlt' and paid_at is not null)
      or (p_zahlung = 'offen'   and paid_at is null)
    )
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis);
$$;

grant execute on function public.belege_kpis(text, text, text, text, text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Function: distinct filter-option lists over the whole non-deleted table
-- ---------------------------------------------------------------------------
create or replace function public.belege_facets()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'objekt_codes', (
      select coalesce(jsonb_agg(distinct property_code order by property_code)
                        filter (where property_code is not null), '[]'::jsonb)
      from public.v_belege_list
    ),
    'belegarten', (
      select coalesce(jsonb_agg(distinct document_type order by document_type)
                        filter (where document_type is not null), '[]'::jsonb)
      from public.v_belege_list
    ),
    'months', (
      select coalesce(jsonb_agg(distinct to_char(document_date, 'YYYY-MM')
                                order by to_char(document_date, 'YYYY-MM') desc)
                        filter (where document_date is not null), '[]'::jsonb)
      from public.v_belege_list
    ),
    'years', (
      select coalesce(jsonb_agg(distinct to_char(document_date, 'YYYY')
                                order by to_char(document_date, 'YYYY') desc)
                        filter (where document_date is not null), '[]'::jsonb)
      from public.v_belege_list
    )
  );
$$;

grant execute on function public.belege_facets() to authenticated;

-- ---------------------------------------------------------------------------
-- Supporting indexes (additive; speed up the paged filters/sorts)
-- ---------------------------------------------------------------------------
create index if not exists idx_belege_live_created on public.invoices (created_at desc) where deleted_at is null;
create index if not exists idx_belege_gesellschaft_code on public.invoices (company_code);
create index if not exists idx_belege_objekt_code on public.invoices (property_code);
create index if not exists idx_belege_status on public.invoices (status);
create index if not exists idx_belege_belegart on public.invoices (document_type);
create index if not exists idx_belege_beleg_datum on public.invoices (document_date);
create index if not exists idx_belege_bezahlt_am on public.invoices (paid_at);

commit;
