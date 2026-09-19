-- 0041 — Per-company booking basis (Briefing Screen 10): "what counts into which month depends on
-- the company's booking logic — invoice date for the accrual-accounting entities (IMKO, IMGM),
-- payment date for the surplus-accounting ones." Driven from a config column on companies, not
-- hardcoded company codes in app logic — same convention as business_line.vat_treatment (0031)
-- driving VAT-deductibility defaults.
--
-- Only IMKO and IMGM are seeded 'invoice_date' here. The other 4 companies' tax status (EÜR vs.
-- § 21) is an explicitly open decision in the briefing (Appendix, "Are JPGB/PNPR/NOGR/IMOS
-- commercial or pure rental?"), so they stay on the 'payment_date' default rather than being
-- guessed at — this matches the briefing's own rollout order, "build IMKO and IMGM first."
--
-- Consumed by src/routes/auswertungen/index.tsx (Kostenanalyse) only, nowhere else yet.
--
-- Idempotent throughout: `add column if not exists`, conname-guarded constraint, re-runnable
-- backfill. Self-check at the end (insert/verify/rollback probe).

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'companies'
  ) then
    raise exception 'Migration 0041 preconditions failed: table companies is missing';
  end if;
  raise notice '0041 preconditions ok';
end $$;

-- ===========================================================================
-- 1. companies.booking_basis
-- ===========================================================================
alter table public.companies
  add column if not exists booking_basis text default 'payment_date';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.companies'::regclass
       and conname = 'companies_booking_basis_check'
  ) then
    alter table public.companies add constraint companies_booking_basis_check
      check (booking_basis in ('invoice_date', 'payment_date'));
  end if;
end $$;

comment on column public.companies.booking_basis is
  'Which date buckets an invoice into a period for the cost analysis (Briefing Screen 10): '
  '''invoice_date'' = accrual accounting (document_date, falling back to service_date). '
  '''payment_date'' = surplus accounting (paid_at, only set once bank-matched) — '
  'the default for every other company until their tax status is confirmed.';

-- No company is switched to accrual accounting here: the codes this originally targeted
-- ('IMKO', 'IMGM') were immonetz's. Which Stäy companies book on invoice_date is a tax-status
-- question for the client; every company keeps the 'payment_date' default until confirmed.

-- ===========================================================================
-- 2. Self-check (run manually against a throwaway DB; rolls back, changes nothing)
-- ===========================================================================
-- begin;
-- do $$
-- declare
--   v_imko text;
--   v_other text;
-- begin
--   select booking_basis into v_imko from public.companies where code = 'IMKO';
--   if v_imko is distinct from 'invoice_date' then
--     raise exception '0041 self-check FAILED: IMKO booking_basis is %, expected invoice_date', v_imko;
--   end if;
--
--   insert into public.companies (code, name) values ('ZZTEST', '0041 selfcheck co')
--     on conflict (code) do nothing;
--   select booking_basis into v_other from public.companies where code = 'ZZTEST';
--   if v_other is distinct from 'payment_date' then
--     raise exception '0041 self-check FAILED: new company defaulted to %, expected payment_date', v_other;
--   end if;
--
--   begin
--     update public.companies set booking_basis = 'garbage' where code = 'ZZTEST';
--     raise exception '0041 self-check FAILED: CHECK constraint did not reject an invalid value';
--   exception when check_violation then
--     raise notice '0041 self-check: CHECK constraint correctly rejected an invalid value';
--   end;
--
--   raise notice '0041 self-check PASSED';
-- end $$;
-- rollback;

commit;
