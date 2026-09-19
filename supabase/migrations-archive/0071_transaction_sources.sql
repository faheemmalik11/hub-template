-- 0071_transaction_sources — bank_transactions becomes the single source of truth for every
-- transaction, whatever produced it.
--
-- The client confirmed three inflows (communication thread 4):
--   * banksapi — company bank accounts AND company credit cards
--   * pleo     — employee credit cards
--   * manual   — XML/CSV/Excel upload for accounts BANKSapi cannot reach
--
-- Matching, OPOS, reporting, trash and auto-categorisation all query bank_transactions (20 SQL
-- references, 6 src files, 2 foreign keys). A per-provider table would need a second code path
-- for each, and a union view cannot carry the FK invoice_transaction_matches depends on.
--
-- SCHEMA ONLY. The one-time migration of the legacy pleo_* tables lives in
-- scripts/one-off/2026-08-04-pleo-into-bank-transactions.sql -- it applies to this database
-- alone, so it does not belong in the chain every environment replays.

begin;

-- ---------------------------------------------------------------------------
-- 1. Discriminator + per-source dedup key
-- ---------------------------------------------------------------------------
alter table public.bank_transactions
  add column if not exists source text not null default 'banksapi';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bank_transactions_source_check') then
    alter table public.bank_transactions
      add constraint bank_transactions_source_check
      check (source in ('banksapi', 'pleo', 'manual'));
  end if;
end $$;

-- The provider's own id. BANKSapi rows keep using banksapi_hash; pleo/manual rows have no
-- hash, so they dedup on (source, external_id).
alter table public.bank_transactions
  add column if not exists external_id text;

-- banksapi_hash is BANKSapi's dedup key and cannot exist for other sources.
alter table public.bank_transactions
  alter column banksapi_hash drop not null;

-- account_id/connection_id model a BANKSapi bank access. A Pleo employee card belongs to no
-- such access, and a manual CSV import has no connection at all -- so both become optional.
-- BANKSapi rows are unaffected: the sync always sets them.
alter table public.bank_transactions alter column account_id    drop not null;
alter table public.bank_transactions alter column connection_id drop not null;

create unique index if not exists bank_transactions_source_external_idx
  on public.bank_transactions (source, external_id)
  where external_id is not null;

create index if not exists bank_transactions_source_idx
  on public.bank_transactions (source);

comment on column public.bank_transactions.source is
  'Where the transaction came from: banksapi (bank accounts + company cards), pleo (employee '
  'cards), manual (XML/CSV/Excel upload). bank_transactions is the single source of truth for '
  'all three -- matching, OPOS and reporting never branch on provider.';
comment on column public.bank_transactions.external_id is
  'The provider''s own transaction id. Dedup key for pleo/manual rows (banksapi uses banksapi_hash).';
commit;
