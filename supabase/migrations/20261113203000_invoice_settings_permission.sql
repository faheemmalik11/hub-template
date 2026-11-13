begin;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, default_enabled, sort_order) values
  ('page.invoice_settings', 'page', 'module.invoices', 'menu', 'Rechnungsvorgaben', 'Invoice defaults', false, 245)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'page.invoice_settings' from public.roles r where r.administers
on conflict do nothing;

commit;
