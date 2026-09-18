-- 20260819160000_bank_connections_rls_scope.sql
-- bank_connections and bank_sync_logs are readable by every authenticated user.
--
-- Covers docs/audit/bankverbindungen/bank-connections/ISSUES.md #6 (Immonetz) / #5 (Stäy), both of
-- which flagged this as "read from the migrations, NOT verified live -- needs a pg_policies check
-- before being acted on". That check has now been done, on all three Hubs:
--
--   bank_connections  bank_connections_read  SELECT  qual = true
--   bank_sync_logs    bank_sync_logs_read    SELECT  qual = true
--
-- Both audits were right, and identically so on Immonetz, Stäy and Eiffler. The roles/access
-- migration re-scoped bank_accounts and bank_transactions to has_company_access(company_id) and
-- left these two behind; because neither table has a company_id, the omission does not show up in a
-- diff of the RLS section.
--
-- WHAT IS ACTUALLY EXPOSED -- more than the audits recorded:
--
-- bank_connections carries banksapi_access_id, banksapi_user, credential_ref and a metadata jsonb.
-- The BANKSapi credentials themselves stay server-side, so this is the access handles and the
-- banking relationship, not the key.
--
-- bank_sync_logs is worse, because the Hub RENDERS it. The sync-log panel's countsSummary() prints
-- every key of the `counts` jsonb as "<value> <label>", and bank-callback writes rows whose counts
-- are not counts at all. Live on the Stäy Hub:
--
--   event   = callback_received
--   message = 'bank-callback query: ?accessId=12f0a6e7-...&baReentry=ACCOUNT_CREATED'
--   counts  = {"accessId": "12f0a6e7-9fb5-4cc6-b284-b1e53ba39078", "baReentry": "ACCOUNT_CREATED"}
--
-- so the BANKSapi access id is printed verbatim in the Details column of a screen that, under
-- `using (true)`, every authenticated user can open -- including an assistant restricted to one
-- company. The panel side of that is fixed separately (countsSummary now renders only numeric
-- values, and the raw message is no longer shown to non-admins); this migration closes the
-- database side, which is the half that survives any UI change.
--
-- WHY A ROLE GATE AND NOT has_company_access():
--
-- Neither table has a company_id, and neither can get one meaningfully: a bank access is not owned
-- by one company (a single Sparkasse consent on the Stäy Hub delivers accounts belonging to four
-- different companies), and a sync-log row describes a run, not a company. So there is no column to
-- scope by, now or later -- unlike processing_log, where migration 20260819120000 could at least
-- name a future company_id as the proper fix.
--
-- The gate is therefore the same role set that migration already established for processing_log,
-- and that the nav now uses for this screen, so the UI and the database agree rather than the UI
-- hiding a door that is still unlocked:
--
--   current_role_name() in ('admin', 'super_admin', 'supervisor')
--
-- This TAKES VISIBILITY AWAY from the assistant role, which has it today. That is the intent.
--
-- Knock-on effect, checked before writing this: /bankkonten calls useBankConnections() for the
-- Kreditinstitut column, which falls back to the connection's bank_name. For an assistant that
-- query now returns zero rows, so the column falls back to "—" instead of the bank name. It does
-- not error (the hook returns [] and every read is optional-chained), and an assistant could not
-- see which bank feeds an account anyway once connections are hidden.

begin;

drop policy if exists "bank_connections_read" on public.bank_connections;
create policy "bank_connections_read" on public.bank_connections
  for select to authenticated
  using (public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']));

drop policy if exists "bank_sync_logs_read" on public.bank_sync_logs;
create policy "bank_sync_logs_read" on public.bank_sync_logs
  for select to authenticated
  using (public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']));

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually):
--
--   select tablename, policyname, cmd, qual
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('bank_connections', 'bank_sync_logs');
--
--   -- as an assistant, both must now return zero rows:
--   select count(*) from public.bank_connections;
--   select count(*) from public.bank_sync_logs;
