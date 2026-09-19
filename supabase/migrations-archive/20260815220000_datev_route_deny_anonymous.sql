-- 20260815220000_datev_route_deny_anonymous.sql
-- Follow-up to 20260815200000. That migration added has_company_access() to both DATEV route RPCs
-- and revoked EXECUTE from `anon` -- and the unauthenticated probe STILL reached the INSERT
-- afterwards. Two independent reasons, both verified live:
--
-- 1. Revoking from `anon` alone does not remove access. The ACL after 20260815200000 was
--    `=X/postgres | postgres=X | authenticated=X | service_role=X` -- the `anon=X` entry was gone,
--    but the leading `=X/postgres` is the grant to PUBLIC, and `anon` is a member of PUBLIC, so it
--    kept EXECUTE. 0050_trash_rpc_grant_hardening.sql revokes only from anon because the functions
--    it targets had already had PUBLIC revoked in 0049; these two never did. Copying that pattern
--    without the prerequisite is what left the hole open.
--
-- 2. has_company_access() returns TRUE for a caller with no JWT. Confirmed by calling it directly
--    with no auth context: it returned `true` for an arbitrary company uuid while
--    `auth.jwt() ->> 'email'` was null. Its "no grants recorded for this person means unrestricted"
--    branch (0046 -- deliberately there to preserve behaviour for accounts that predate the grants
--    table) also matches an anonymous caller, because an anonymous caller trivially has no grants.
--    That function was only ever meant to be reached through RLS policies scoped `to authenticated`,
--    where an anon caller is already excluded before it runs -- it is not safe as the sole gate
--    inside a SECURITY DEFINER function that PUBLIC can execute.
--
-- Fix both: revoke from PUBLIC (not just anon), and make each function deny an unauthenticated
-- caller explicitly rather than relying on has_company_access() to do it. The explicit check is the
-- one that actually holds the line -- the revoke is defense in depth, since a future
-- `create or replace` re-applies Supabase's default grants and would silently restore PUBLIC.

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
  -- Must come BEFORE has_company_access(): that function answers true for an anonymous caller.
  if auth.uid() is null then
    raise exception 'set_datev_route: authentication required' using errcode = 'insufficient_privilege';
  end if;
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
  if auth.uid() is null then
    raise exception 'update_datev_route_status: authentication required' using errcode = 'insufficient_privilege';
  end if;

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

-- create or replace re-applies the default grants, so revoke AFTER the definitions.
-- PUBLIC first -- revoking only from anon leaves the PUBLIC grant it inherits.
revoke execute on function public.set_datev_route(uuid, text, text, boolean, text, text) from public;
revoke execute on function public.set_datev_route(uuid, text, text, boolean, text, text) from anon;
revoke execute on function public.update_datev_route_status(uuid, boolean, text, text) from public;
revoke execute on function public.update_datev_route_status(uuid, boolean, text, text) from anon;

commit;

-- Sanity (after applying):
--   select proname, array_to_string(proacl::text[], ' | ') from pg_proc
--    where proname in ('set_datev_route', 'update_datev_route_status');
--   -- expect NO leading `=X/postgres` (that is PUBLIC) and no `anon=X`
--
-- Live check -- this must now fail on the auth check, not the foreign key:
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/set_datev_route" -H "apikey: $PUBLISHABLE_KEY" \
--        -H 'Content-Type: application/json' \
--        -d '{"p_company_id":"00000000-0000-0000-0000-0000000000ff","p_direction":"incoming",
--             "p_address":"x","p_is_enabled":false,"p_note":"","p_updated_by":"probe"}'
