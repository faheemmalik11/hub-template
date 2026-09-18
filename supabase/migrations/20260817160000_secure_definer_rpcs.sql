-- 20260817160000_secure_definer_rpcs.sql
-- Close the remaining unauthenticated SECURITY DEFINER surface.
--
-- Background. Supabase grants EXECUTE to PUBLIC, `anon` and `authenticated` at CREATE FUNCTION time.
-- A SECURITY DEFINER function bypasses RLS by design, so any such function that also lacks an
-- authorization check in its body is reachable by anyone holding the publishable anon key. Migration
-- 20260815200000 fixed exactly this for the two DATEV route RPCs; this one finishes the sweep for
-- the rest.
--
-- Only one group applies on this Hub.
--
-- This Hub has no LexOffice (and no sevDesk) integration, so the credential-writing RPCs the sibling
-- Hubs had to guard do not exist here. What remains is the group of unchecked write RPCs: that is SECURITY DEFINER, writes, and had no check: anon and PUBLIC are
-- revoked, `authenticated` and `service_role` keep EXECUTE. This closes the unauthenticated hole
-- without changing behaviour for any logged-in user, which is the point: these are called by the Hub
-- during normal work, so adding per-function ownership rules here would be a behaviour change made
-- blind. They remain reachable by any authenticated user, which is the same posture
-- docs/ROLES_AND_ACCESS.md §3 already discloses for write-side RLS.
--
-- Deliberately NOT touched:
--   * trigger functions (advance_workflow_on_payment, sync_*, guard_*, check_*, cascade_*, ...).
--     PostgREST refuses to invoke a function returning `trigger`, and EXECUTE grants do not gate
--     trigger firing, so revoking there is churn without a security gain.
--   * the read-only helpers is_admin(), has_company_access(), current_app_user_id(),
--     current_role_name(). They are called from inside RLS policies and must stay executable; with
--     no JWT they return false/null rather than leaking anything.
--   * clear_must_change_password(). It looked unchecked to a grep for auth.uid(), but it reads
--     auth.jwt() ->> 'email' and raises 'insufficient_privilege' when that is empty, so it is
--     already safe.

begin;


revoke execute on function public.apply_assignment_rules(uuid, text) from anon, public;
revoke execute on function public.learn_assignment_rule_from_match(uuid, text) from anon, public;
revoke execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) from anon, public;
revoke execute on function public.link_outgoing_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) from anon, public;
revoke execute on function public.merge_suppliers(uuid, uuid, text, text) from anon, public;
revoke execute on function public.opos_set_category(uuid, uuid) from anon, public;
revoke execute on function public.set_uploaded_outgoing_invoice_status(uuid, text, text) from anon, public;
revoke execute on function public.match_opos_whitelist(text, text, text, text) from anon, public;
revoke execute on function public.is_invoice_reconciled(uuid) from anon, public;

commit;

-- Sanity (after applying) -- expect no `anon=X/` and no bare `=X/` entry on any of these rows:
--   select proname, array_to_string(proacl::text[], ' | ')
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('apply_assignment_rules',
--                      'learn_assignment_rule_from_match','link_invoice_transaction',
--                      'link_outgoing_invoice_transaction','merge_suppliers','opos_set_category',
--                      'set_uploaded_outgoing_invoice_status','match_opos_whitelist','is_invoice_reconciled');
--
-- And as an unauthenticated caller (publishable key only), POST /rest/v1/rpc/merge_suppliers should
-- now be refused at the grant instead of executing an FK-reassigning, supplier-deleting merge.
