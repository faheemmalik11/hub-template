begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, default_enabled, sort_order) values
  ('lexoffice.invoice_file_fetch', 'section', 'page.outgoing_invoices', 'documents', 'PDF und Rechnungsnummer von Lexware abholen', 'Fetch PDF and invoice number from Lexware', false, 222)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

commit;
