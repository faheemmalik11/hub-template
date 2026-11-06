-- handover_routes (the DATEV handover addresses) currently grants anyone holding rules.write a
-- plain "for all" policy plus the default REST table grants. This file narrows that to a read-only
-- policy and routes every write through set_datev_route() / update_datev_route_status(), the two
-- functions that already carry the auth.uid() and has_company_access() checks this table exists to
-- enforce. Paste into the Supabase SQL editor as the database owner; safe to run twice.
--
-- CHECK BEFORE RUNNING: this revokes a capability, not just adds one. Anyone with rules.write who
-- is currently editing handover_routes by some path other than those two functions -- a direct
-- table edit, a script, an integration -- loses write access the moment this runs. Find out who
-- currently has rules.write and whether they rely on writing this table directly before pasting
-- this in.

begin;

drop policy if exists handover_routes_write on public.handover_routes;

alter table public.handover_routes enable row level security;

drop policy if exists handover_routes_read on public.handover_routes;
create policy handover_routes_read on public.handover_routes for select to authenticated
    using (public.may_read('documents.read'));

revoke insert, update, delete on public.handover_routes from authenticated;

revoke select on public.handover_routes from authenticated;
grant select (id, company_id, direction, is_enabled, note, updated_by, created_at, updated_at)
    on public.handover_routes to authenticated;

revoke execute on function public.set_datev_route(uuid, text, text, boolean, text, text) from public;
revoke execute on function public.set_datev_route(uuid, text, text, boolean, text, text) from anon;
grant execute on function public.set_datev_route(uuid, text, text, boolean, text, text) to authenticated;

revoke execute on function public.update_datev_route_status(uuid, boolean, text, text) from public;
revoke execute on function public.update_datev_route_status(uuid, boolean, text, text) from anon;
grant execute on function public.update_datev_route_status(uuid, boolean, text, text) to authenticated;

commit;
