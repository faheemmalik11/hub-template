-- The roles of an estate agency that runs its books and its brokers in one Hub, named after how the
-- agency's own people describe themselves. Re-runnable: it puts every role's rights back to this list.
-- Run as the database owner, for example in the Supabase SQL editor. Run broker-role.sql first.

begin;

insert into public.roles (name, label, assignable, administers, protected, sort_order) values
  ('admin',       'Geschäftsführung', true,  true,  false, 20),
  ('assistant',   'Assistenz',        true,  false, false, 30),
  ('bookkeeper',  'Buchhaltung',      true,  false, false, 40),
  ('broker',      'Makler',           true,  false, false, 50),
  ('tax_advisor', 'Steuerberatung',   true,  false, false, 60),
  ('supervisor',  'Freigabe',         false, false, false, 90)
on conflict (name) do update
   set label = excluded.label, assignable = excluded.assignable,
       administers = excluded.administers, protected = excluded.protected,
       sort_order = excluded.sort_order;

update public.app_users
   set role_id = (select id from public.roles where name = 'bookkeeper')
 where email = 'buchhaltung@immobilien-vanoepen.de';

delete from public.role_permissions
 where role_id in (select id from public.roles where name in ('assistant', 'bookkeeper', 'tax_advisor'));

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
  join public.permissions p on p.kind in ('module', 'page', 'section')
 where r.name in ('assistant', 'bookkeeper')
   and p.key not in ('page.team', 'page.bank_connections', 'page.activity_log', 'page.trash',
                     'page.commission_deals', 'page.broker_bonuses', 'page.onboarding')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join lateral unnest(
    case r.name
      when 'assistant' then array[
        'documents.read', 'documents.write', 'invoices.approve',
        'master_data.read', 'master_data.write', 'bank.read']
      when 'bookkeeper' then array[
        'documents.read', 'documents.write', 'invoices.approve',
        'master_data.read', 'master_data.write', 'bank.read', 'bank.write', 'payments.write']
      when 'tax_advisor' then array[
        'module.overview', 'page.profile', 'module.invoices', 'page.incoming_invoices',
        'page.outgoing_invoices', 'module.taxes', 'page.handover', 'page.vat_rules',
        'module.reports', 'page.reports',
        'documents.read', 'master_data.read', 'bank.read']
    end
  ) as k
 where r.name in ('assistant', 'bookkeeper', 'tax_advisor')
   and exists (select 1 from public.permissions p where p.key = k)
on conflict do nothing;

commit;
