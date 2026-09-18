-- The super admin bypasses company scoping, because the role already means "access to everything".
--
-- has_company_access() has no super_admin case today: it returns unrestricted only when the person
-- has NO non-deleted user_company_access rows. Team & Rollen deliberately skips the company-access
-- write for a super admin (its access is not an admin's to narrow), which works only while that
-- account happens to have zero grant rows. One grant row created by any other route -- a bulk
-- fixup, a seed, a direct SQL edit -- would silently turn the one unrestricted account into a
-- company-restricted one, with no UI left to clear it, because the company picker is hidden for
-- that row. Making the ROLE authoritative removes that trapdoor: the super admin is unrestricted
-- because of what it is, not because of which rows happen to be absent.
--
-- Everything else is preserved exactly, including the ordering that matters:
--   * deactivated is still checked FIRST, so offboarding denies even the watch-all bucket -- and
--     it stays ahead of the new branch, so a deactivated super_admin is still denied;
--   * p_company is null still means the watch-all bucket for unassigned receipts;
--   * "no grants recorded" still means unrestricted, and soft-deleted grants still do not count;
--   * an explicit can_view = false is still a denial, not a grant.
create or replace function public.has_company_access(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (
    -- Deliberately NOT current_app_user_id(): that function filters on is_active, so a
    -- deactivated account would come back as "no user found" and fall through to the
    -- unrestricted branch below. Offboarding has to deny, not open up, so the active flag is
    -- read here as data rather than used as a filter.
    select au.id, au.is_active, r.name as role_name
      from public.app_users au
      left join public.roles r on r.id = au.role_id
     where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     limit 1
  )
  select case
    -- A7: "if someone leaves the company, their access is deactivated, not deleted". Checked
    -- first, so a deactivated account is denied even the watch-all bucket -- and a deactivated
    -- super_admin is denied too, since this sits ahead of the role branch.
    when exists (select 1 from me where not is_active) then false
    -- The owner/technical account is unrestricted by role, never by grant bookkeeping.
    when exists (select 1 from me where role_name = 'super_admin') then true
    -- Watch-all. A receipt that is not assigned to a company yet has to stay visible to every
    -- reviewer, otherwise unassigned receipts would drop out of the queue instead of getting
    -- assigned, which is the exact failure the catch-all owner exists to prevent.
    when p_company is null then true
    -- No grants recorded for this person means unrestricted, preserving today's behaviour.
    -- Soft-deleted grants do not count as grants, otherwise revoking a person's last company
    -- would flip them from restricted straight back to seeing everything.
    when not exists (
      select 1
        from public.user_company_access a
        join me on a.user_id = me.id
       where a.deleted_at is null
    ) then true
    else exists (
      select 1
        from public.user_company_access a
        join me on a.user_id = me.id
       where a.company_id = p_company
         and a.deleted_at is null
         -- An explicit can_view = false is a denial, not a grant.
         and a.can_view
    )
  end;
$function$;
