-- The super admin holds the whole catalogue, and an admin cannot take it away.
--
-- THE HOLE. `user_permissions` is guarded: guard_super_admin_permissions() (20260829150000, fixed
-- in 20260829160000) refuses to revoke anything from the owner account. `role_permissions` is NOT.
-- Its write policy is plain `is_admin()`, so any admin can PostgREST-delete the super_admin role's
-- defaults directly and lock the owner account out of the screens that undo it. The super admin
-- holds everything today only because the seed happens to grant it -- a data state, not a rule.
--
-- WHY NOW. The invoice screen's "Acting as" picker narrows to the super admin in this pass, and
-- Acting as is only coherent if that account genuinely holds every permission the picker can
-- resolve to. Break-glass that an admin can quietly disarm is not break-glass.
--
-- THE FIX. current_permissions() short-circuits on the role name. The catalogue is the answer for
-- the super admin regardless of what either grant table says, so there is nothing left to strip.
-- Same branch is restated in src/lib/api/require-permission.ts, which runs on the service-role
-- client and never calls this function: that path carries no JWT for auth.jwt() to read.

begin;

create or replace function public.current_permissions()
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select u.id, u.role_id, r.name as role_name
      from public.app_users u
      left join public.roles r on r.id = u.role_id
     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and u.is_active
     limit 1
  )
  select p.key
    from public.permissions p
    cross join me
    left join public.user_permissions up
      on up.user_id = me.id and up.permission_key = p.key
    left join public.role_permissions rp
      on rp.role_id = me.role_id and rp.permission_key = p.key
   where me.role_name = 'super_admin'
      or coalesce(up.granted, rp.permission_key is not null);
$$;

comment on function public.current_permissions() is
  'The effective permission set for the calling account: personal overrides merged over the role '
  'defaults, with granted=false meaning a real revoke. The super_admin role short-circuits to the '
  'whole catalogue -- role_permissions is admin-writable with no guard of its own, so without this '
  'an admin could strip the owner account''s defaults.';

commit;
