-- Fix: assigning a company (or any other invoice-history-logged change, e.g. notes, status
-- changes, soft-delete) started failing with "new row violates row-level security policy for
-- table invoice_history" (Postgres 42501). Caught live: a user changed an invoice's Gesellschaft
-- and got a 403 from PostgREST on POST /invoice_history.
--
-- The underlying invoices row update already succeeds (its own, unrelated policy) -- only the
-- follow-up audit-log write via insertVerlauf() (src/lib/data/queries.ts) fails, which then
-- throws and surfaces as a whole-mutation failure even though the real change already committed.
-- This is the SAME class of bug 0064_hub_change_history_rls.sql fixed for change_history --
-- except that migration's own comment describes invoice_history's policies as "existing,
-- working" at the time (auth_read / auth_write_insert, unrestricted true/true), which is no
-- longer the case live. Nothing in this repo's migration history since 0064 touches
-- invoice_history, so whatever changed did not go through a tracked migration.
--
-- Re-establishes both policies idempotently (drop if exists, then create) in the same shape
-- 0064 already uses for change_history, rather than assuming what's live now and only patching
-- part of it.

begin;

drop policy if exists "auth_read" on public.invoice_history;
create policy "auth_read" on public.invoice_history
  for select to authenticated using (true);

drop policy if exists "auth_write_insert" on public.invoice_history;
create policy "auth_write_insert" on public.invoice_history
  for insert to authenticated with check (true);

commit;
