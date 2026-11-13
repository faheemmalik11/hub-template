begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, default_enabled, sort_order) values
  ('deals.report', 'section', 'page.commission_deals', 'documents', 'Auswertung', 'Reporting',
   'Eine Übersicht je Makler mit Abschlüssen, Volumen, Provision und Boni im Vorjahresvergleich.',
   'A per-agent overview of closings, volume, commission and bonuses, compared with the previous year.', false, 943),
  ('deals.report_all', 'action', 'page.commission_deals', 'documents', 'Auswertung aller Makler sehen', 'See every agent''s reporting',
   'In der Auswertung alle Makler im Vergleich sehen, nicht nur die eigenen Zahlen.',
   'See every agent compared in the reporting tab, not only your own figures.', false, 944)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'deals.report' from public.roles r where r.name in ('super_admin', 'admin', 'managing_director', 'broker')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'deals.report_all' from public.roles r where r.administers
on conflict do nothing;

commit;
