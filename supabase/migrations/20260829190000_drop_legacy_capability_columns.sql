-- Drop app_users.can_book / can_approve / can_final_approve / can_pay.
--
-- They were the capability model before `user_permissions` existed. Since 20260828200000 nothing
-- reads them: the browser reads current_permissions(), RLS reads has_permission(), the Edge
-- Functions and the *.functions.ts server routes resolve the same override-then-role rule
-- explicitly. Verified by grep across src/ and supabase/functions/ -- the only surviving mention is
-- a comment in types.ts explaining what replaced them.
--
-- HOW THIS RAN ON THE STÄY PROJECT, recorded because the repo and the database would otherwise
-- disagree about why. The drop was executed on 2026-08-28 by accident, not by this file: a session
-- opened a transaction, dropped the columns to check that permissions.seed.sql tolerates their
-- absence, and then ran that seed with `\i`. The seed carries its own `commit;`, which committed
-- the outer transaction and made the drop permanent. Postgres warned ("there is already a
-- transaction in progress") and carried on.
--
-- The outcome was the intended end state and nothing was lost -- effective permissions were diffed
-- against the pre-change baseline for all eight accounts and were byte-identical -- but the repo
-- had no migration for it, so a fresh project would still have carried the columns. This file
-- closes that gap and makes the two agree.
--
-- OPERATIONAL NOTE for anyone doing the same kind of check: sourcing a script that contains its own
-- BEGIN/COMMIT from inside a transaction does not nest. The inner COMMIT ends the outer transaction
-- and every uncommitted statement before it is made permanent. Copy the statements out, or use a
-- savepoint, rather than `\i`-ing a self-committing file inside a `begin`.
--
-- permissions.seed.sql already handles their absence: its legacy backfill checks
-- information_schema first and skips with a notice, so the seed stays re-runnable here and still
-- migrates a Hub that has not moved off the columns yet.

alter table public.app_users drop column if exists can_book;
alter table public.app_users drop column if exists can_approve;
alter table public.app_users drop column if exists can_final_approve;
alter table public.app_users drop column if exists can_pay;

-- 20260828190000 created this to force the super admin's four columns true. The columns are gone;
-- guard_super_admin_permissions() on user_permissions is what protects that account now.
drop trigger if exists app_users_super_admin_capabilities on public.app_users;
drop function if exists public.guard_super_admin_capabilities();
