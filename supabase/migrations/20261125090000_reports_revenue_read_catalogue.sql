begin;

-- The company's own revenue and profit, on the reports screen and the overview cards, shown to a
-- role that already does the bookkeeping but should not see what the agency takes in or keeps.
-- Costs stay visible either way: that half is the bookkeeping itself.
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, sort_order) values
  ('reports.revenue_read', 'action', 'page.reports', 'reports', 'Umsatz und Ergebnis sehen', 'See revenue and result',
   'Umsatz, Rohertrag und Betriebsergebnis in der Auswertung und auf der Übersicht sehen, nicht nur die Kosten.',
   'See revenue, gross profit and the operating result in reports and on the overview, not only the cost side.', 715)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'reports.revenue_read' from public.roles r
 where r.administers
    or r.name in ('supervisor', 'broker', 'assistant', 'tax_advisor', 'managing_director')
on conflict do nothing;

commit;
