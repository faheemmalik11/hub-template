-- invoices_kpis (migration 0042, extended by 0043/0056 for the DATEV filter) never learned about
-- the workflow-status filter added to the Incoming Invoices list (applyBelegeFilter in queries.ts,
-- 2026-08-12): picking a Workflow value in the "Filters" popover narrows the list but leaves the
-- KPI tiles (Belege gesamt, Erkannt, Zu prüfen, Volumen) showing the UNFILTERED counts — same root
-- cause 0043 fixed for p_datev, one filter dimension later.
--
-- Adds p_workflow (any real workflow_status value, or null for no filter), applied the same way
-- applyBelegeFilter already applies it to the list/kanban queries: `workflow_status = p_workflow`.
--
-- Idempotent: drop + create (adding a parameter changes the function's identity/signature).

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'workflow_status')
  then
    raise exception '20260812170000 preconditions failed: invoices.workflow_status is missing. '
      'Stopping before changing anything.';
  end if;
  raise notice '20260812170000 preconditions ok';
end $$;

drop function if exists public.invoices_kpis(text, text, text, text, text, date, date, text);

create or replace function public.invoices_kpis(
  p_q            text default null,
  p_gesellschaft text default null,
  p_objekt       text default null,
  p_belegart     text default null,
  p_zahlung      text default null,
  p_von          date default null,
  p_bis          date default null,
  p_datev        text default null,
  p_workflow     text default null
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
    and (p_workflow is null or workflow_status = p_workflow)
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis)
    and archived_at is null
    and not_relevant_at is null;
$$;

grant execute on function public.invoices_kpis(text, text, text, text, text, date, date, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check (run manually against a throwaway DB; rolls back, changes nothing)
-- ---------------------------------------------------------------------------
-- begin;
-- do $$
-- declare
--   v_supplier uuid;
--   v_received record;
--   v_paid record;
-- begin
--   insert into public.suppliers (name) values ('20260812170000 Selfcheck GmbH') returning id into v_supplier;
--   insert into public.invoices (supplier_id, issuer, status, amount_gross, company_code, workflow_status)
--     values (v_supplier, '20260812170000 Selfcheck GmbH', 'erkannt', 10, 'IMKO', 'eingegangen');
--   insert into public.invoices (supplier_id, issuer, status, amount_gross, company_code, workflow_status)
--     values (v_supplier, '20260812170000 Selfcheck GmbH', 'erkannt', 20, 'IMKO', 'bezahlt');
--
--   select * into v_received from public.invoices_kpis(null, 'IMKO', null, null, null, null, null, null, 'eingegangen');
--   if v_received.total <> 1 or v_received.volumen <> 10 then
--     raise exception '20260812170000 self-check FAILED: eingegangen filter returned total=%, volumen=%', v_received.total, v_received.volumen;
--   end if;
--
--   select * into v_paid from public.invoices_kpis(null, 'IMKO', null, null, null, null, null, null, 'bezahlt');
--   if v_paid.total <> 1 or v_paid.volumen <> 20 then
--     raise exception '20260812170000 self-check FAILED: bezahlt filter returned total=%, volumen=%', v_paid.total, v_paid.volumen;
--   end if;
--
--   raise notice '20260812170000 self-check PASSED';
-- end $$;
-- rollback;

commit;
