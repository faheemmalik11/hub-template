-- 0050_trash_rpc_grant_hardening.sql
-- Follow-up to 0049. get_advisors (security) flagged restore_record/purge_record as executable
-- by `anon`, even after their own "revoke ... from public" -- Supabase's default privileges grant
-- EXECUTE directly to `anon`/`authenticated` at CREATE FUNCTION time, which a PUBLIC-only revoke
-- does not touch. The functions' own is_admin() check already denies an unauthenticated caller
-- (auth.jwt() is null for anon, so is_admin() is false), so this was not an active hole, but an
-- anon-callable admin RPC is sloppy defense in depth -- revoke explicitly instead of relying on
-- the internal check alone. Also sets search_path on the two new helper functions from 0049,
-- which the same advisor pass flagged as "role mutable search_path".

begin;

alter function public.trash_eligible_tables() set search_path = public;
alter function public.trash_purge_eligible_tables() set search_path = public;

revoke execute on function public.restore_record(text, uuid) from anon;
revoke execute on function public.purge_record(text, uuid) from anon;
revoke execute on function public.trash_eligible_tables() from anon;
revoke execute on function public.trash_purge_eligible_tables() from anon;

commit;
