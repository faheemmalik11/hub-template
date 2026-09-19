-- 20260902170000_bank_soft_delete_on_disconnect — disconnecting a bank hides what it delivered
-- instead of destroying it.
--
-- WHY SOFT AND NOT HARD. A hard delete of a connection's transactions takes their invoice matches
-- with them (invoice_transaction_matches.transaction_id is ON DELETE CASCADE) and leaves every
-- invoice those matches settled still marked paid, because the paid trigger is set-only and never
-- clears bezahlt_am. The conclusion outlives its own evidence, irreversibly. Soft-deleting keeps the
-- rows and the matches intact; they are simply no longer visible and no longer synced.
--
-- It also makes reconnecting the same bank work by itself. bank-sync already revives a soft-deleted
-- account when the bank delivers its IBAN again (the reuse branch clears deleted_at and logs
-- 'account_revived'), so the accounts come back with their company, their custom name and their
-- on/off flag intact, while the old transactions and log entries stay hidden and the newly
-- delivered movements are inserted alongside them.
--
-- WHERE IT IS ENFORCED. In the SELECT policies, not in the queries. bank_transactions is read from
-- a dozen places in the app and every one of them would have to remember the filter; a policy
-- covers the ones written after this migration too. The service role bypasses RLS, so bank-sync
-- still sees the hidden rows -- which is what it needs, both to keep its incremental cursor at the
-- true newest booking date and so ON CONFLICT (account_id, banksapi_hash) DO NOTHING still absorbs
-- a re-delivered movement instead of inserting a duplicate.
--
-- bank_accounts already carries the deleted_at/deleted_by/delete_reason trio from migration 0059,
-- and its readers filter in the query. Left as it is: other code reads soft-deleted accounts
-- deliberately (the trash/restore machinery), so a policy there would be a wider change than this.

begin;

-- Superseded. An earlier version of this migration marked the connection with its own column;
-- deleted_at says the same thing in the vocabulary the rest of the schema already uses.
alter table public.bank_connections drop column if exists disconnected_at;

alter table public.bank_transactions add column if not exists deleted_at timestamptz;
alter table public.bank_sync_logs   add column if not exists deleted_at timestamptz;
alter table public.bank_connections add column if not exists deleted_at timestamptz;
alter table public.bank_connections add column if not exists deleted_by text;

comment on column public.bank_transactions.deleted_at is
  'Set = hidden because its bank connection was disconnected. The row, its invoice matches and the '
  'paid marks they justify are all kept. Cleared by nothing: a reconnect imports new movements, it '
  'does not un-hide old ones.';
comment on column public.bank_connections.deleted_at is
  'Set = the BANKSapi access was deleted from the Hub. A reconnect creates a NEW connection row '
  'with a new access id; this one stays hidden as history.';

-- The interesting set is the live one, and after a disconnect the hidden set can be the larger.
create index if not exists bank_transactions_live_idx
  on public.bank_transactions (account_id) where deleted_at is null;
create index if not exists bank_sync_logs_live_idx
  on public.bank_sync_logs (connection_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- SELECT policies: same rule as before, plus "and not hidden".
-- ---------------------------------------------------------------------------
drop policy if exists "bank_transactions_select" on public.bank_transactions;
create policy "bank_transactions_select" on public.bank_transactions
  for select to authenticated
  using (public.has_company_access(company_id) and deleted_at is null);

drop policy if exists bank_connections_read on public.bank_connections;
create policy bank_connections_read on public.bank_connections
  for select to authenticated
  using (public.has_permission('page.bankverbindungen') and deleted_at is null);

drop policy if exists bank_sync_logs_read on public.bank_sync_logs;
create policy bank_sync_logs_read on public.bank_sync_logs
  for select to authenticated
  using (public.has_permission('page.bankverbindungen') and deleted_at is null);

commit;

-- Sanity after applying:
--   select count(*) from public.bank_transactions where deleted_at is not null;  -- 0 before any disconnect
--   Disconnect a sandbox bank, then confirm the accounts vanish from /bankkonten, the movements
--   vanish from /banktransaktionen, and select count(*) on the tables is UNCHANGED.
