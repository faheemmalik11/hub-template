-- opos_reapply_whitelist ended up with EXECUTE granted to `anon` as well as `authenticated`.
--
-- 20260819190000 did `revoke all on function ... from public` before granting to `authenticated`,
-- which is the usual incantation but not sufficient here: Supabase's default privileges grant
-- EXECUTE on a newly created function in `public` to `anon` and `authenticated` explicitly, and
-- revoking from the PUBLIC pseudo-role does not touch a grant held by a named role. Verified after
-- the migration was applied -- every sibling RPC in these databases (opos_set_no_receipt,
-- opos_clear_no_receipt, opos_set_category, restore_record, match_opos_whitelist) is
-- authenticated-only, so this one was the odd one out.
--
-- Not exploitable as it stood: the function's own gate reads current_role_name(), which resolves
-- through the JWT and returns NULL for an anonymous caller, so the call raised 42501 before
-- touching a row. This is defence in depth on a SECURITY DEFINER function that rewrites
-- matching_status across every company -- the in-function check should not be the only thing
-- standing between an unauthenticated request and that.

revoke execute on function public.opos_reapply_whitelist(uuid) from anon;
