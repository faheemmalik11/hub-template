-- Documents are not assigned to properties in this Hub: the properties live in the CRM and carry no
-- costs. Hides the property controls on the document screen. Run as the database owner, for example in
-- the Supabase SQL editor. Re-runnable.

begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, default_enabled, sort_order) values
  ('documents.property_assignment', 'section', 'page.incoming_invoices', 'documents', 'Belege Objekten zuordnen', 'Assign documents to properties', true, 215)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.feature_settings (feature_key, enabled) values ('documents.property_assignment', false)
on conflict (feature_key) do update set enabled = false;

commit;
