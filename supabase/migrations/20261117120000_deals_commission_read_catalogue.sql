begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, sort_order) values
  ('deals.commission_read', 'action', 'page.commission_deals', 'documents', 'Provisionsbeträge sehen', 'See commission amounts',
   'Die Provisions- und Gewinnzahlen eines Verkaufs sehen, nicht nur die übrigen Angaben.',
   'See the commission and profit figures on a deal, not only its other details.', 936)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'deals.commission_read' from public.roles r
 where r.administers
    or r.name in ('supervisor', 'broker', 'assistant', 'tax_advisor', 'managing_director')
on conflict do nothing;

commit;
