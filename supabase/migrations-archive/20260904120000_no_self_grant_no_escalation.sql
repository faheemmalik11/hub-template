-- Two rules the permission model never enforced, both reachable straight through PostgREST because
-- user_permissions' write policy is a plain is_admin():
--
--   1. NOBODY EDITS THEIR OWN PERMISSIONS. The Team drawer already refuses self-demotion of the
--      role and self-deactivation (istIchSelbst), but the permission checklist beside them was
--      never covered, so an admin could tick anything onto their own row.
--   2. NOBODY GRANTS WHAT THEY DO NOT HOLD. Nothing compared the permission being granted against
--      the granter's own set, so an admin could grant a colleague, or a second account, a
--      permission nobody above them ever agreed to.
--
-- THE SUPER ADMIN is exempt from rule 1 only. It holds the whole catalogue by rule
-- (20260901160300), so rule 2 is already satisfied for it, while rule 1 would lock the owner
-- account out of its own row -- and that account is the break-glass.
--
-- Enforced by a trigger rather than the RLS policy: a policy that returns false reports
-- "new row violates row-level security policy", which names no cause. These raise the reason.

begin;

create or replace function public.guard_permission_grants()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_role text := public.current_role_name();
  v_target uuid := coalesce(new.user_id, old.user_id);
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  -- No JWT means a service-role or server-side caller: the seeds, the pipeline and
  -- src/lib/api/*.functions.ts, which do their own authorisation.
  if v_actor is null then
    return coalesce(new, old);
  end if;

  if v_actor = v_target and v_actor_role is distinct from 'super_admin' then
    raise exception 'Sie können Ihre eigenen Rechte nicht ändern.'
      using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' and new.granted and v_actor_role is distinct from 'super_admin' then
    if not exists (select 1 from public.current_permissions() k where k = v_key) then
      raise exception 'Sie können ein Recht nicht vergeben, das Sie selbst nicht haben: %', v_key
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end
$$;

drop trigger if exists trg_guard_permission_grants on public.user_permissions;
create trigger trg_guard_permission_grants
  before insert or update or delete on public.user_permissions
  for each row execute function public.guard_permission_grants();

-- role_permissions decides what a ROLE means, so the same escalation applies one level up: an
-- admin could add a permission they lack to their own role's defaults and inherit it.
create or replace function public.guard_role_permission_grants()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_role text := public.current_role_name();
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  if v_actor is null or v_actor_role = 'super_admin' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.current_permissions() k where k = v_key) then
      raise exception 'Sie können ein Recht nicht vergeben, das Sie selbst nicht haben: %', v_key
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end
$$;

drop trigger if exists trg_guard_role_permission_grants on public.role_permissions;
create trigger trg_guard_role_permission_grants
  before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_permission_grants();

commit;
