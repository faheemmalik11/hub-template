-- Closes two holes in 20260813120000, both found in review.
--
-- 1. PROMOTION. The original guard returned early for any row that was not ALREADY a super admin,
--    so it only ever protected the existing one. `app_users_admin_update` is
--    `using (is_admin()) with check (is_admin())` with no column restriction, so any admin could
--    PostgREST-update their own role_id to the super_admin role and grant themselves the one role
--    that is deliberately not assignable from the UI (AssignableRole excludes it, and
--    updateEmployeeRole's zod enum rejects it). The guard now runs on the NEW role too.
--
-- 2. DELETION. The original was `before update` only, so `delete from app_users where id = <super
--    admin>` still removed the account the migration exists to protect -- the same lockout, by a
--    different verb.
create or replace function public.guard_super_admin_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_role text;
  v_new_role text;
begin
  if tg_op = 'DELETE' then
    select name into v_old_role from public.roles where id = old.role_id;
    if v_old_role = 'super_admin' then
      raise exception 'The super admin cannot be deleted.'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  select name into v_old_role from public.roles where id = old.role_id;
  select name into v_new_role from public.roles where id = new.role_id;

  -- Promotion INTO the role, from any other role.
  if v_new_role = 'super_admin' and v_old_role is distinct from 'super_admin' then
    raise exception 'The super admin role cannot be assigned.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_old_role is distinct from 'super_admin' then
    return new;  -- not a super admin, and not becoming one: nothing further to guard
  end if;

  if new.is_active is distinct from old.is_active and new.is_active = false then
    raise exception 'The super admin cannot be deactivated.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_new_role is distinct from v_old_role then
    raise exception 'The super admin role cannot be changed.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;

drop trigger if exists app_users_super_admin_stays_active on public.app_users;
create trigger app_users_super_admin_stays_active
  before update on public.app_users
  for each row
  execute function public.guard_super_admin_row();

drop trigger if exists app_users_super_admin_no_delete on public.app_users;
create trigger app_users_super_admin_no_delete
  before delete on public.app_users
  for each row
  execute function public.guard_super_admin_row();
