-- 0051_change_history_rls.sql
-- change_history has RLS enabled but had ZERO policies -- every direct client insert into it
-- (insertChangeHistory() in src/lib/data/queries.ts, used by roughly a dozen mutations:
-- useConfirmOutgoingMatch, useRejectOutgoingMatch, useUpdateEmployeeRole, useSetCompanyAccess,
-- useSetEmployeeActive, and the new useSoftDeleteOutgoingInvoice) has been silently 403ing since
-- whenever this table was created, with RLS denying by default. Caught live: a user tried to
-- delete an outgoing invoice and got a 403 from PostgREST on POST /change_history (42501, "new
-- row violates row-level security policy"). The underlying row mutation in each of those call
-- sites already succeeds (it runs first, via its own already-correct RLS policy on its own
-- table) -- only the follow-up audit-log write was failing, which then threw and surfaced as a
-- whole-mutation failure to the user even though the real change had already committed. This
-- affected role changes, company-access grants, and employee activate/deactivate in /team too,
-- not just outgoing-invoice deletes -- same root cause, just not yet hit by a user until now.
--
-- restore_record()/purge_record() (migration 0046) never hit this: they write to change_history
-- from inside a SECURITY DEFINER function, which bypasses RLS. Only the direct client-side path
-- was broken.
--
-- Policy shape mirrors invoice_history's existing, working policies exactly (auth_read /
-- auth_write_insert, unrestricted `true`/`true`) -- change_history is the same kind of
-- write-once, read-many, actor-elsewhere audit log, just generic across every table instead of
-- being invoices-specific.

begin;

drop policy if exists "auth_read" on public.change_history;
create policy "auth_read" on public.change_history
  for select to authenticated using (true);

drop policy if exists "auth_write_insert" on public.change_history;
create policy "auth_write_insert" on public.change_history
  for insert to authenticated with check (true);

commit;
