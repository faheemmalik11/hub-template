begin;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.current_role_name() from anon;
revoke execute on function public.current_app_user_id() from anon;
revoke execute on function public.has_company_access(uuid) from anon;
revoke execute on function public.clear_must_change_password() from anon;
-- invoices_filtered_search/invoices_filtered_aggregate: NOT revoked here on purpose.
-- 20260903180000 drops and recreates both with an added amount-range parameter, then revokes
-- anon on that new signature itself. Revoking the old signature here would break if this file
-- is ever (re-)run after 20260903180000, when the old signature no longer exists.

do $$
begin
  alter default privileges for role supabase_admin in schema public revoke execute on functions from anon;
exception
  when insufficient_privilege then
    raise notice 'skipped: current role cannot alter default privileges for supabase_admin — run this line from the Supabase SQL editor (dashboard) once, as postgres';
  when undefined_object then
    raise notice 'skipped: role supabase_admin does not exist on this database';
end $$;

do $$
begin
  alter default privileges for role postgres in schema public revoke execute on functions from anon;
exception
  when insufficient_privilege then
    raise notice 'skipped: current role cannot alter default privileges for postgres — run this line from the Supabase SQL editor (dashboard) once, as postgres';
  when undefined_object then
    raise notice 'skipped: role postgres does not exist on this database';
end $$;

commit;

-- select routine_name from information_schema.routine_privileges
--  where grantee = 'anon' and routine_schema = 'public'
--    and routine_name in ('is_admin','current_role_name','current_app_user_id',
--      'has_company_access','clear_must_change_password');
-- expect 0 rows. invoices_filtered_search/invoices_filtered_aggregate are checked by
-- 20260903180000 instead, against their own (amount-range) signature.
