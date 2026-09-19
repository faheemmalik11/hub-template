-- The super admin can never be deactivated, and its role can never be changed.
--
-- Both rules already exist in the UI (Team & Rollen disables the toggle and the role select), but
-- the active toggle writes straight to `app_users` through RLS rather than via a server function,
-- so the UI is the ONLY thing standing in the way. That is not where a lockout guard belongs: the
-- super admin is the owner/technical account and the last unrestricted way back into the app, so
-- deactivating it -- by a mis-click, a stale client, or a direct PostgREST call -- could lock
-- everyone out of user administration entirely.
--
-- Renaming stays allowed on purpose: `name` is the one field Team & Rollen still lets an admin
-- edit on this row.
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
  select name into v_old_role from public.roles where id = old.role_id;
  if v_old_role is distinct from 'super_admin' then
    return new;  -- not a super admin: nothing to guard
  end if;

  if new.is_active is distinct from old.is_active and new.is_active = false then
    raise exception 'The super admin cannot be deactivated.'
      using errcode = 'insufficient_privilege';
  end if;

  select name into v_new_role from public.roles where id = new.role_id;
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
