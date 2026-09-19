-- 20260815200000_datev_route_company_scoped.sql
-- Harden the two DATEV route write RPCs. Both are SECURITY DEFINER (so they bypass RLS by design)
-- but neither had ANY authorization check in its body -- no is_admin(), no has_company_access(), no
-- reference to auth.uid() at all. The body was a bare upsert/update. Combined with Supabase's
-- default EXECUTE grants (PUBLIC + anon + authenticated at CREATE FUNCTION time), that meant:
--
--   * any authenticated user of any role could silently repoint ANY company's DATEV upload address
--     -- including companies they have no access to -- a column this table's own migration
--     (0051_hub_datev_handover.sql) calls "confidential" and deliberately withholds from the
--     authenticated SELECT grant so it can never be read back; and
--   * the RPC was reachable unauthenticated. Confirmed by grant: EXECUTE was held by PUBLIC and
--     `anon`, and the body has no auth check to fall back on. The equivalent unauthenticated probe
--     was run against the sibling Immonetz DEV project -- identical function bodies, signatures and
--     ACLs -- where POST /rest/v1/rpc/set_datev_route with nothing but the publishable anon key
--     executed all the way to the INSERT and failed only on the foreign key, because the probe used
--     a deliberately nonexistent company_id (23503). A real company_id would have written. The probe
--     was deliberately NOT re-run here, because this project is production.
--
-- This is the same class of gap docs/ROLES_AND_ACCESS.md §3 already discloses for write-side RLS,
-- and the same one flagged there for apply_assignment_rule_bulk().
--
-- Access model (client decision): DATEV handover is NOT admin-only -- assistants do hand over, but
-- only for companies they have access to. So the gate here is has_company_access(), deliberately
-- NOT is_admin(): the check is company scope, not role. has_company_access() already encodes the
-- rest of the policy from 0046 -- a deactivated account is denied outright, and a user with no
-- grants recorded stays unrestricted (preserving today's behaviour for Philipp-style accounts).
--
-- The anon revoke is separate and unconditional: an unauthenticated caller has no company access to
-- check, and an anon-callable write RPC is sloppy defense in depth regardless of the role model.
-- Mirrors 0050, which exists precisely because a PUBLIC-only revoke does not remove Supabase's
-- direct anon/authenticated grants.

begin;

create or replace function public.set_datev_route(
  p_company_id uuid,
  p_direction  text,
  p_address    text,
  p_is_enabled boolean,
  p_note       text,
  p_updated_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.has_company_access(p_company_id) then
    raise exception 'set_datev_route: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  insert into public.datev_routes (company_id, direction, address, is_enabled, note, updated_by, updated_at)
  values (p_company_id, p_direction, p_address, p_is_enabled, p_note, p_updated_by, now())
  on conflict (company_id, direction) do update set
    address    = excluded.address,
    is_enabled = excluded.is_enabled,
    note       = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$function$;

create or replace function public.update_datev_route_status(
  p_id         uuid,
  p_is_enabled boolean,
  p_note       text,
  p_updated_by text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company uuid;
begin
  -- The caller passes only the route id, so company scope has to be resolved here rather than taken
  -- from the arguments.
  select company_id into v_company from public.datev_routes where id = p_id;
  if v_company is null then
    raise exception 'update_datev_route_status: route % not found', p_id;
  end if;
  if not public.has_company_access(v_company) then
    raise exception 'update_datev_route_status: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  update public.datev_routes
     set is_enabled = p_is_enabled, note = p_note, updated_by = p_updated_by, updated_at = now()
   where id = p_id;
end;
$function$;

-- create or replace re-applies Supabase's default grants, so revoke AFTER the definitions above.
revoke execute on function public.set_datev_route(uuid, text, text, boolean, text, text) from anon;
revoke execute on function public.update_datev_route_status(uuid, boolean, text, text) from anon;

commit;

-- Sanity (after applying):
--   select proname, prosecdef, array_to_string(proacl::text[], ' | ')
--     from pg_proc where proname in ('set_datev_route', 'update_datev_route_status');
--   -- expect no `anon=X/...` entry on either row
--
-- And as an unauthenticated caller (publishable key only), the probe above should now fail on the
-- access check instead of reaching the foreign key.
