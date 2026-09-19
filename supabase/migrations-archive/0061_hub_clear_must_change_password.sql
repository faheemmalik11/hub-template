-- 0048_clear_must_change_password.sql
-- Enforces must_change_password (Briefing Screen 17): a new employee gets a one-time temp
-- password (src/lib/api/employees.functions.ts's createEmployee) and must set their own before
-- using the app. Clearing the flag needs a narrow, self-service RPC rather than a new
-- self-UPDATE RLS policy on app_users: every existing app_users write policy is admin-only
-- (migration 0046), and opening a general self-UPDATE policy would be a much bigger surface
-- (any authenticated user could edit any of their own columns) than this one flag needs.

begin;

create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    raise exception 'clear_must_change_password: no authenticated email' using errcode = 'insufficient_privilege';
  end if;

  update public.app_users
     set must_change_password = false,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'clear_must_change_password: no app_users row for %', v_email;
  end if;
end;
$$;

revoke execute on function public.clear_must_change_password() from public;
grant execute on function public.clear_must_change_password() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- begin
--   -- No JWT in a raw SQL session, so this must reject with insufficient_privilege.
--   begin
--     perform public.clear_must_change_password();
--     raise exception 'expected clear_must_change_password to reject with no authenticated email';
--   exception when insufficient_privilege then
--     raise notice 'correctly rejected: no email in this raw SQL session (expected)';
--   end;
--   raise notice 'self-check ok';
-- end $$;
