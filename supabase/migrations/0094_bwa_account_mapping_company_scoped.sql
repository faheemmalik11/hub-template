-- 0094_bwa_account_mapping_company_scoped.sql
-- Adds a company dimension to bwa_account_mapping, porting the same schema change made on
-- immonetz (migration 20260807130000) after the client confirmed IMKO and IMGM use the same
-- DATEV account numbers but must be kept completely separate. The table as built by migration
-- 0043 is keyed only by (fiscal_year, account) — one global row per account number shared across
-- every company — which cannot support two companies with independent mappings for the same
-- account number.
--
-- Unlike immonetz, this table is seeded EMPTY here (0043's own comment: "seeded EMPTY") — no
-- chart-of-accounts data has been imported for any Stay company yet, so there is nothing to
-- backfill. The setup (schema + UI) lands ahead of the data, which arrives later per company via
-- the Kontenrahmen import screen.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'bwa_account_mapping'
  ) then
    raise exception '0094 expects bwa_account_mapping from migration 0043, which is missing';
  end if;
end $$;

alter table public.bwa_account_mapping
  add column if not exists company_id uuid references public.companies(id);

-- No backfill expected — see header. Fail loudly instead of guessing a company if this
-- assumption is ever wrong, rather than silently leaving rows on an arbitrary company.
do $$
declare v_total int;
begin
  select count(*) into v_total from public.bwa_account_mapping where company_id is null;
  if v_total > 0 then
    raise exception
      '0094: % existing bwa_account_mapping row(s) have no company_id — this migration assumed '
      'the table was empty (per 0043) and does not know which company to backfill them to. '
      'Backfill company_id manually, then re-run.', v_total;
  end if;
end $$;

alter table public.bwa_account_mapping
  alter column company_id set not null;

-- Replace the old (fiscal_year, account) uniqueness with (fiscal_year, account, company_id) — the
-- same account number is now allowed once PER COMPANY, not once globally. Not a partial index:
-- the Hub's `.upsert(rows, { onConflict: ... })` call emits a plain ON CONFLICT clause that must
-- match a non-partial index exactly.
drop index if exists public.bwa_account_mapping_year_account_uniq;
create unique index if not exists bwa_account_mapping_year_account_company_uniq
  on public.bwa_account_mapping (fiscal_year, account, company_id);
create index if not exists bwa_account_mapping_company on public.bwa_account_mapping (company_id);

comment on column public.bwa_account_mapping.company_id is
  'Which company this account-to-category mapping belongs to. Two companies can use the same '
  'account NUMBER but must never share a row — kept completely separate even when identical.';
comment on table public.bwa_account_mapping is
  'Category-to-DATEV-account mapping, keyed by (fiscal year, account, company) — DATEV rebuilds '
  'the chart of accounts every year, and different companies keep independent mappings even when '
  'the account numbers happen to match. Seeded empty (migration 0043); rows arrive per company '
  'via the Hub''s Kontenrahmen import screen.';

commit;
