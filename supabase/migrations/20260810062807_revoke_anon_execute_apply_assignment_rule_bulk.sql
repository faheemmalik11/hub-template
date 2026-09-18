-- 20260810062807_revoke_anon_execute_apply_assignment_rule_bulk.sql
-- Found during a roles/access verification pass (2026-08-10) via `get_advisors`, cross-checked
-- against the Immonetz Hub sibling app (identical finding there): `apply_assignment_rule_bulk()`
-- is `SECURITY DEFINER`, has no internal caller check at all, and is executable by
-- `anon`/`PUBLIC` -- not just `authenticated` as the original grant intended (it only ever
-- granted to `authenticated`, never revoked the default PUBLIC execute privilege every new
-- function gets). Since the function bypasses RLS by design, this meant an unauthenticated
-- caller with nothing but the public anon key could invoke it via
-- `/rest/v1/rpc/apply_assignment_rule_bulk` and bulk-update real invoices across every company a
-- rule's scope matches.
--
-- This migration only closes the unauthenticated surface (anon/public). It does NOT add a
-- has_company_access() check for authenticated callers -- that's the already-documented,
-- deliberately deferred write-side RLS gap (docs/ROLES_AND_ACCESS.md §3 item 3), a larger,
-- per-screen decision this migration isn't scoped to make.
--
-- Idempotent: revoke is a no-op if the privilege is already absent.

begin;

revoke execute on function public.apply_assignment_rule_bulk(uuid, text) from public;
revoke execute on function public.apply_assignment_rule_bulk(uuid, text) from anon;

-- Self-check: anon/PUBLIC no longer have EXECUTE; authenticated still does.
do $$
declare
  v_bad text[] := array[]::text[];
begin
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'apply_assignment_rule_bulk' and grantee in ('anon', 'PUBLIC')
  ) then
    v_bad := v_bad || 'anon/PUBLIC still has EXECUTE';
  end if;

  if not exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'apply_assignment_rule_bulk' and grantee = 'authenticated'
  ) then
    v_bad := v_bad || 'authenticated lost EXECUTE (should still have it)';
  end if;

  if array_length(v_bad, 1) > 0 then
    raise exception '0095 self-check FAILED: %', array_to_string(v_bad, '; ');
  end if;
  raise notice '0095 self-check ok: apply_assignment_rule_bulk is no longer anon/PUBLIC-executable, authenticated is unaffected';
end $$;

commit;
