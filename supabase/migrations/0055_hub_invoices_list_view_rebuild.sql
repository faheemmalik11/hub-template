-- 0042_invoices_list_view_rebuild.sql
-- Rebuilds the invoice-list read surface (Screen 1: /eingangsrechnungen) from scratch, against
-- the CURRENT English-renamed schema, because its previous definitions are not, and never were,
-- in this repo's tracked history.
--
-- WHAT WAS ACTUALLY BROKEN (found while debugging "DATEV filter shows nothing" +
-- "please apply migration 0010")
--
-- Migration 0010 (v_belege_list / belege_kpis / belege_facets) is dead code: it targets
-- public.belege / public.lieferanten, the pre-rename German table names that no longer exist
-- (renamed to invoices/suppliers directly on the live DB, outside any tracked migration — see
-- 0025's own precondition comment). The current front end does not call any of those three
-- objects any more; the "please apply migration 0010" banner is a stale error-message string
-- that no longer matches what the app actually depends on.
--
-- What src/lib/data/queries.ts (useBelegeListe/useBelegeKpis/useBelegeFacets) actually reads is
-- v_invoices_review, invoices_kpis, invoices_facets. Of those:
--   * v_invoices_review (migration 0025) is a thin wrapper around a base view, v_invoices_list,
--     that is NOT DEFINED ANYWHERE IN THIS REPO — per 0025's own comment, it was hand-recreated
--     directly on the live database during the untracked "migrations 0017..0022" gap, and 0025
--     deliberately wraps it rather than rebuilding it blind.
--   * invoices_kpis / invoices_facets have NO definition anywhere in this repo at all.
-- On any database that never had that hand-made v_invoices_list (a fresh project, a dev/sandbox
-- instance, a disaster-recovery restore), all of this is simply missing, and every query against
-- it fails with "relation/column does not exist" — which the front end's generic backend-missing
-- detector (isBackendMissing() in eingangsrechnungen/index.tsx) catches and mislabels as
-- "apply migration 0010", because it pattern-matches on generic Postgres error text, not on
-- which specific object is actually gone.
--
-- The specific "DATEV filter shows nothing" symptom: 0025's wrapper only backfills the columns
-- that were missing from v_invoices_list AS OF 0025. Migration 0038 (DATEV handover) added
-- datev_handed_over_at/datev_batch_id to invoices AFTER 0025 was written, so the wrapper never
-- learned about them -- filtering on datev_handed_over_at against a v_invoices_list that predates
-- it throws "column does not exist", caught by the same generic detector above. The same latent
-- bug exists for every invoices column added after 0025 (category_id, vat_deductible_pct, ...).
--
-- THE FIX
--
-- v_invoices_list is redefined as `select i.*, ...` (matching 0010's original intent) so it can
-- never go frozen/stale like this again -- every future column on invoices is included
-- automatically, with no per-migration patch list to maintain. v_invoices_review keeps its name
-- (the front end already queries it) but is now a plain passthrough, since v_invoices_list itself
-- carries everything. invoices_kpis/invoices_facets are (re)authored against the current schema,
-- reusing exactly the pruef_score/review_score formula already documented client-side in
-- src/lib/data/format.ts (pruefGruende/pruefScore) so this migration is not guessing at scoring
-- logic that already has a real, current specification.
--
-- Also restores a rule the direct-read hook (useBelege in queries.ts) already documents as
-- something v_invoices_list is expected to do: exclude status='aufgeteilt' container rows (the
-- original full scan behind a split multi-receipt upload, migration 0009/0020) from the list.
--
-- Idempotent: drops + recreates (the column list changes, so CREATE OR REPLACE VIEW cannot be
-- used -- same reasoning as migration 0015), safe to rerun.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
  v_col     text;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'invoices')
  then v_missing := v_missing || 'relation public.invoices'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'suppliers')
  then v_missing := v_missing || 'relation public.suppliers'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '0042 preconditions failed, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;

  foreach v_col in array array[
    'id', 'deleted_at', 'status', 'validation', 'extracted', 'issuer', 'supplier_id',
    'company_code', 'property_code', 'document_type', 'document_date', 'amount_gross',
    'paid_at', 'traffic_light', 'archived_at', 'not_relevant_at', 'created_at', 'fts'
  ]
  loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'invoices'
                      and column_name = v_col)
    then v_missing := v_missing || ('column invoices.' || v_col); end if;
  end loop;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'suppliers' and column_name = 'name')
  then v_missing := v_missing || 'column suppliers.name'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '0042 preconditions failed, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;

  -- datev_handed_over_at (0038) is read by the front end's DATEV filter but not required for
  -- this migration to proceed -- warn instead of blocking, since v_invoices_list still helps
  -- everything else even if 0038 has not been applied yet on this database.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'datev_handed_over_at')
  then
    raise warning '0042: invoices.datev_handed_over_at is missing (migration 0038 not applied '
      'yet?) -- the DATEV filter will still fail until that migration runs, even after this one.';
  end if;

  raise notice '0042 preconditions ok';
end $$;

-- ===========================================================================
-- 1. v_invoices_list -- the base view, rebuilt to select i.* so it can never freeze again
-- ===========================================================================
drop view if exists public.v_invoices_review;
drop view if exists public.v_invoices_list;

drop view if exists public.v_invoices_list;
create view public.v_invoices_list with (security_invoker = on) as
select
  i.*,
  coalesce(s.name, i.issuer) as issuer_sort,
  (
      case when (i.validation ->> 'brutto_vorhanden') = 'false' then 10 else 0 end
    + case when (i.validation ->> 'steller_vorhanden') = 'false' then 10 else 0 end
    + case when (i.validation ->> 'summe_ok') = 'false' then 10 else 0 end
    + case when (i.validation ->> 'ust_satz_ok') = 'false' then 10 else 0 end
    + case when (i.validation ->> 'iban_ok') = 'false' then 10 else 0 end
    + case when (i.validation ->> 'datum_plausibel') = 'false' then 10 else 0 end
    + case when coalesce(i.validation ->> 'is_small_amount', '') <> 'true'
                and (i.validation ->> 'rechnungsnr_vorhanden') = 'false' then 10 else 0 end
    + case when coalesce(i.validation ->> 'is_small_amount', '') <> 'true'
                and (i.validation ->> 'datum_vorhanden') = 'false' then 10 else 0 end
    + case when i.status = 'zu_pruefen' then 5 else 0 end
    + case
        when (
          select min(v::numeric)
          from jsonb_each_text(coalesce(i.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
          where v ~ '^[0-9.]+$'
        ) < 0.8 then 3
        when (
          select min(v::numeric)
          from jsonb_each_text(coalesce(i.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
          where v ~ '^[0-9.]+$'
        ) < 0.95 then 1
        else 0
      end
  )::int as review_score
from public.invoices i
left join public.suppliers s on s.id = i.supplier_id
-- Container rows of a split multi-receipt scan hold the original file for the audit trail but
-- are not invoices themselves (their children carry the real data) -- excluded here so every
-- consumer of this view (list, KPIs, facets) agrees with the direct-read useBelege() hook, which
-- already documents this exact exclusion (queries.ts).
where i.deleted_at is null
  and i.status <> 'aufgeteilt';

grant select on public.v_invoices_list to authenticated;

-- ===========================================================================
-- 2. v_invoices_review -- kept as its own name (the front end queries it by name), now a plain
--    passthrough since v_invoices_list itself already carries every column via i.*.
-- ===========================================================================
drop view if exists public.v_invoices_review;
create view public.v_invoices_review with (security_invoker = on) as
select * from public.v_invoices_list;

grant select on public.v_invoices_review to authenticated;

-- ===========================================================================
-- 3. invoices_kpis -- filter-aware KPI counts + gross sum (deliberately ignores the status
--    filter, so the KPI cards keep working as status toggles -- same contract as old belege_kpis).
-- ===========================================================================
drop function if exists public.invoices_kpis(text, text, text, text, text, date, date);

create or replace function public.invoices_kpis(
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
  from public.v_invoices_review
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
    and (p_bis is null or document_date <= p_bis)
    and archived_at is null
    and not_relevant_at is null;
$$;

grant execute on function public.invoices_kpis(text, text, text, text, text, date, date) to authenticated;

-- ===========================================================================
-- 4. invoices_facets -- distinct filter-option lists over the whole non-deleted, non-archived,
--    non-"nicht relevant" table.
-- ===========================================================================
drop function if exists public.invoices_facets();

create or replace function public.invoices_facets()
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
      from public.v_invoices_review
      where archived_at is null and not_relevant_at is null
    ),
    'belegarten', (
      select coalesce(jsonb_agg(distinct document_type order by document_type)
                        filter (where document_type is not null), '[]'::jsonb)
      from public.v_invoices_review
      where archived_at is null and not_relevant_at is null
    ),
    'months', (
      select coalesce(jsonb_agg(distinct to_char(document_date, 'YYYY-MM')
                                order by to_char(document_date, 'YYYY-MM') desc)
                        filter (where document_date is not null), '[]'::jsonb)
      from public.v_invoices_review
      where archived_at is null and not_relevant_at is null
    ),
    'years', (
      select coalesce(jsonb_agg(distinct to_char(document_date, 'YYYY')
                                order by to_char(document_date, 'YYYY') desc)
                        filter (where document_date is not null), '[]'::jsonb)
      from public.v_invoices_review
      where archived_at is null and not_relevant_at is null
    )
  );
$$;

grant execute on function public.invoices_facets() to authenticated;

-- ===========================================================================
-- 5. Supporting indexes on the current column names (0010's were written against the pre-rename
--    table/columns and never took effect)
-- ===========================================================================
create index if not exists idx_invoices_live_created on public.invoices (created_at desc) where deleted_at is null;
create index if not exists idx_invoices_company_code on public.invoices (company_code);
create index if not exists idx_invoices_property_code on public.invoices (property_code);
create index if not exists idx_invoices_status on public.invoices (status);
create index if not exists idx_invoices_document_type on public.invoices (document_type);
create index if not exists idx_invoices_document_date on public.invoices (document_date);
create index if not exists idx_invoices_paid_at on public.invoices (paid_at);

-- ===========================================================================
-- 6. Self-check (run manually against a throwaway DB; rolls back, changes nothing)
-- ===========================================================================
-- begin;
-- do $$
-- declare
--   v_supplier uuid;
--   v_invoice  uuid;
--   v_row      record;
--   v_kpi      record;
-- begin
--   insert into public.suppliers (name) values ('0042 Selfcheck GmbH') returning id into v_supplier;
--   insert into public.invoices (
--     supplier_id, issuer, status, amount_gross, company_code, property_code, document_type,
--     document_date, validation, extracted, datev_handed_over_at
--   ) values (
--     v_supplier, '0042 Selfcheck GmbH', 'zu_pruefen', 100.00, 'IMKO', 'KLMUE4', 'Eingangsrechnung',
--     current_date,
--     '{"brutto_vorhanden": true, "steller_vorhanden": true, "summe_ok": true, "ust_satz_ok": true,
--       "iban_ok": true, "datum_plausibel": true, "rechnungsnr_vorhanden": false,
--       "datum_vorhanden": true, "kleinbetrag": false}'::jsonb,
--     '{"konfidenz": {"betrag": 0.99}}'::jsonb,
--     now()
--   ) returning id into v_invoice;
--
--   select * into v_row from public.v_invoices_review where id = v_invoice;
--   if v_row.issuer_sort is distinct from '0042 Selfcheck GmbH' then
--     raise exception '0042 self-check FAILED: issuer_sort wrong: %', v_row.issuer_sort;
--   end if;
--   if v_row.review_score <> 15 then -- 10 (rechnungsnr_fehlt) + 5 (zu_pruefen)
--     raise exception '0042 self-check FAILED: review_score = %, expected 15', v_row.review_score;
--   end if;
--   if v_row.datev_handed_over_at is null then
--     raise exception '0042 self-check FAILED: datev_handed_over_at not exposed by v_invoices_review';
--   end if;
--
--   -- The specific bug this migration fixes: filtering by datev_handed_over_at must not error.
--   perform 1 from public.v_invoices_review where datev_handed_over_at is not null and id = v_invoice;
--
--   select * into v_kpi from public.invoices_kpis(null, 'IMKO', null, null, null, null, null);
--   if v_kpi.zu_pruefen < 1 then
--     raise exception '0042 self-check FAILED: invoices_kpis did not count the seeded row';
--   end if;
--
--   perform public.invoices_facets();
--
--   raise notice '0042 self-check PASSED';
-- end $$;
-- rollback;

commit;
