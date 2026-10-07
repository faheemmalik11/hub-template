-- A broker: sees only the properties the CRM says are theirs, and enters their own commissions for
-- an administrator to review and approve. No overview: they land on their properties. For a client that keeps its properties in a CRM.
--
-- Not part of the catalogue on purpose: a catalogue role would appear on every client's Team screen,
-- and the catalogue gives every role every menu entry. Apply this once, to the client that wants it.
-- Re-runnable: it puts the role's rights back to exactly this list.
--
-- Run as the database owner, for example in the Supabase SQL editor.

begin;

insert into public.roles (name, label, assignable, administers, protected, sort_order) values
  ('broker', 'Makler', true, false, false, 35)
on conflict (name) do update
   set label = excluded.label, assignable = excluded.assignable,
       administers = excluded.administers, protected = excluded.protected,
       sort_order = excluded.sort_order;

-- The bonus pages and the three below are switched on for the client.
insert into public.feature_settings (feature_key, enabled) values
  ('properties.crm_sync', true),
  ('page.commission_deals', true),
  ('deals.submit', true),
  ('page.broker_bonuses', true),
  ('bonuses.submit', true),
  ('bonuses.read', true),
  ('bonuses.review', true)
on conflict (feature_key) do update set enabled = true;

delete from public.role_permissions
 where role_id = (select id from public.roles where name = 'broker');

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join unnest(array[
    'page.profile',
    'module.master_data', 'page.properties', 'properties.crm_sync',
    'module.invoices', 'page.commission_deals', 'deals.submit',
    'page.broker_bonuses', 'bonuses.submit'
  ]) as k
 where r.name = 'broker'
   and exists (select 1 from public.permissions p where p.key = k)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join unnest(array['page.broker_bonuses', 'bonuses.review']) as k
 where r.administers
on conflict do nothing;

commit;
