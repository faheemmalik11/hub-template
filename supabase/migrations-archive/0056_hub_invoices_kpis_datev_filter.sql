-- 0043_invoices_kpis_datev_filter.sql
-- invoices_kpis (migration 0042) never learned about the DATEV-handover filter: its parameter
-- list was carried over unchanged from the pre-DATEV original (migration 0010's belege_kpis), so
-- selecting "an DATEV übergeben" / "offen" on /eingangsrechnungen narrows the list but leaves the
-- KPI tiles (Belege gesamt, Zu prüfen, Volumen) showing the UNFILTERED counts — the tiles and the
-- list visibly disagree. Same root cause the DATEV list filter itself hit before 0042: a filter
-- dimension the RPC signature simply doesn't know about yet.
--
-- Adds p_datev ('uebergeben' | 'offen' | null), applied the same way the front end already
-- applies it to the list query (applyBelegeFilter in queries.ts): 'uebergeben' -> handed over,
-- 'offen' -> not yet, null -> no filter.
--
-- Idempotent: drop + create (adding a parameter changes the function's identity/signature).

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'datev_handed_over_at')
  then
    raise exception '0043 preconditions failed: invoices.datev_handed_over_at is missing '
      '(migration 0038 not applied yet?). Stopping before changing anything.';
  end if;
  raise notice '0043 preconditions ok';
end $$;

drop function if exists public.invoices_kpis(text, text, text, text, text, date, date);

create or replace function public.invoices_kpis(
  p_q            text default null,
  p_gesellschaft text default null,
  p_objekt       text default null,
  p_belegart     text default null,
  p_zahlung      text default null,
  p_von          date default null,
  p_bis          date default null,
  p_datev        text default null
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
    and (
      p_datev is null
      or (p_datev = 'uebergeben' and datev_handed_over_at is not null)
      or (p_datev = 'offen'      and datev_handed_over_at is null)
    )
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis)
    and archived_at is null
    and not_relevant_at is null;
$$;

grant execute on function public.invoices_kpis(text, text, text, text, text, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check (run manually against a throwaway DB; rolls back, changes nothing)
-- ---------------------------------------------------------------------------
-- begin;
-- do $$
-- declare
--   v_supplier uuid;
--   v_handed record;
--   v_open record;
-- begin
--   insert into public.suppliers (name) values ('0043 Selfcheck GmbH') returning id into v_supplier;
--   insert into public.invoices (supplier_id, issuer, status, amount_gross, company_code, datev_handed_over_at)
--     values (v_supplier, '0043 Selfcheck GmbH', 'erkannt', 10, 'IMKO', now());
--   insert into public.invoices (supplier_id, issuer, status, amount_gross, company_code, datev_handed_over_at)
--     values (v_supplier, '0043 Selfcheck GmbH', 'erkannt', 20, 'IMKO', null);
--
--   select * into v_handed from public.invoices_kpis(null, 'IMKO', null, null, null, null, null, 'uebergeben');
--   if v_handed.total <> 1 or v_handed.volumen <> 10 then
--     raise exception '0043 self-check FAILED: uebergeben filter returned total=%, volumen=%', v_handed.total, v_handed.volumen;
--   end if;
--
--   select * into v_open from public.invoices_kpis(null, 'IMKO', null, null, null, null, null, 'offen');
--   if v_open.total <> 1 or v_open.volumen <> 20 then
--     raise exception '0043 self-check FAILED: offen filter returned total=%, volumen=%', v_open.total, v_open.volumen;
--   end if;
--
--   raise notice '0043 self-check PASSED';
-- end $$;
-- rollback;

commit;
