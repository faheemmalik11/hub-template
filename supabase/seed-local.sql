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

-- These stay off for every real client by default (supabase/catalogue.sql). Turned on only here,
-- for local development, so the commission/reporting screens have something to show.
insert into public.feature_settings (feature_key, enabled) values
  ('page.commission_deals', true),
  ('deals.report', true),
  ('lexoffice.sync', true),
  ('lexoffice.invoice_file_fetch', true)
on conflict (feature_key) do update set enabled = excluded.enabled;

insert into public.customers (company_id, name, is_company, source)
select c.id, 'Example Buyer', false, 'app'
  from public.companies c
 where c.code = 'EX1'
   and not exists (select 1 from public.customers where name = 'Example Buyer');

-- One deal notarised this year, one last year, so the reporting tab's year-over-year comparison
-- has both sides to show.
insert into public.deals (id, company_id, property_id, status, notarised_on, purchase_price, acquired_by, handled_by, source)
select '00000000-0000-0000-0000-000000000101'::uuid, c.id, p.id, 'invoiced',
       current_date - 10, 300000, u.id, u.id, 'app'
  from public.companies c, public.properties p, public.app_users u
 where c.code = 'EX1' and p.code = 'P1' and u.email = 'owner@example.com'
   and not exists (select 1 from public.deals where id = '00000000-0000-0000-0000-000000000101'::uuid)
on conflict (id) do nothing;

insert into public.deals (id, company_id, property_id, status, notarised_on, purchase_price, acquired_by, handled_by, source)
select '00000000-0000-0000-0000-000000000102'::uuid, c.id, p.id, 'invoiced',
       current_date - interval '1 year' - interval '5 days', 200000, u.id, u.id, 'app'
  from public.companies c, public.properties p, public.app_users u
 where c.code = 'EX1' and p.code = 'P1' and u.email = 'owner@example.com'
   and not exists (select 1 from public.deals where id = '00000000-0000-0000-0000-000000000102'::uuid)
on conflict (id) do nothing;

insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate)
select d.id, 'seller', 'percent', 3.0
  from public.deals d
 where d.id in ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid)
on conflict (deal_id, side) do nothing;

insert into public.deal_parties (deal_side_id, customer_id, position)
select s.id, cu.id, 0
  from public.deal_sides s
  join public.customers cu on cu.name = 'Example Buyer'
 where s.deal_id in ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid)
   and s.side = 'seller'
on conflict (deal_side_id, customer_id) do nothing;

insert into public.broker_bonuses (broker_user_id, bonus_type, earned_on, amount, status)
select u.id, 'notary', current_date - 5, 500, 'approved'
  from public.app_users u
 where u.email = 'owner@example.com'
   and not exists (
     select 1 from public.broker_bonuses b
      where b.broker_user_id = u.id and b.bonus_type = 'notary' and b.earned_on = current_date - 5
   );

commit;
