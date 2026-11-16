-- Referrer-tier suggestion and its credit note, on a switch of its own: a client can run the sale
-- bonuses (notary/company/own-lead) without this turning on too before the referrer figures and
-- credit note form are settled. Off by default. Mirrors
-- supabase/presets/bonus-suggestions-for-an-existing-client.sql.

begin;
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, default_enabled, sort_order) values
  ('bonuses.suggest_referrer', 'section', 'page.broker_bonuses', 'documents',
   'Tippgeber-Boni aus Verkäufen vorschlagen', 'Suggest referrer bonuses from sales',
   'Automatische Stufen-Vorschläge und Gutschriften für Tippgeber. Erst einschalten, wenn die Werte vom Kunden bestätigt sind.',
   'Automatic tier suggestions and credit notes for referrers. Switch on only once the client has confirmed the values.',
   false, 945)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'bonuses.suggest_referrer' from public.roles r where r.administers
on conflict do nothing;
commit;
