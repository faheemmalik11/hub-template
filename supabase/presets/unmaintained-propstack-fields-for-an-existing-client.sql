-- Points at the four PropStack fields a sold property has not maintained: the realised price, the
-- sale date and either commission rate. Paste into the Supabase SQL editor as the database owner;
-- safe to run twice. It switches nothing on: see the last lines.

begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, default_enabled, sort_order) values
  ('propstack.unmaintained_fields', 'section', 'page.commission_deals', 'documents',
   'Auf nicht gepflegte PropStack-Felder hinweisen', 'Point at PropStack fields that are not maintained',
   'Zeigt auf dem Verkauf, welche der vier Felder im Objekt fehlen, mit einem Link zum Objekt in PropStack.',
   'Shows on the sale which of the four fields are missing on the property, with a link to the property in PropStack.',
   false, 942)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'propstack.unmaintained_fields' from public.roles r where r.administers
on conflict do nothing;

commit;

-- To switch it on:
-- insert into public.feature_settings (feature_key, enabled) values ('propstack.unmaintained_fields', true)
--   on conflict (feature_key) do update set enabled = true, updated_at = now();
