-- 20260819120000_protokoll_rls_scope.sql
--
-- NOT YET APPLIED TO ANY DATABASE. Written as part of the Protokoll audit fixes
-- (docs/audit/protokoll/processing-log/ISSUES.md #1 and #10) and left for a deliberate `db push`,
-- because both statements below TAKE VISIBILITY AWAY from roles that have it today. On a live
-- database that is a change someone has to choose, not one a fix should make on its way past.
--
-- ---------------------------------------------------------------------------------------------
-- #1  processing_log is readable by every authenticated user, for every company
-- ---------------------------------------------------------------------------------------------
--
-- The table has exactly one policy, `auth_read: SELECT to authenticated using (true)`, with no
-- has_company_access() anywhere -- while every comparable table is scoped (invoices and
-- manual_bookings both go through has_company_access(company_id)).
--
-- The rows are not innocuous metadata. Live examples from the DEV database: third-party sender
-- addresses carrying personal names ("Linda Spiegelberg | Immobilienverwaltung Walther GmbH & Co.
-- KG" <lsp@immo-walther.de>), subject lines naming a customer's contract and cancellation request,
-- and reasons quoting invoice numbers and gross amounts. An assistant restricted to one company
-- could read all of it, for all companies.
--
-- WHY THIS IS A ROLE GATE AND NOT has_company_access():
--
-- processing_log has no company_id column. Verified against the live payload, not the generated
-- types: the columns are id, processed_at, gmail_message_id, sender, subject, status, reason,
-- invoice_id. The only route to a company is invoice_id -> invoices.company_id, and that route does
-- not exist for the rows that matter most -- of 127 live rows, 79 have no invoice_id at all, and
-- those ARE the rejected mails whose subjects and senders are the sensitive part. A company-scoped
-- policy would therefore either hide nothing (leave the NULL rows open, i.e. no fix) or hide the
-- whole rejection log from everyone (and the screen's entire purpose with it).
--
-- So the honest enforcement, until the pipeline stamps a company onto every log row, is by role:
-- the same set the menu entry is now gated to in app-shell.tsx, so the UI and the database agree
-- rather than the UI merely hiding a door that is still unlocked.
--
-- The proper fix is a company_id on processing_log, written by the pipeline at ingest time from the
-- same resolution step that already decides the invoice's company (and the NZO catch-all when it
-- cannot). Then this policy becomes
--   using (public.has_company_access(company_id))
-- and the role gate can go. That belongs in the pipeline repo, not here.

begin;

drop policy if exists "auth_read" on public.processing_log;

create policy "read_non_assistant" on public.processing_log
  for select to authenticated
  using (public.current_role_name() in ('admin', 'super_admin', 'supervisor'));

-- ---------------------------------------------------------------------------------------------
-- #10  change_history: any authenticated user can forge a trail entry as anyone
-- ---------------------------------------------------------------------------------------------
--
-- Migration 0051 gave change_history `auth_read using (true)` and `auth_write_insert with check
-- (true)`, mirroring invoice_history. The read half was fine when nothing surfaced the table; it now
-- has a screen (the Protokoll "Änderungen" tab), so it is scoped to the same roles as the screen.
--
-- The write half is the real hole: `with check (true)` means a client can insert a change_history
-- row with ANY `actor`, i.e. attribute a role change or a deletion to a colleague. Restricting the
-- insert outright would break legitimate paths -- insertChangeHistory() runs from about a dozen
-- client mutations, and not all of them are admin-only (useConfirmOutgoingMatch and
-- useRejectOutgoingMatch are ordinary bookkeeping actions).
--
-- So the constraint is on the CLAIM rather than on the right: you may write to the trail, but only
-- as yourself. actorEmail() already fills `actor` with the caller's own address, so every existing
-- call site satisfies this unchanged. NULL is still allowed -- restore_record()/purge_record() write
-- from SECURITY DEFINER functions and bypass RLS entirely, but a client row with no actor is an
-- anonymous entry, not an impersonated one, and rejecting it would break callers for no gain in
-- integrity.

drop policy if exists "auth_read" on public.change_history;

create policy "read_non_assistant" on public.change_history
  for select to authenticated
  using (public.current_role_name() in ('admin', 'super_admin', 'supervisor'));

drop policy if exists "auth_write_insert" on public.change_history;

create policy "insert_as_self" on public.change_history
  for insert to authenticated
  with check (
    actor is null
    or lower(actor) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

commit;

-- Self-check. Run after applying; each should return the policy shape described above.
--
--   select polname, pg_get_expr(polqual, polrelid) as using_expr,
--          pg_get_expr(polwithcheck, polrelid) as check_expr
--     from pg_policy
--    where polrelid in ('public.processing_log'::regclass, 'public.change_history'::regclass)
--    order by polrelid::text, polname;
--
-- And the behavioural check that matters, as a non-admin (supervisor is allowed, an assistant is
-- not): GET /rest/v1/processing_log?select=id&limit=1 must return [] for an assistant account and
-- rows for an admin.
