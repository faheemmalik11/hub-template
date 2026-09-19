-- guard_super_admin_permissions cancelled EVERY delete on user_permissions, not just the super
-- admin's.
--
-- In a BEFORE DELETE trigger `NEW` is NULL, and returning NULL from a BEFORE trigger cancels the
-- operation. The original function ended in `return new`, which on a DELETE is `return null` -- so
-- deleting any override silently removed zero rows and reported success, the same silent-no-op
-- shape as the `user_company_access` delete bug in docs/ROLES_AND_ACCESS.md §2.8.
--
-- No live impact yet: the Team screen upserts and never deletes, so no override has been lost. It
-- would have bitten the first time anything offered "reset this back to the role default".
--
-- Verified before the fix: insert an override for Petra, delete it, row still present (DELETE 0).

create or replace function public.guard_super_admin_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    -- Only the super admin's rows are protected; everyone else's delete proceeds. Returning OLD
    -- is what allows it -- returning NEW (null here) cancelled it.
    if exists (
      select 1 from public.app_users u join public.roles r on r.id = u.role_id
       where u.id = old.user_id and r.name = 'super_admin'
    ) then
      return null;
    end if;
    return old;
  end if;

  if exists (
    select 1 from public.app_users u join public.roles r on r.id = u.role_id
     where u.id = new.user_id and r.name = 'super_admin'
  ) then
    new.granted := true;
  end if;
  return new;
end
$$;
