-- Enough data to see every screen work, for local development only.
--
-- Never applied to a client's project: their data is their own, and a row invented here would look
-- exactly like one of theirs. Apply after the baseline and the catalogue:
--
--   psql "$DB" -f supabase/seed-local.sql
--
-- The two accounts below must also exist in auth, which the local stack's admin API creates:
--   owner@example.com  administers everything
--   clerk@example.com  sees one company only, which is what proves the scoping works

begin;

insert into public.companies (code, name, booking_basis) values
  ('EX1', 'Example Holding GmbH', 'invoice_date'),
  ('EX2', 'Example Services GmbH', 'payment_date')
on conflict (code) do nothing;

insert into public.properties (code, name, address) values
  ('P1', 'Example House', 'Example Street 1')
on conflict (code) do nothing;

insert into public.categories (code, name, direction, sort_order) values
  ('C1', 'Office supplies', 'incoming', 10),
  ('C2', 'Maintenance', 'incoming', 20)
on conflict (code) do nothing;

insert into public.vat_rates (country, rate) values ('DE', 19.00), ('DE', 7.00)
on conflict do nothing;

insert into public.suppliers (name, normalized_name, vat_id, iban)
select 'Example Supplier GmbH', public.normalized_name('Example Supplier GmbH'),
       'DE123456789', 'DE02120300000000202051'
 where not exists (select 1 from public.suppliers where name = 'Example Supplier GmbH');

-- How the review score is weighted here. A client sets their own.
insert into public.review_score_rules (check_key, weight) values
  ('sum_ok', 10), ('iban_ok', 10), ('invoice_number_present', 10)
on conflict (check_key) do nothing;

-- One clean document, and one with a missing invoice number and low confidence, so the review
-- score has something to compute and the list has something to sort.
insert into public.documents (
    issuer, document_type, document_date, invoice_number,
    amount_net, vat_rate, vat_amount, amount_gross, currency,
    company_id, company_code, supplier_id, category_id, cost_category,
    status, traffic_light, workflow_status, validation, extracted)
select 'Example Supplier GmbH', 'invoice', current_date - 10, 'INV-1001',
       100.00, 19.00, 19.00, 119.00, 'EUR',
       c.id, c.code, s.id, cat.id, cat.name,
       'recognised', 'green', 'received',
       '{"sum_ok":"true","iban_ok":"true"}'::jsonb,
       '{"confidence":{"issuer":"0.99","amount":"0.98"}}'::jsonb
  from public.companies c, public.suppliers s, public.categories cat
 where c.code = 'EX1' and cat.code = 'C1'
   and not exists (select 1 from public.documents where invoice_number = 'INV-1001')
 limit 1;

insert into public.documents (
    issuer, document_type, document_date,
    amount_net, vat_rate, vat_amount, amount_gross, currency,
    company_id, company_code, status, traffic_light, workflow_status, validation, extracted)
select 'Unknown Sender', 'invoice', current_date - 3,
       50.00, 19.00, 9.50, 59.50, 'EUR',
       c.id, c.code, 'needs_review', 'yellow', 'in_review',
       '{"invoice_number_present":"false","sum_ok":"true"}'::jsonb,
       '{"confidence":{"issuer":"0.62"}}'::jsonb
  from public.companies c
 where c.code = 'EX2'
   and not exists (select 1 from public.documents where issuer = 'Unknown Sender')
 limit 1;

insert into public.app_users (email, name, role_id, is_active)
select 'owner@example.com', 'Local Owner', id, true from public.roles where name = 'admin'
on conflict do nothing;

insert into public.app_users (email, name, role_id, is_active)
select 'clerk@example.com', 'Local Clerk', id, true from public.roles where name = 'assistant'
on conflict do nothing;

-- The clerk sees one company. Everything they can and cannot see follows from this row.
insert into public.user_company_access (user_id, company_id)
select u.id, c.id from public.app_users u, public.companies c
 where u.email = 'clerk@example.com' and c.code = 'EX1'
on conflict do nothing;

commit;
