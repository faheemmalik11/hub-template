-- Closes the INSERT escalation path left open by the update/delete guards.
--
-- `app_users_admin_insert` is `with check (is_admin())` with no column restriction, so the previous
-- guards -- wired only to `before update` and `before delete` -- stopped an admin PROMOTING a row
-- to super_admin while leaving them free to simply INSERT a new row carrying the super_admin
-- role_id. That is not a theoretical hole: current_role_name() and has_company_access() resolve the
-- caller by `lower(email) = lower(auth.jwt() ->> 'email') limit 1` with no auth_user_id involved,
-- so a second row with the admin's OWN email is enough to be resolved as super_admin -- and since
-- 20260813140000/150000 made that role return unconditional true from has_company_access(), a
-- company-restricted admin could grant themselves every company.
--
-- The same trigger function already handles this: on INSERT there is no OLD row, so it only needs
-- to reject a NEW row that arrives as super_admin.
create or replace function public.guard_super_admin_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_role text;
begin
  select name into v_new_role from public.roles where id = new.role_id;
  if v_new_role = 'super_admin' then
    raise exception 'The super admin role cannot be assigned.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$function$;

drop trigger if exists app_users_super_admin_no_insert on public.app_users;
create trigger app_users_super_admin_no_insert
  before insert on public.app_users
  for each row
  execute function public.guard_super_admin_insert();
