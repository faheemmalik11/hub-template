begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, default_enabled, sort_order) values
  ('outgoing_invoices.upload', 'action', 'page.outgoing_invoices', 'documents', 'Rechnung manuell hochladen', 'Manually upload an invoice', true, 223)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

commit;
