-- Adds approvers.app_user_id -- a real FK to app_users, requested explicitly in this session as
-- a first step on docs/ROLES_AND_ACCESS.md §3 item 1 ("Approver is name-based, not
-- identity-based ... a real approvers.app_user_id FK ... is still the single biggest remaining
-- gap").
--
-- Deliberately additive, not the full fix described there: name/role stay exactly as they are
-- and remain what approval_rules.step_1_approver/step_2_approver and every resolution function
-- (resolve_approval_rule, resolve_area_approver) actually match against -- rewriting every one
-- of those name-based joins to use this FK instead is a separate, larger piece of work (see the
-- doc). This migration only gives the two tables a real, queryable link where none existed
-- before, and backfills it for rows that already correspond 1:1 by name.
--
-- Nullable and ON DELETE SET NULL: an approver is not required to correspond to a real app_users
-- login (Screen 6's original design explicitly decided approvers are "not tied to Supabase auth
-- identity" -- see migration 0048's own comment), and app_users rows are deactivated, never
-- deleted, but SET NULL keeps this column correct even in the hypothetical.

begin;

alter table public.approvers
  add column if not exists app_user_id uuid references public.app_users(id) on delete set null;

comment on column public.approvers.app_user_id is
  'Optional link to the real app_users identity this approver slot represents (added after the '
  'fact -- approvers predates this FK, see migration 0048). Set going forward by the create flow '
  'in freigabe-regeln (src/routes/freigabe-regeln/index.tsx), which already only ever offers a '
  'real employee to pick from. NULL is valid: approvers are not required to have a Supabase Auth '
  'login. Not yet used by any resolution function -- name/role remain canonical for routing.';

-- One approver slot per app_users identity at most -- guards against accidentally creating a
-- second approver row for someone who already has one (the UI's create-from-employee flow
-- doesn't currently prevent picking the same employee twice).
create unique index if not exists approvers_app_user_id_key
  on public.approvers (app_user_id)
  where app_user_id is not null;

-- Backfill: exact case-insensitive name match against app_users.name, for the rows that already
-- correspond 1:1. Anything that doesn't match (name typo'd, approver never had a real account,
-- etc.) is left NULL rather than guessed at -- see the manual self-check below.
update public.approvers a
   set app_user_id = u.id
  from public.app_users u
 where a.app_user_id is null
   and lower(a.name) = lower(u.name);

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually against the live project, not part of the transaction above):
--
--   select a.name as approver_name, u.name as linked_employee, a.app_user_id
--     from public.approvers a
--     left join public.app_users u on u.id = a.app_user_id
--    order by a.name;
--
--   -- Rows with app_user_id null but an obviously-matching app_users row (name close but not
--   -- exact) need manual linking:
--   --   update public.approvers set app_user_id = '<app_users.id>' where id = '<approvers.id>';
-- ---------------------------------------------------------------------------
