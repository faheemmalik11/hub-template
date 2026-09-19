-- 20260819130000_manual_bookings_write_scope.sql
-- Manual bookings: close the write hole, give the figures an audit trail, and make the
-- "invisible booking" state unrepresentable.
--
-- Covers docs/audit/manuelle-buchungen/manual-bookings/ISSUES.md #2, #3 and the data half of #5.
--
-- #2 -- The table's RLS was asymmetric. SELECT was correctly scoped to
--    has_company_access(company_id), but INSERT's WITH CHECK and UPDATE's USING *and* WITH CHECK
--    were all a bare `true`:
--
--      manual_bookings_select  SELECT  qual = has_company_access(company_id)
--      manual_bookings_insert  INSERT  with_check = true
--      manual_bookings_update  UPDATE  qual = true, with_check = true
--
--    So any authenticated user -- including the assistant role, which this app's own code
--    elsewhere describes as "only prepares/forwards", never approves -- could create a booking
--    against any company's P&L, and could modify or soft-delete ANY existing booking, including
--    rows the same policy set forbade them from reading. Soft delete is an UPDATE here, so the
--    delete path was covered by the same hole. Manual bookings feed the Kostenanalyse on equal
--    footing with receipts, so this was a write path straight into the management figures.
--
--    Identical on all three Hubs (Immonetz, Stäy, Eiffler), verified against pg_policies before
--    writing this.
--
--    has_company_access() is the right gate rather than a new can_write flag: it already decides
--    what a person may SEE here, it denies deactivated accounts first, and it treats "no grants
--    recorded" as unrestricted -- which is what the Team screen means by an empty company list,
--    so this does not narrow anybody's access today. Writing where you cannot read was the bug.
--
-- #3 -- An edit left no trace of who made it or what the value was before. The table has
--    created_by but no updated_by, and nothing wrote a change_history row. Measured before this
--    migration: `select count(*) from change_history where table_name = 'manual_bookings'` -> 0,
--    against bookings that had been created, edited and deleted. updated_by is added here; the
--    change_history rows are written by the client alongside the mutation, the same convention
--    restore_record()/purge_record() and useUpdateEmployeeRole() already follow.
--
-- #5 -- A recurring booking whose recurrence_until precedes its period expands to zero months in
--    EVERY year (generate_series with start > stop returns no rows), so it never rendered on the
--    screen -- and because edit and delete both hang off a rendered row, it could never be
--    corrected or removed from the UI. It simply sat in the table, counted by nothing and visible
--    to no one. The CHECK makes that state impossible to store at all; the create dialog also
--    validates it, so the constraint is a backstop rather than the error path a user meets.
--    Verified 0 violating rows on all three Hubs before adding it.

begin;

alter table public.manual_bookings
  add column if not exists updated_by text;

comment on column public.manual_bookings.updated_by is
  'Who last edited this booking. created_by existed; this is its missing counterpart -- an edit '
  'to an amount that feeds the P&L used to leave only updated_at behind.';

alter table public.manual_bookings
  drop constraint if exists manual_bookings_recurrence_until_after_period;
alter table public.manual_bookings
  add constraint manual_bookings_recurrence_until_after_period
  check (recurrence_until is null or recurrence_until >= period);

drop policy if exists "manual_bookings_insert" on public.manual_bookings;
create policy "manual_bookings_insert" on public.manual_bookings
  for insert to authenticated
  with check (public.has_company_access(company_id));

drop policy if exists "manual_bookings_update" on public.manual_bookings;
create policy "manual_bookings_update" on public.manual_bookings
  for update to authenticated
  using (public.has_company_access(company_id))
  with check (public.has_company_access(company_id));

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually):
--
--   -- all three policies scoped, none left as a bare `true`
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'manual_bookings';
--
--   -- the constraint rejects an end before the start
--   insert into public.manual_bookings (company_id, category_id, period, amount, is_recurring,
--                                       recurrence_until)
--   select company_id, category_id, '2026-06-01', 1, true, '2026-03-01'
--     from public.manual_bookings limit 1;   -- must fail on
--                                            -- manual_bookings_recurrence_until_after_period
