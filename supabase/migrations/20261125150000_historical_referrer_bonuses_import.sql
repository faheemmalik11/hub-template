begin;

-- 2026-01: Christian Schwark, RMH Agnes-Miegel-Weg 29c in Kamp-Lintfort, 10% = 2070 EUR
with existing_2026_01 as (
  select id from public.customers where email = 'chrisschwark.cs@googlemail.com' limit 1
),
inserted_2026_01 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Christian Schwark', 'chrisschwark.cs@googlemail.com', 'Im Mallingforst 22', '46242', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_01)
  returning id
),
customer_2026_01 as (
  select id from existing_2026_01 union all select id from inserted_2026_01
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1'), id, 2070, '2026-01-31', 'paid', true, 'Legacy 10% payout, 2026-01, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_01
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and b2.referrer_customer_id = customer_2026_01.id
     and b2.amount = 2070 and b2.earned_on = '2026-01-31'
);

-- 2026-02: Angela & Stefan Rose, RH Im Sundern 46 in Bottrop, 10% = 1620 EUR
with existing_2026_02 as (
  select id from public.customers where email = 'stefan.rose@t-online.de' limit 1
),
inserted_2026_02 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Angela & Stefan Rose', 'stefan.rose@t-online.de', 'Krusestraße 46', '46238', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_02)
  returning id
),
customer_2026_02 as (
  select id from existing_2026_02 union all select id from inserted_2026_02
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4'), id, 1620, '2026-01-31', 'paid', true, 'Legacy 10% payout, 2026-02, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_02
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and b2.referrer_customer_id = customer_2026_02.id
     and b2.amount = 1620 and b2.earned_on = '2026-01-31'
);

-- 2026-04: Katharina Batzke & Oliver Drees, ETW Pestalozzistraße 24 in Bottrop, 10% = 850 EUR
with existing_2026_04 as (
  select id from public.customers where email = 'katharina.batzke@outlook.de' limit 1
),
inserted_2026_04 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Katharina Batzke & Oliver Drees', 'katharina.batzke@outlook.de', 'Hellen Straße 9', '46244', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_04)
  returning id
),
customer_2026_04 as (
  select id from existing_2026_04 union all select id from inserted_2026_04
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13'), id, 850, '2026-02-23', 'paid', true, 'Legacy 10% payout, 2026-04, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_04
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and b2.referrer_customer_id = customer_2026_04.id
     and b2.amount = 850 and b2.earned_on = '2026-02-23'
);

-- 2026-05: Kimberley Schütze, RMH Durchholzstraße 36 in Gladbeck, 10% = 1140 EUR
with existing_2026_05 as (
  select id from public.customers where email = 'kimi1904@gmx.de' limit 1
),
inserted_2026_05 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Kimberley Schütze', 'kimi1904@gmx.de', 'Heidestraße 15c', '45896', 'Gelsenkirchen', 'app'
  where not exists (select 1 from existing_2026_05)
  returning id
),
customer_2026_05 as (
  select id from existing_2026_05 union all select id from inserted_2026_05
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11'), id, 1140, '2026-02-23', 'paid', true, 'Legacy 10% payout, 2026-05, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_05
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and b2.referrer_customer_id = customer_2026_05.id
     and b2.amount = 1140 and b2.earned_on = '2026-02-23'
);

-- 2026-06: Kimberley Schütze, ETW Scharnhölzfeld 3 in Bottrop, 10% = 1480.12 EUR
with existing_2026_06 as (
  select id from public.customers where email = 'kimi1904@gmx.de' limit 1
),
inserted_2026_06 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Kimberley Schütze', 'kimi1904@gmx.de', 'Heidestraße 15c', '45896', 'Gelsenkirchen', 'app'
  where not exists (select 1 from existing_2026_06)
  returning id
),
customer_2026_06 as (
  select id from existing_2026_06 union all select id from inserted_2026_06
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15'), id, 1480.12, '2026-02-23', 'paid', true, 'Legacy 10% payout, 2026-06, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_06
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and b2.referrer_customer_id = customer_2026_06.id
     and b2.amount = 1480.12 and b2.earned_on = '2026-02-23'
);

-- 2026-07: Reinhold Steinwasser, DHH Ludgeriestraße 3 in Dorsten, 10% = 1500 EUR
with existing_2026_07 as (
  select id from public.customers where email = 'reinhold.steinwasser@t-online.de' limit 1
),
inserted_2026_07 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Reinhold Steinwasser', 'reinhold.steinwasser@t-online.de', 'Bottroper Straße 59', '46244', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_07)
  returning id
),
customer_2026_07 as (
  select id from existing_2026_07 union all select id from inserted_2026_07
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18'), id, 1500, '2026-02-23', 'paid', true, 'Legacy 10% payout, 2026-07, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_07
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and b2.referrer_customer_id = customer_2026_07.id
     and b2.amount = 1500 and b2.earned_on = '2026-02-23'
);

-- 2026-08: Peter Oles, RMH Holtfortstraße 43a in Bottrop, 10% = 765 EUR
with existing_2026_08 as (
  select id from public.customers where email = 'peteroles@web.de' limit 1
),
inserted_2026_08 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Peter Oles', 'peteroles@web.de', 'Am Schlangenholt 30', '46240', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_08)
  returning id
),
customer_2026_08 as (
  select id from existing_2026_08 union all select id from inserted_2026_08
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22'), id, 765, '2026-03-19', 'paid', true, 'Legacy 10% payout, 2026-08, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_08
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and b2.referrer_customer_id = customer_2026_08.id
     and b2.amount = 765 and b2.earned_on = '2026-03-19'
);

-- 2026-09: Sarah Gillahr, EFH Memelstraße 19 in Bottrop, 5% = 1125 EUR
with existing_2026_09 as (
  select id from public.customers where email = 'sarahsteinwasser@web.de' limit 1
),
inserted_2026_09 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Sarah Gillahr', 'sarahsteinwasser@web.de', 'Nordring 134', '46238', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_09)
  returning id
),
customer_2026_09 as (
  select id from existing_2026_09 union all select id from inserted_2026_09
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29'), id, 1125, '2026-06-15', 'paid', true, 'Legacy 5% payout, 2026-09, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_09
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and b2.referrer_customer_id = customer_2026_09.id
     and b2.amount = 1125 and b2.earned_on = '2026-06-15'
);

-- 2026-10: Christel Znotka, EFH Memelstraße 19 in Bottrop, 5% = 1125 EUR
with existing_2026_10 as (
  select id from public.customers where email = 'christelzn@gmx.de' limit 1
),
inserted_2026_10 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Christel Znotka', 'christelzn@gmx.de', 'Im Stadtgarten 2', '46236', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_10)
  returning id
),
customer_2026_10 as (
  select id from existing_2026_10 union all select id from inserted_2026_10
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29'), id, 1125, '2026-06-15', 'paid', true, 'Legacy 5% payout, 2026-10, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_10
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and b2.referrer_customer_id = customer_2026_10.id
     and b2.amount = 1125 and b2.earned_on = '2026-06-15'
);

-- 2026-11: Frank Kuhlmann, RMH Thomastraße 30 in Bottrop, 10% = 2520 EUR
with existing_2026_11 as (
  select id from public.customers where email = 'Frank@fs-kuhlmann.de' limit 1
),
inserted_2026_11 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Frank Kuhlmann', 'Frank@fs-kuhlmann.de', 'Bruder-Andreas-Weg 13', '46244', 'Bottrop-Kirchhellen', 'app'
  where not exists (select 1 from existing_2026_11)
  returning id
),
customer_2026_11 as (
  select id from existing_2026_11 union all select id from inserted_2026_11
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81'), id, 2520, '2026-10-16', 'paid', true, 'Legacy 10% payout, 2026-11, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_11
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and b2.referrer_customer_id = customer_2026_11.id
     and b2.amount = 2520 and b2.earned_on = '2026-10-16'
);

-- 2026-12: Martina Kranenburg, DHH Händelstraße 9A in Gladbeck, 10% = 1614 EUR
with existing_2026_12 as (
  select id from public.customers where email = 'martina.kranenburg@gmx.de' limit 1
),
inserted_2026_12 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Martina Kranenburg', 'martina.kranenburg@gmx.de', 'Fortkamp 13', '46238', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_12)
  returning id
),
customer_2026_12 as (
  select id from existing_2026_12 union all select id from inserted_2026_12
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89'), id, 1614, '2026-10-16', 'paid', true, 'Legacy 10% payout, 2026-12, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_12
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and b2.referrer_customer_id = customer_2026_12.id
     and b2.amount = 1614 and b2.earned_on = '2026-10-16'
);

-- 2026-13: Christian Weyhofen, DHH Richard-Wagner-Straße 4 in Bottrop, 10% = 1750 EUR
with existing_2026_13 as (
  select id from public.customers where email = 'c.weyhofen@hotmail.com' limit 1
),
inserted_2026_13 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, source)
  select 'Christian Weyhofen', 'c.weyhofen@hotmail.com', 'Scharnhölzfeld 3', '46236', 'Bottrop', 'app'
  where not exists (select 1 from existing_2026_13)
  returning id
),
customer_2026_13 as (
  select id from existing_2026_13 union all select id from inserted_2026_13
)
insert into public.deal_referrer_bonuses
  (deal_id, referrer_customer_id, amount, earned_on, status, is_legacy_payout, note)
select
  '32625672-a66a-4c4a-8317-a87e5e8ba32a', id, 1750, '2026-10-16', 'paid', true, 'Legacy 10% payout, 2026-13, imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx (Tippgeber sheet).'
from customer_2026_13
where not exists (
  select 1 from public.deal_referrer_bonuses b2
   where b2.deal_id = '32625672-a66a-4c4a-8317-a87e5e8ba32a' and b2.referrer_customer_id = customer_2026_13.id
     and b2.amount = 1750 and b2.earned_on = '2026-10-16'
);

commit;