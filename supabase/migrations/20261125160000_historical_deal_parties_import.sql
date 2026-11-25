begin;

-- spreadsheet-row-30 / seller / Cornelia Richter
with existing_p1 as (
  select id from public.customers where email = 'crichter3005@aol.com' and email is not null limit 1
),
inserted_p1 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Cornelia Richter', 'crichter3005@aol.com', 'Überruhrstraße 448b', '45277', 'Essen', false, 'app'
  where not exists (select 1 from existing_p1)
  returning id
),
customer_p1 as (
  select id from existing_p1 union all select id from inserted_p1
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-30') and side = 'seller'), id, null, 0, 0
from customer_p1
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-30') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-30') and side = 'seller') and dp2.customer_id = customer_p1.id
  );

-- spreadsheet-row-1 / buyer / Smaranika Routray & Sanjeev Pradhan
with existing_p2 as (
  select id from public.customers where email = 'snjvpradhan@gmail.com' and email is not null limit 1
),
inserted_p2 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Smaranika Routray & Sanjeev Pradhan', 'snjvpradhan@gmail.com', 'Schwerinstraße 4', '40477', 'Düsseldorf', false, 'app'
  where not exists (select 1 from existing_p2)
  returning id
),
customer_p2 as (
  select id from existing_p2 union all select id from inserted_p2
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'buyer'), id, null, 0, 0
from customer_p2
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'buyer') and dp2.customer_id = customer_p2.id
  );

-- spreadsheet-row-1 / seller / Janette Groß
with existing_p3 as (
  select id from public.customers where email = 'janetgross737@gmail.com' and email is not null limit 1
),
inserted_p3 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Janette Groß', 'janetgross737@gmail.com', 'Agnes-Miegel-Weg 29c', '47475', 'Kamp-Lintfort', false, 'app'
  where not exists (select 1 from existing_p3)
  returning id
),
customer_p3 as (
  select id from existing_p3 union all select id from inserted_p3
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'seller'), id, 50.0, 0, 0
from customer_p3
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'seller') and dp2.customer_id = customer_p3.id
  );

-- spreadsheet-row-1 / seller / Mark Groß
with existing_p4 as (
  select id from public.customers where email = 'sheriff_57@icloud.com' and email is not null limit 1
),
inserted_p4 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Mark Groß', 'sheriff_57@icloud.com', 'Stöckelstraße 4', '13599', 'Berlin', false, 'app'
  where not exists (select 1 from existing_p4)
  returning id
),
customer_p4 as (
  select id from existing_p4 union all select id from inserted_p4
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'seller'), id, 50.0, 0, 1
from customer_p4
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-1') and side = 'seller') and dp2.customer_id = customer_p4.id
  );

-- spreadsheet-row-4 / buyer / Yannic Eckermann
with existing_p5 as (
  select id from public.customers where email = 'finchii17@gmail.com' and email is not null limit 1
),
inserted_p5 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Yannic Eckermann', 'finchii17@gmail.com', 'Meisenweg 14', '45473', 'Mülheim an der Ruhr', false, 'app'
  where not exists (select 1 from existing_p5)
  returning id
),
customer_p5 as (
  select id from existing_p5 union all select id from inserted_p5
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and side = 'buyer'), id, null, 0, 0
from customer_p5
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and side = 'buyer') and dp2.customer_id = customer_p5.id
  );

-- spreadsheet-row-4 / seller / Madlin & Sandro Adolf
with existing_p6 as (
  select id from public.customers where email = 'sandro.adolf@web.de' and email is not null limit 1
),
inserted_p6 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Madlin & Sandro Adolf', 'sandro.adolf@web.de', 'Im Sundern 46', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p6)
  returning id
),
customer_p6 as (
  select id from existing_p6 union all select id from inserted_p6
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and side = 'seller'), id, null, 0, 0
from customer_p6
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-4') and side = 'seller') and dp2.customer_id = customer_p6.id
  );

-- spreadsheet-row-6 / buyer / Carolin Drießen & Paul Remin
with existing_p7 as (
  select id from public.customers where email = 'c.driessen@immobilien-driessen.de' and email is not null limit 1
),
inserted_p7 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Carolin Drießen & Paul Remin', 'c.driessen@immobilien-driessen.de', 'Neustraße 47', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p7)
  returning id
),
customer_p7 as (
  select id from existing_p7 union all select id from inserted_p7
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'buyer'), id, null, 0, 0
from customer_p7
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'buyer') and dp2.customer_id = customer_p7.id
  );

-- spreadsheet-row-6 / seller / Nicole Tacke
with existing_p8 as (
  select id from public.customers where email = 'nicole.tacke@yahoo.de' and email is not null limit 1
),
inserted_p8 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Nicole Tacke', 'nicole.tacke@yahoo.de', 'Roonstraße 10', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p8)
  returning id
),
customer_p8 as (
  select id from existing_p8 union all select id from inserted_p8
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'seller'), id, 50.0, 0, 0
from customer_p8
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'seller') and dp2.customer_id = customer_p8.id
  );

-- spreadsheet-row-6 / seller / André Tacke
with existing_p9 as (
  select id from public.customers where email = 'a2tacke@gmail.com' and email is not null limit 1
),
inserted_p9 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'André Tacke', 'a2tacke@gmail.com', 'Mozartwinkel 2', '48703', 'Stadtlohn', false, 'app'
  where not exists (select 1 from existing_p9)
  returning id
),
customer_p9 as (
  select id from existing_p9 union all select id from inserted_p9
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'seller'), id, 50.0, 0, 1
from customer_p9
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-6') and side = 'seller') and dp2.customer_id = customer_p9.id
  );

-- spreadsheet-row-11 / buyer / Devran Özdemir
with existing_p10 as (
  select id from public.customers where email = 'deveo@yahoo.de' and email is not null limit 1
),
inserted_p10 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Devran Özdemir', 'deveo@yahoo.de', 'Winkelstraße 54', '45966', 'Gladbeck', false, 'app'
  where not exists (select 1 from existing_p10)
  returning id
),
customer_p10 as (
  select id from existing_p10 union all select id from inserted_p10
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and side = 'buyer'), id, null, 0, 0
from customer_p10
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and side = 'buyer') and dp2.customer_id = customer_p10.id
  );

-- spreadsheet-row-11 / seller / Paul Koschuth
with existing_p11 as (
  select id from public.customers where email = 'annette.janssen1@web.de' and email is not null limit 1
),
inserted_p11 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Paul Koschuth', 'annette.janssen1@web.de', 'Gildenstraße 64', '45964', 'Gladbeck', false, 'app'
  where not exists (select 1 from existing_p11)
  returning id
),
customer_p11 as (
  select id from existing_p11 union all select id from inserted_p11
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and side = 'seller'), id, null, 0, 0
from customer_p11
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-11') and side = 'seller') and dp2.customer_id = customer_p11.id
  );

-- spreadsheet-row-13 / buyer / Ina & David Kunze
with existing_p12 as (
  select id from public.customers where email = 'david9achilles84@gmail.com' and email is not null limit 1
),
inserted_p12 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Ina & David Kunze', 'david9achilles84@gmail.com', 'Hackfurthstraße 74', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p12)
  returning id
),
customer_p12 as (
  select id from existing_p12 union all select id from inserted_p12
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and side = 'buyer'), id, null, 0, 0
from customer_p12
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and side = 'buyer') and dp2.customer_id = customer_p12.id
  );

-- spreadsheet-row-13 / seller / Lukas Tremblau
with existing_p13 as (
  select id from public.customers where email = 'lukastremblau@web.de' and email is not null limit 1
),
inserted_p13 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Lukas Tremblau', 'lukastremblau@web.de', 'Meerstraße 8', '45964', 'Gladbeck', false, 'app'
  where not exists (select 1 from existing_p13)
  returning id
),
customer_p13 as (
  select id from existing_p13 union all select id from inserted_p13
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and side = 'seller'), id, null, 0, 0
from customer_p13
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-13') and side = 'seller') and dp2.customer_id = customer_p13.id
  );

-- spreadsheet-row-15 / buyer / Anja & Dirk Splett
with existing_p14 as (
  select id from public.customers where email = 'anja.splett@gmail.com' and email is not null limit 1
),
inserted_p14 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Anja & Dirk Splett', 'anja.splett@gmail.com', 'Lindhorststraße 267', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p14)
  returning id
),
customer_p14 as (
  select id from existing_p14 union all select id from inserted_p14
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and side = 'buyer'), id, null, 0, 0
from customer_p14
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and side = 'buyer') and dp2.customer_id = customer_p14.id
  );

-- spreadsheet-row-15 / seller / Christian Weyhofen
with existing_p15 as (
  select id from public.customers where email = 'c.weyhofen@hotmail.com' and email is not null limit 1
),
inserted_p15 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Christian Weyhofen', 'c.weyhofen@hotmail.com', 'Scharnhölzfeld 3', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p15)
  returning id
),
customer_p15 as (
  select id from existing_p15 union all select id from inserted_p15
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and side = 'seller'), id, null, 0, 0
from customer_p15
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-15') and side = 'seller') and dp2.customer_id = customer_p15.id
  );

-- spreadsheet-row-18 / buyer / Frau Jaqueline Vanessa Katharina Hoppenjans & Herr Besim Behrami
with existing_p16 as (
  select id from public.customers where email = 'jacquelinehoppenjans@myyahoo.com' and email is not null limit 1
),
inserted_p16 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Frau Jaqueline Vanessa Katharina Hoppenjans & Herr Besim Behrami', 'jacquelinehoppenjans@myyahoo.com', 'Teichstraße 5', '46282', 'Dorsten', false, 'app'
  where not exists (select 1 from existing_p16)
  returning id
),
customer_p16 as (
  select id from existing_p16 union all select id from inserted_p16
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and side = 'buyer'), id, null, 0, 0
from customer_p16
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and side = 'buyer') and dp2.customer_id = customer_p16.id
  );

-- spreadsheet-row-18 / seller / Theo Underberg
with existing_p17 as (
  select id from public.customers where email = 'theo.underberg@outlook.de' and email is not null limit 1
),
inserted_p17 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Theo Underberg', 'theo.underberg@outlook.de', 'Wellbraucksweg 129', '46244', 'Bottrop-Kirchhellen', false, 'app'
  where not exists (select 1 from existing_p17)
  returning id
),
customer_p17 as (
  select id from existing_p17 union all select id from inserted_p17
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and side = 'seller'), id, null, 0, 0
from customer_p17
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-18') and side = 'seller') and dp2.customer_id = customer_p17.id
  );

-- spreadsheet-row-20 / buyer / Johanna & Martin Lazewski
with existing_p18 as (
  select id from public.customers where email = 'johannawyzgol@yahoo.de' and email is not null limit 1
),
inserted_p18 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Johanna & Martin Lazewski', 'johannawyzgol@yahoo.de', 'Batenbrockstraße 133', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p18)
  returning id
),
customer_p18 as (
  select id from existing_p18 union all select id from inserted_p18
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-20') and side = 'buyer'), id, null, 0, 0
from customer_p18
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-20') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-20') and side = 'buyer') and dp2.customer_id = customer_p18.id
  );

-- spreadsheet-row-20 / seller / Gabriela Bloch
with existing_p19 as (
  select id from public.customers where email = 'gabriela.bloch@vodafone.de' and email is not null limit 1
),
inserted_p19 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Gabriela Bloch', 'gabriela.bloch@vodafone.de', 'Kirchhellener Ring 55', '46244', 'Bottrop-Kirchhellen', false, 'app'
  where not exists (select 1 from existing_p19)
  returning id
),
customer_p19 as (
  select id from existing_p19 union all select id from inserted_p19
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-20') and side = 'seller'), id, null, 0, 0
from customer_p19
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-20') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-20') and side = 'seller') and dp2.customer_id = customer_p19.id
  );

-- spreadsheet-row-22 / buyer / Sunay & Gökhan Civ
with existing_p20 as (
  select id from public.customers where email = 'civ.g67@gmail.com' and email is not null limit 1
),
inserted_p20 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Sunay & Gökhan Civ', 'civ.g67@gmail.com', 'Nordring 137', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p20)
  returning id
),
customer_p20 as (
  select id from existing_p20 union all select id from inserted_p20
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and side = 'buyer'), id, null, 0, 0
from customer_p20
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and side = 'buyer') and dp2.customer_id = customer_p20.id
  );

-- spreadsheet-row-22 / seller / Birgit Schreiber
with existing_p21 as (
  select id from public.customers where email = 'fabian.s-86@web.de' and email is not null limit 1
),
inserted_p21 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Birgit Schreiber', 'fabian.s-86@web.de', 'Kraneburgstraße 52', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p21)
  returning id
),
customer_p21 as (
  select id from existing_p21 union all select id from inserted_p21
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and side = 'seller'), id, null, 0, 0
from customer_p21
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-22') and side = 'seller') and dp2.customer_id = customer_p21.id
  );

-- spreadsheet-row-24 / buyer / Nathalie & Martin Schultz
with existing_p22 as (
  select id from public.customers where email = 'nathalie-schultz@gmx.de' and email is not null limit 1
),
inserted_p22 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Nathalie & Martin Schultz', 'nathalie-schultz@gmx.de', 'Höchtebögen 4', '46117', 'Oberhausen', false, 'app'
  where not exists (select 1 from existing_p22)
  returning id
),
customer_p22 as (
  select id from existing_p22 union all select id from inserted_p22
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-24') and side = 'buyer'), id, null, 0, 0
from customer_p22
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-24') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-24') and side = 'buyer') and dp2.customer_id = customer_p22.id
  );

-- spreadsheet-row-24 / seller / Frank Kuhlmann
with existing_p23 as (
  select id from public.customers where email = 'haus-daimlerstr.36@fs-kuhlmann.de' and email is not null limit 1
),
inserted_p23 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Frank Kuhlmann', 'haus-daimlerstr.36@fs-kuhlmann.de', 'Bruder-Andreas-Weg 13', '46244', 'Bottrop-Kirchhellen', false, 'app'
  where not exists (select 1 from existing_p23)
  returning id
),
customer_p23 as (
  select id from existing_p23 union all select id from inserted_p23
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-24') and side = 'seller'), id, null, 0, 0
from customer_p23
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-24') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-24') and side = 'seller') and dp2.customer_id = customer_p23.id
  );

-- spreadsheet-row-26 / buyer / Zerrin & Mustafa Demirtürk
with existing_p24 as (
  select id from public.customers where email = 'zerrince@gmail.com' and email is not null limit 1
),
inserted_p24 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Zerrin & Mustafa Demirtürk', 'zerrince@gmail.com', 'Schieferweg 13', '57392', 'Schmallenberg', false, 'app'
  where not exists (select 1 from existing_p24)
  returning id
),
customer_p24 as (
  select id from existing_p24 union all select id from inserted_p24
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-26') and side = 'buyer'), id, null, 0, 0
from customer_p24
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-26') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-26') and side = 'buyer') and dp2.customer_id = customer_p24.id
  );

-- spreadsheet-row-26 / seller / Anja & Dirk Splett
with existing_p25 as (
  select id from public.customers where email = 'anja.splett@gmail.com' and email is not null limit 1
),
inserted_p25 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Anja & Dirk Splett', 'anja.splett@gmail.com', 'Lindhorststraße 267', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p25)
  returning id
),
customer_p25 as (
  select id from existing_p25 union all select id from inserted_p25
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-26') and side = 'seller'), id, null, 0, 0
from customer_p25
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-26') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-26') and side = 'seller') and dp2.customer_id = customer_p25.id
  );

-- spreadsheet-row-29 / buyer / Tonia Blume & Frederic Döhr
with existing_p26 as (
  select id from public.customers where email = 'blume.tonia@yahoo.de' and email is not null limit 1
),
inserted_p26 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Tonia Blume & Frederic Döhr', 'blume.tonia@yahoo.de', 'Gladbacher Straße 41', '40219', 'Düsseldorf', false, 'app'
  where not exists (select 1 from existing_p26)
  returning id
),
customer_p26 as (
  select id from existing_p26 union all select id from inserted_p26
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and side = 'buyer'), id, null, 0, 0
from customer_p26
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and side = 'buyer') and dp2.customer_id = customer_p26.id
  );

-- spreadsheet-row-29 / seller / Doris & Bernhard Scheiermann
with existing_p27 as (
  select id from public.customers where email = 'db.scheiermann@t-online.de' and email is not null limit 1
),
inserted_p27 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Doris & Bernhard Scheiermann', 'db.scheiermann@t-online.de', 'Auf der Kier 9a', '52076', 'Aachen', false, 'app'
  where not exists (select 1 from existing_p27)
  returning id
),
customer_p27 as (
  select id from existing_p27 union all select id from inserted_p27
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and side = 'seller'), id, null, 0, 0
from customer_p27
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-29') and side = 'seller') and dp2.customer_id = customer_p27.id
  );

-- spreadsheet-row-32 / seller / Tanja & Stefan Dobrindt
with existing_p28 as (
  select id from public.customers where email = 't.dobrindt@freenet.de' and email is not null limit 1
),
inserted_p28 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Tanja & Stefan Dobrindt', 't.dobrindt@freenet.de', 'Nathrathstraße 5', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p28)
  returning id
),
customer_p28 as (
  select id from existing_p28 union all select id from inserted_p28
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-32') and side = 'seller'), id, null, 0, 0
from customer_p28
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-32') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-32') and side = 'seller') and dp2.customer_id = customer_p28.id
  );

-- spreadsheet-row-33 / buyer / Olga & Paul Reinhardt
with existing_p29 as (
  select id from public.customers where email = 'p81reinhardt@yahoo.de' and email is not null limit 1
),
inserted_p29 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Olga & Paul Reinhardt', 'p81reinhardt@yahoo.de', 'Brauerstraße 60', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p29)
  returning id
),
customer_p29 as (
  select id from existing_p29 union all select id from inserted_p29
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-33') and side = 'buyer'), id, null, 0, 0
from customer_p29
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-33') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-33') and side = 'buyer') and dp2.customer_id = customer_p29.id
  );

-- spreadsheet-row-33 / seller / Stefanie & Patryk Avemaria
with existing_p30 as (
  select id from public.customers where email = 'stefanie.avemaria@web.de' and email is not null limit 1
),
inserted_p30 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Stefanie & Patryk Avemaria', 'stefanie.avemaria@web.de', 'Zeppelinstraße 96', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p30)
  returning id
),
customer_p30 as (
  select id from existing_p30 union all select id from inserted_p30
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-33') and side = 'seller'), id, null, 0, 0
from customer_p30
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-33') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-33') and side = 'seller') and dp2.customer_id = customer_p30.id
  );

-- spreadsheet-row-35 / buyer / Daniel Schweitzer
with existing_p31 as (
  select id from public.customers where email = 'daniel-schweitzer@gmx.de' and email is not null limit 1
),
inserted_p31 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Daniel Schweitzer', 'daniel-schweitzer@gmx.de', 'Kettenstraße 4', '47057', 'Duisburg', false, 'app'
  where not exists (select 1 from existing_p31)
  returning id
),
customer_p31 as (
  select id from existing_p31 union all select id from inserted_p31
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-35') and side = 'buyer'), id, null, 0, 0
from customer_p31
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-35') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-35') and side = 'buyer') and dp2.customer_id = customer_p31.id
  );

-- spreadsheet-row-35 / seller / Hans-Günter Sommer
with existing_p32 as (
  select id from public.customers where email = 'sommerbaumanagement@me.com' and email is not null limit 1
),
inserted_p32 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Hans-Günter Sommer', 'sommerbaumanagement@me.com', 'Am Schlangenholt 58 A', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p32)
  returning id
),
customer_p32 as (
  select id from existing_p32 union all select id from inserted_p32
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-35') and side = 'seller'), id, null, 0, 0
from customer_p32
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-35') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-35') and side = 'seller') and dp2.customer_id = customer_p32.id
  );

-- spreadsheet-row-37 / buyer / Janine & Yannik Ott
with existing_p33 as (
  select id from public.customers where email = 'yannick.ott@diveq.de' and email is not null limit 1
),
inserted_p33 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Janine & Yannik Ott', 'yannick.ott@diveq.de', 'Matthias-Lambertz-Weg 25', '45357', 'Essen', false, 'app'
  where not exists (select 1 from existing_p33)
  returning id
),
customer_p33 as (
  select id from existing_p33 union all select id from inserted_p33
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-37') and side = 'buyer'), id, null, 0, 0
from customer_p33
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-37') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-37') and side = 'buyer') and dp2.customer_id = customer_p33.id
  );

-- spreadsheet-row-37 / seller / Ben Kösters
with existing_p34 as (
  select id from public.customers where email = 'benkosters@kpnmail.nl' and email is not null limit 1
),
inserted_p34 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Ben Kösters', 'benkosters@kpnmail.nl', 'Sportlaan 75', '1333 SE', 'Almere, Niederlande', false, 'app'
  where not exists (select 1 from existing_p34)
  returning id
),
customer_p34 as (
  select id from existing_p34 union all select id from inserted_p34
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-37') and side = 'seller'), id, null, 0, 0
from customer_p34
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-37') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-37') and side = 'seller') and dp2.customer_id = customer_p34.id
  );

-- spreadsheet-row-39 / buyer / Frau Gerit Maldaner & Herr Tim  Jünger
with existing_p35 as (
  select id from public.customers where email = 'tim.juenger@me.com' and email is not null limit 1
),
inserted_p35 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Frau Gerit Maldaner & Herr Tim  Jünger', 'tim.juenger@me.com', 'An der Sandgrube 118', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p35)
  returning id
),
customer_p35 as (
  select id from existing_p35 union all select id from inserted_p35
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-39') and side = 'buyer'), id, null, 0, 0
from customer_p35
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-39') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-39') and side = 'buyer') and dp2.customer_id = customer_p35.id
  );

-- spreadsheet-row-39 / seller / Wolfgang von der Heyde
with existing_p36 as (
  select id from public.customers where email = 'wolfg.vonderheyde@gmail.com' and email is not null limit 1
),
inserted_p36 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Wolfgang von der Heyde', 'wolfg.vonderheyde@gmail.com', 'Brentanostraße 17', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p36)
  returning id
),
customer_p36 as (
  select id from existing_p36 union all select id from inserted_p36
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-39') and side = 'seller'), id, null, 0, 0
from customer_p36
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-39') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-39') and side = 'seller') and dp2.customer_id = customer_p36.id
  );

-- spreadsheet-row-41 / buyer / Gina Maria Kleinespel & Max Lettmann
with existing_p37 as (
  select id from public.customers where email = 'lettmann.max@gmail.com' and email is not null limit 1
),
inserted_p37 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Gina Maria Kleinespel & Max Lettmann', 'lettmann.max@gmail.com', 'Alte Hünxer Straße 73A', '46562', 'Voerde', false, 'app'
  where not exists (select 1 from existing_p37)
  returning id
),
customer_p37 as (
  select id from existing_p37 union all select id from inserted_p37
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-41') and side = 'buyer'), id, null, 0, 0
from customer_p37
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-41') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-41') and side = 'buyer') and dp2.customer_id = customer_p37.id
  );

-- spreadsheet-row-41 / seller / Carina & Kai Hengmith
with existing_p38 as (
  select id from public.customers where email = 'kai.hengmith@t-online.de' and email is not null limit 1
),
inserted_p38 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Carina & Kai Hengmith', 'kai.hengmith@t-online.de', 'Meis Wieske 4', '46348', 'Raesfeld', false, 'app'
  where not exists (select 1 from existing_p38)
  returning id
),
customer_p38 as (
  select id from existing_p38 union all select id from inserted_p38
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-41') and side = 'seller'), id, null, 0, 0
from customer_p38
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-41') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-41') and side = 'seller') and dp2.customer_id = customer_p38.id
  );

-- spreadsheet-row-43 / buyer / Alexandra Jungová
with existing_p39 as (
  select id from public.customers where email = '2809aj@gmail.com' and email is not null limit 1
),
inserted_p39 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Alexandra Jungová', '2809aj@gmail.com', 'Bäumchesweg 32', '41239', 'Mönchengladbach', false, 'app'
  where not exists (select 1 from existing_p39)
  returning id
),
customer_p39 as (
  select id from existing_p39 union all select id from inserted_p39
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'buyer'), id, null, 0, 0
from customer_p39
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'buyer') and dp2.customer_id = customer_p39.id
  );

-- spreadsheet-row-43 / seller / Marco Gräwingholt
with existing_p40 as (
  select id from public.customers where email = 'läuft über Marcel' and email is not null limit 1
),
inserted_p40 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Marco Gräwingholt', 'läuft über Marcel', 'Scharnhölzstraße 309', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p40)
  returning id
),
customer_p40 as (
  select id from existing_p40 union all select id from inserted_p40
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'seller'), id, 50.0, 0, 0
from customer_p40
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'seller') and dp2.customer_id = customer_p40.id
  );

-- spreadsheet-row-43 / seller / Marcel Gräwingholt
with existing_p41 as (
  select id from public.customers where email = 'm.graewingholt@gmx.de' and email is not null limit 1
),
inserted_p41 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Marcel Gräwingholt', 'm.graewingholt@gmx.de', 'Hegestraße 56A', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p41)
  returning id
),
customer_p41 as (
  select id from existing_p41 union all select id from inserted_p41
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'seller'), id, 50.0, 0, 1
from customer_p41
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-43') and side = 'seller') and dp2.customer_id = customer_p41.id
  );

-- spreadsheet-row-46 / buyer / Carina Schrader
with existing_p42 as (
  select id from public.customers where email = 'carina.schrader@gmx.de' and email is not null limit 1
),
inserted_p42 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Carina Schrader', 'carina.schrader@gmx.de', 'Stocksiepen 5', '45133', 'Essen', false, 'app'
  where not exists (select 1 from existing_p42)
  returning id
),
customer_p42 as (
  select id from existing_p42 union all select id from inserted_p42
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'buyer'), id, null, 0, 0
from customer_p42
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'buyer') and dp2.customer_id = customer_p42.id
  );

-- spreadsheet-row-46 / seller / Monika Bauer-Oppermann
with existing_p43 as (
  select id from public.customers where email = 'mena.bauer@gmail.com' and email is not null limit 1
),
inserted_p43 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Monika Bauer-Oppermann', 'mena.bauer@gmail.com', 'Brassertstraße 19', '45130', 'Essen', false, 'app'
  where not exists (select 1 from existing_p43)
  returning id
),
customer_p43 as (
  select id from existing_p43 union all select id from inserted_p43
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'seller'), id, 50.0, 0, 0
from customer_p43
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'seller') and dp2.customer_id = customer_p43.id
  );

-- spreadsheet-row-46 / seller / Andreas Soldtysiak
with existing_p44 as (
  select id from public.customers where email = 'hat keine Mail, schick die Mail bitte an unser Infopostfach, dann sende ich sie ihm per WA :)' and email is not null limit 1
),
inserted_p44 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Andreas Soldtysiak', 'hat keine Mail, schick die Mail bitte an unser Infopostfach, dann sende ich sie ihm per WA :)', 'Leutweinstraße 2', '46119', 'Oberhausen', false, 'app'
  where not exists (select 1 from existing_p44)
  returning id
),
customer_p44 as (
  select id from existing_p44 union all select id from inserted_p44
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'seller'), id, 50.0, 0, 1
from customer_p44
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-46') and side = 'seller') and dp2.customer_id = customer_p44.id
  );

-- spreadsheet-row-49 / buyer / Senem Gürz
with existing_p45 as (
  select id from public.customers where email = 's.aksgr24@gmail.com' and email is not null limit 1
),
inserted_p45 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Senem Gürz', 's.aksgr24@gmail.com', 'Am Trappenhof 9', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p45)
  returning id
),
customer_p45 as (
  select id from existing_p45 union all select id from inserted_p45
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-49') and side = 'buyer'), id, null, 0, 0
from customer_p45
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-49') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-49') and side = 'buyer') and dp2.customer_id = customer_p45.id
  );

-- spreadsheet-row-49 / seller / Martina Kranenburg
with existing_p46 as (
  select id from public.customers where email = 'marckress@ish.de' and email is not null limit 1
),
inserted_p46 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Martina Kranenburg', 'marckress@ish.de', 'Fortkamp 13', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p46)
  returning id
),
customer_p46 as (
  select id from existing_p46 union all select id from inserted_p46
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-49') and side = 'seller'), id, null, 0, 0
from customer_p46
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-49') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-49') and side = 'seller') and dp2.customer_id = customer_p46.id
  );

-- spreadsheet-row-51 / buyer / Ramyah & Gaviraj Thavarajah
with existing_p47 as (
  select id from public.customers where email = 'gavi_837@hotmail.com' and email is not null limit 1
),
inserted_p47 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Ramyah & Gaviraj Thavarajah', 'gavi_837@hotmail.com', 'Hochstraße 29', '46117', 'Oberhausen', false, 'app'
  where not exists (select 1 from existing_p47)
  returning id
),
customer_p47 as (
  select id from existing_p47 union all select id from inserted_p47
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-51') and side = 'buyer'), id, null, 0, 0
from customer_p47
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-51') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-51') and side = 'buyer') and dp2.customer_id = customer_p47.id
  );

-- spreadsheet-row-51 / seller / Nathalie & Martin Schultz
with existing_p48 as (
  select id from public.customers where email = 'nathalie-schultz@gmx.de' and email is not null limit 1
),
inserted_p48 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Nathalie & Martin Schultz', 'nathalie-schultz@gmx.de', 'Daimlerstraße 36', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p48)
  returning id
),
customer_p48 as (
  select id from existing_p48 union all select id from inserted_p48
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-51') and side = 'seller'), id, null, 0, 0
from customer_p48
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-51') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-51') and side = 'seller') and dp2.customer_id = customer_p48.id
  );

-- spreadsheet-row-53 / buyer / Yvonne & Sven Laakmann
with existing_p49 as (
  select id from public.customers where email = 'y.c.laakmann@gmx.de' and email is not null limit 1
),
inserted_p49 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Yvonne & Sven Laakmann', 'y.c.laakmann@gmx.de', 'Sterkrader Straße 94', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p49)
  returning id
),
customer_p49 as (
  select id from existing_p49 union all select id from inserted_p49
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-53') and side = 'buyer'), id, null, 0, 0
from customer_p49
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-53') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-53') and side = 'buyer') and dp2.customer_id = customer_p49.id
  );

-- spreadsheet-row-53 / seller / Dirk Schneider & Dr. Bernhard Wallner
with existing_p50 as (
  select id from public.customers where email = 'dirk_schneider_@web.de' and email is not null limit 1
),
inserted_p50 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Dirk Schneider & Dr. Bernhard Wallner', 'dirk_schneider_@web.de', 'Fernewaldstraße 275', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p50)
  returning id
),
customer_p50 as (
  select id from existing_p50 union all select id from inserted_p50
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-53') and side = 'seller'), id, null, 0, 0
from customer_p50
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-53') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-53') and side = 'seller') and dp2.customer_id = customer_p50.id
  );

-- spreadsheet-row-55 / buyer / Lara-Fabienne Rušpić
with existing_p51 as (
  select id from public.customers where email = 'lararuspic@icloud.com' and email is not null limit 1
),
inserted_p51 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Lara-Fabienne Rušpić', 'lararuspic@icloud.com', 'Sonnenschein 54', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p51)
  returning id
),
customer_p51 as (
  select id from existing_p51 union all select id from inserted_p51
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-55') and side = 'buyer'), id, null, 0, 0
from customer_p51
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-55') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-55') and side = 'buyer') and dp2.customer_id = customer_p51.id
  );

-- spreadsheet-row-55 / seller / Alena Fadzeyeva
with existing_p52 as (
  select id from public.customers where email = 'falena999@hotmail.com' and email is not null limit 1
),
inserted_p52 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Alena Fadzeyeva', 'falena999@hotmail.com', 'Germaniastraße 60', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p52)
  returning id
),
customer_p52 as (
  select id from existing_p52 union all select id from inserted_p52
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-55') and side = 'seller'), id, null, 0, 0
from customer_p52
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-55') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-55') and side = 'seller') and dp2.customer_id = customer_p52.id
  );

-- spreadsheet-row-58 / buyer / Nadine & Mario Schulz
with existing_p53 as (
  select id from public.customers where email = 'familie@manata.de' and email is not null limit 1
),
inserted_p53 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Nadine & Mario Schulz', 'familie@manata.de', 'Heidestraße 9', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p53)
  returning id
),
customer_p53 as (
  select id from existing_p53 union all select id from inserted_p53
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-58') and side = 'buyer'), id, null, 0, 0
from customer_p53
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-58') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-58') and side = 'buyer') and dp2.customer_id = customer_p53.id
  );

-- spreadsheet-row-58 / seller / Veronica & Michael Pohl
with existing_p54 as (
  select id from public.customers where email = 'michaelpohl58@t-online.de' and email is not null limit 1
),
inserted_p54 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Veronica & Michael Pohl', 'michaelpohl58@t-online.de', 'Hauptstraße 100', '46244', 'Bottrop-Kirchhellen', false, 'app'
  where not exists (select 1 from existing_p54)
  returning id
),
customer_p54 as (
  select id from existing_p54 union all select id from inserted_p54
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-58') and side = 'seller'), id, null, 0, 0
from customer_p54
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-58') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-58') and side = 'seller') and dp2.customer_id = customer_p54.id
  );

-- spreadsheet-row-60 / buyer / Lena Marie & Dillon Pezdevsek
with existing_p55 as (
  select id from public.customers where email = 'lena_todorski@hotmail.de' and email is not null limit 1
),
inserted_p55 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Lena Marie & Dillon Pezdevsek', 'lena_todorski@hotmail.de', 'Walter-Höfer-Weg 1', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p55)
  returning id
),
customer_p55 as (
  select id from existing_p55 union all select id from inserted_p55
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-60') and side = 'buyer'), id, null, 0, 0
from customer_p55
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-60') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-60') and side = 'buyer') and dp2.customer_id = customer_p55.id
  );

-- spreadsheet-row-60 / seller / Melanie Jäger
with existing_p56 as (
  select id from public.customers where email = 'melaniejaeger4@web.de' and email is not null limit 1
),
inserted_p56 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Melanie Jäger', 'melaniejaeger4@web.de', 'Herzogstraße 32', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p56)
  returning id
),
customer_p56 as (
  select id from existing_p56 union all select id from inserted_p56
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-60') and side = 'seller'), id, null, 0, 0
from customer_p56
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-60') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-60') and side = 'seller') and dp2.customer_id = customer_p56.id
  );

-- spreadsheet-row-62 / buyer / Gülfidan Özkan-Tanriverdi & Taner Tanriverdi
with existing_p57 as (
  select id from public.customers where email = 'gulfidan.ozkan@hotmail.de' and email is not null limit 1
),
inserted_p57 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Gülfidan Özkan-Tanriverdi & Taner Tanriverdi', 'gulfidan.ozkan@hotmail.de', 'Straßburger Straße 161', '46047', 'Oberhausen', false, 'app'
  where not exists (select 1 from existing_p57)
  returning id
),
customer_p57 as (
  select id from existing_p57 union all select id from inserted_p57
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-62') and side = 'buyer'), id, null, 0, 0
from customer_p57
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-62') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-62') and side = 'buyer') and dp2.customer_id = customer_p57.id
  );

-- spreadsheet-row-62 / seller / Achim Schäfer
with existing_p58 as (
  select id from public.customers where email = 'keine Mail - ich schicke die Rechnung per Post raus' and email is not null limit 1
),
inserted_p58 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Achim Schäfer', 'keine Mail - ich schicke die Rechnung per Post raus', 'Turpinstraße 135', '52066', 'Aachen', false, 'app'
  where not exists (select 1 from existing_p58)
  returning id
),
customer_p58 as (
  select id from existing_p58 union all select id from inserted_p58
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-62') and side = 'seller'), id, null, 0, 0
from customer_p58
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-62') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-62') and side = 'seller') and dp2.customer_id = customer_p58.id
  );

-- spreadsheet-row-64 / buyer / Josefine Sibel & Ozan Tekin
with existing_p59 as (
  select id from public.customers where email = 'josy_sibel@hotmail.de' and email is not null limit 1
),
inserted_p59 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Josefine Sibel & Ozan Tekin', 'josy_sibel@hotmail.de', 'Brüderstrasse 4', '45768', 'Marl', false, 'app'
  where not exists (select 1 from existing_p59)
  returning id
),
customer_p59 as (
  select id from existing_p59 union all select id from inserted_p59
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-64') and side = 'buyer'), id, null, 0, 0
from customer_p59
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-64') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-64') and side = 'buyer') and dp2.customer_id = customer_p59.id
  );

-- spreadsheet-row-64 / seller / Stephanie & Olaf Freund
with existing_p60 as (
  select id from public.customers where email = 'lottofreund@web.de' and email is not null limit 1
),
inserted_p60 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Stephanie & Olaf Freund', 'lottofreund@web.de', 'Kampstraße 86', '45772', 'Marl', false, 'app'
  where not exists (select 1 from existing_p60)
  returning id
),
customer_p60 as (
  select id from existing_p60 union all select id from inserted_p60
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-64') and side = 'seller'), id, null, 0, 0
from customer_p60
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-64') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-64') and side = 'seller') and dp2.customer_id = customer_p60.id
  );

-- spreadsheet-row-66 / buyer / Xenia Neuroth
with existing_p61 as (
  select id from public.customers where email = 'x.neuroth@web.de' and email is not null limit 1
),
inserted_p61 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Xenia Neuroth', 'x.neuroth@web.de', 'Zeppelinstraße 15', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p61)
  returning id
),
customer_p61 as (
  select id from existing_p61 union all select id from inserted_p61
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'buyer'), id, 50.0, 0, 0
from customer_p61
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'buyer') and dp2.customer_id = customer_p61.id
  );

-- spreadsheet-row-66 / buyer / Dennis Stahl
with existing_p62 as (
  select id from public.customers where email = 'dennisokay@outlook.de' and email is not null limit 1
),
inserted_p62 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Dennis Stahl', 'dennisokay@outlook.de', 'Kirchhellener Straße 268A', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p62)
  returning id
),
customer_p62 as (
  select id from existing_p62 union all select id from inserted_p62
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'buyer'), id, 50.0, 0, 1
from customer_p62
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'buyer') and dp2.customer_id = customer_p62.id
  );

-- spreadsheet-row-66 / seller / Markus Ingenbold
with existing_p63 as (
  select id from public.customers where email = 'markusingenbold@gmail.com' and email is not null limit 1
),
inserted_p63 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Markus Ingenbold', 'markusingenbold@gmail.com', 'Gustav-Freytag-Straße 23', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p63)
  returning id
),
customer_p63 as (
  select id from existing_p63 union all select id from inserted_p63
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'seller'), id, 50.0, 0, 0
from customer_p63
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'seller') and dp2.customer_id = customer_p63.id
  );

-- spreadsheet-row-66 / seller / Andrea Simon
with existing_p64 as (
  select id from public.customers where email = 'andrea1966simon@gmail.com' and email is not null limit 1
),
inserted_p64 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Andrea Simon', 'andrea1966simon@gmail.com', 'Gustav-Freytag-Straße 23', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p64)
  returning id
),
customer_p64 as (
  select id from existing_p64 union all select id from inserted_p64
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'seller'), id, 50.0, 0, 1
from customer_p64
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-66') and side = 'seller') and dp2.customer_id = customer_p64.id
  );

-- spreadsheet-row-69 / buyer / Tom Gercer
with existing_p65 as (
  select id from public.customers where email = 'tom.gercer@web.de' and email is not null limit 1
),
inserted_p65 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Tom Gercer', 'tom.gercer@web.de', 'Bottroper Straße 249', '46117', 'Oberhausen', false, 'app'
  where not exists (select 1 from existing_p65)
  returning id
),
customer_p65 as (
  select id from existing_p65 union all select id from inserted_p65
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'buyer'), id, 50.0, 0, 0
from customer_p65
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'buyer') and dp2.customer_id = customer_p65.id
  );

-- spreadsheet-row-69 / buyer / Henri Gercer
with existing_p66 as (
  select id from public.customers where email = 'henri.gercer@web.de' and email is not null limit 1
),
inserted_p66 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Henri Gercer', 'henri.gercer@web.de', 'Eichendorffstraße 74', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p66)
  returning id
),
customer_p66 as (
  select id from existing_p66 union all select id from inserted_p66
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'buyer'), id, 50.0, 0, 1
from customer_p66
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'buyer') and dp2.customer_id = customer_p66.id
  );

-- spreadsheet-row-69 / seller / Klaus Rebbelmund
with existing_p67 as (
  select id from public.customers where email = 'klaus.rebbelmund@t-online.de' and email is not null limit 1
),
inserted_p67 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Klaus Rebbelmund', 'klaus.rebbelmund@t-online.de', 'Schmiedestraße 33', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p67)
  returning id
),
customer_p67 as (
  select id from existing_p67 union all select id from inserted_p67
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'seller'), id, 50.0, 1000, 0
from customer_p67
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'seller') and dp2.customer_id = customer_p67.id
  );

-- spreadsheet-row-69 / seller / Hans-Georg Rebbelmund
with existing_p68 as (
  select id from public.customers where email = 'doro-georg@web.de' and email is not null limit 1
),
inserted_p68 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Hans-Georg Rebbelmund', 'doro-georg@web.de', 'Sensenfeld 66', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p68)
  returning id
),
customer_p68 as (
  select id from existing_p68 union all select id from inserted_p68
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'seller'), id, 50.0, 1000, 1
from customer_p68
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-69') and side = 'seller') and dp2.customer_id = customer_p68.id
  );

-- spreadsheet-row-77 / buyer / Charlotte Skubski & Lukas Löpenhaus
with existing_p69 as (
  select id from public.customers where email = 'charlotte.skubski@googlemail.com' and email is not null limit 1
),
inserted_p69 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Charlotte Skubski & Lukas Löpenhaus', 'charlotte.skubski@googlemail.com', 'Heimannstraße 41', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p69)
  returning id
),
customer_p69 as (
  select id from existing_p69 union all select id from inserted_p69
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'buyer'), id, null, 0, 0
from customer_p69
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'buyer') and dp2.customer_id = customer_p69.id
  );

-- spreadsheet-row-77 / seller / Joachim Jokisch
with existing_p70 as (
  select id from public.customers where email = 'joachim.jokisch@gmx.net' and email is not null limit 1
),
inserted_p70 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Joachim Jokisch', 'joachim.jokisch@gmx.net', 'Theodor-Fontane-Weg 16', '45219', 'Essen', false, 'app'
  where not exists (select 1 from existing_p70)
  returning id
),
customer_p70 as (
  select id from existing_p70 union all select id from inserted_p70
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'seller'), id, 50.0, 0, 0
from customer_p70
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'seller') and dp2.customer_id = customer_p70.id
  );

-- spreadsheet-row-77 / seller / Anne-Kathrin Jokisch
with existing_p71 as (
  select id from public.customers where email = 'anne-kathrin@jokisch-online.de' and email is not null limit 1
),
inserted_p71 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Anne-Kathrin Jokisch', 'anne-kathrin@jokisch-online.de', 'Roonstraße 4', '46236', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p71)
  returning id
),
customer_p71 as (
  select id from existing_p71 union all select id from inserted_p71
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'seller'), id, 50.0, 0, 1
from customer_p71
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-77') and side = 'seller') and dp2.customer_id = customer_p71.id
  );

-- spreadsheet-row-80 / buyer / Michelle & Michael Lenk
with existing_p72 as (
  select id from public.customers where email = 'michelle.dominique.lenk@gmail.com' and email is not null limit 1
),
inserted_p72 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Michelle & Michael Lenk', 'michelle.dominique.lenk@gmail.com', 'Krümmerstraße 19', '46240', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p72)
  returning id
),
customer_p72 as (
  select id from existing_p72 union all select id from inserted_p72
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-80') and side = 'buyer'), id, null, 0, 0
from customer_p72
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-80') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-80') and side = 'buyer') and dp2.customer_id = customer_p72.id
  );

-- spreadsheet-row-80 / seller / Alois Köster
with existing_p73 as (
  select id from public.customers where email = 'schluecking1@web.de' and email is not null limit 1
),
inserted_p73 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Alois Köster', 'schluecking1@web.de', 'Caritas-Seniorenzentrum St. Teresa | Görkenstraße 42', '46242', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p73)
  returning id
),
customer_p73 as (
  select id from existing_p73 union all select id from inserted_p73
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-80') and side = 'seller'), id, null, 0, 0
from customer_p73
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-80') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-80') and side = 'seller') and dp2.customer_id = customer_p73.id
  );

-- spreadsheet-row-81 / buyer / Nicole Golik & Dominik Gernand
with existing_p74 as (
  select id from public.customers where email = 'nicole.golik@unitybox.de' and email is not null limit 1
),
inserted_p74 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Nicole Golik & Dominik Gernand', 'nicole.golik@unitybox.de', 'Wennemannstraße 20 ', '45475', 'Mülheim an der Ruhr', false, 'app'
  where not exists (select 1 from existing_p74)
  returning id
),
customer_p74 as (
  select id from existing_p74 union all select id from inserted_p74
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and side = 'buyer'), id, null, 0, 0
from customer_p74
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and side = 'buyer') and dp2.customer_id = customer_p74.id
  );

-- spreadsheet-row-81 / seller / Desiree Logermann
with existing_p75 as (
  select id from public.customers where email = 'd.logermann@gmx.de' and email is not null limit 1
),
inserted_p75 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Desiree Logermann', 'd.logermann@gmx.de', 'Boschstraße 9', '46244', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p75)
  returning id
),
customer_p75 as (
  select id from existing_p75 union all select id from inserted_p75
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and side = 'seller'), id, null, 0, 0
from customer_p75
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-81') and side = 'seller') and dp2.customer_id = customer_p75.id
  );

-- spreadsheet-row-85 / buyer / Kim Sophie Kubla
with existing_p76 as (
  select id from public.customers where email = 'kim.kubla@gmx.de' and email is not null limit 1
),
inserted_p76 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Kim Sophie Kubla', 'kim.kubla@gmx.de', 'Bottroper Straße 8', '46117', 'Oberhausen', false, 'app'
  where not exists (select 1 from existing_p76)
  returning id
),
customer_p76 as (
  select id from existing_p76 union all select id from inserted_p76
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-85') and side = 'buyer'), id, null, 0, 0
from customer_p76
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-85') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-85') and side = 'buyer') and dp2.customer_id = customer_p76.id
  );

-- spreadsheet-row-85 / seller / Claudia & Volker Seeske
with existing_p77 as (
  select id from public.customers where email = 'cseeske@web.de' and email is not null limit 1
),
inserted_p77 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Claudia & Volker Seeske', 'cseeske@web.de', 'Meisenweg 3e', '46244', 'Bottrop-Kirchhellen', false, 'app'
  where not exists (select 1 from existing_p77)
  returning id
),
customer_p77 as (
  select id from existing_p77 union all select id from inserted_p77
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-85') and side = 'seller'), id, null, 0, 0
from customer_p77
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-85') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-85') and side = 'seller') and dp2.customer_id = customer_p77.id
  );

-- spreadsheet-row-87 / buyer / Bianca Berger
with existing_p78 as (
  select id from public.customers where email = 'berger040981@aol.com' and email is not null limit 1
),
inserted_p78 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Bianca Berger', 'berger040981@aol.com', 'Küppers Garten 7', '45355', 'Essen', false, 'app'
  where not exists (select 1 from existing_p78)
  returning id
),
customer_p78 as (
  select id from existing_p78 union all select id from inserted_p78
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-87') and side = 'buyer'), id, null, 0, 0
from customer_p78
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-87') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-87') and side = 'buyer') and dp2.customer_id = customer_p78.id
  );

-- spreadsheet-row-87 / seller / Sabine & Jürgen Slak
with existing_p79 as (
  select id from public.customers where email = 'sabineslak@icloud.com' and email is not null limit 1
),
inserted_p79 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Sabine & Jürgen Slak', 'sabineslak@icloud.com', 'Korzmannstraße 19', '46238', 'Bottrop', false, 'app'
  where not exists (select 1 from existing_p79)
  returning id
),
customer_p79 as (
  select id from existing_p79 union all select id from inserted_p79
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-87') and side = 'seller'), id, null, 0, 0
from customer_p79
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-87') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-87') and side = 'seller') and dp2.customer_id = customer_p79.id
  );

-- spreadsheet-row-89 / buyer / Sandra & Jörg Lippek
with existing_p80 as (
  select id from public.customers where email = 'info@lippek-ep.com' and email is not null limit 1
),
inserted_p80 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Sandra & Jörg Lippek', 'info@lippek-ep.com', 'Berkenstockstraße 20a', '45966', 'Gladbeck', false, 'app'
  where not exists (select 1 from existing_p80)
  returning id
),
customer_p80 as (
  select id from existing_p80 union all select id from inserted_p80
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and side = 'buyer'), id, null, 0, 0
from customer_p80
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and side = 'buyer') and dp2.customer_id = customer_p80.id
  );

-- spreadsheet-row-89 / seller / Klaus Haben
with existing_p81 as (
  select id from public.customers where email = 'zauberklaus123@web.de' and email is not null limit 1
),
inserted_p81 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Klaus Haben', 'zauberklaus123@web.de', 'Händelstraße 9a', '45966', 'Gladbeck', false, 'app'
  where not exists (select 1 from existing_p81)
  returning id
),
customer_p81 as (
  select id from existing_p81 union all select id from inserted_p81
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and side = 'seller'), id, null, 0, 0
from customer_p81
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-89') and side = 'seller') and dp2.customer_id = customer_p81.id
  );

-- spreadsheet-row-97 / buyer / Anna-Lisa & Christian Jeismann
with existing_p82 as (
  select id from public.customers where email = 'anna-lisa.jeismann@tu-dortmund.de' and email is not null limit 1
),
inserted_p82 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Anna-Lisa & Christian Jeismann', 'anna-lisa.jeismann@tu-dortmund.de', 'Mengeder Schulstraße 6c  ', '44359', 'Dortmund', false, 'app'
  where not exists (select 1 from existing_p82)
  returning id
),
customer_p82 as (
  select id from existing_p82 union all select id from inserted_p82
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-97') and side = 'buyer'), id, null, 0, 0
from customer_p82
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-97') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-97') and side = 'buyer') and dp2.customer_id = customer_p82.id
  );

-- spreadsheet-row-97 / seller / Dietmar Hahn
with existing_p83 as (
  select id from public.customers where email = 'hahndg@gmail.com' and email is not null limit 1
),
inserted_p83 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Dietmar Hahn', 'hahndg@gmail.com', 'Beermanns Esch 14', '48157', 'Münster', false, 'app'
  where not exists (select 1 from existing_p83)
  returning id
),
customer_p83 as (
  select id from existing_p83 union all select id from inserted_p83
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-97') and side = 'seller'), id, null, 0, 0
from customer_p83
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-97') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-row-97') and side = 'seller') and dp2.customer_id = customer_p83.id
  );

-- spreadsheet-efh-luner-weg-83-in-dorsten-none / buyer / Krampe
with existing_p84 as (
  select id from public.customers where email = 'astrid.deppermann@gmx.net' and email is not null limit 1
),
inserted_p84 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Krampe', 'astrid.deppermann@gmx.net', null, null, 'Dorsten', false, 'app'
  where not exists (select 1 from existing_p84)
  returning id
),
customer_p84 as (
  select id from existing_p84 union all select id from inserted_p84
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'buyer'), id, null, 0, 0
from customer_p84
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'buyer') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'buyer') and dp2.customer_id = customer_p84.id
  );

-- spreadsheet-efh-luner-weg-83-in-dorsten-none / seller / Claudia Lyttek
with existing_p85 as (
  select id from public.customers where email = 'cl.lyttek@gmail.com' and email is not null limit 1
),
inserted_p85 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Claudia Lyttek', 'cl.lyttek@gmail.com', 'Obere Lindenstraße 11', '51381', 'Leverkusen', false, 'app'
  where not exists (select 1 from existing_p85)
  returning id
),
customer_p85 as (
  select id from existing_p85 union all select id from inserted_p85
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller'), id, 33.333, 0, 0
from customer_p85
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller') and dp2.customer_id = customer_p85.id
  );

-- spreadsheet-efh-luner-weg-83-in-dorsten-none / seller / Andrea Agethen
with existing_p86 as (
  select id from public.customers where email = 'andreaagethen@aol.de' and email is not null limit 1
),
inserted_p86 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Andrea Agethen', 'andreaagethen@aol.de', 'Auf''m Diek 133', '46284', 'Dorsten', false, 'app'
  where not exists (select 1 from existing_p86)
  returning id
),
customer_p86 as (
  select id from existing_p86 union all select id from inserted_p86
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller'), id, 33.333, 0, 1
from customer_p86
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller') and dp2.customer_id = customer_p86.id
  );

-- spreadsheet-efh-luner-weg-83-in-dorsten-none / seller / Birgit Günther
with existing_p87 as (
  select id from public.customers where email = 'birgit@guentherweb.com' and email is not null limit 1
),
inserted_p87 as (
  insert into public.customers (name, email, address_street, address_zip, address_city, is_company, source)
  select 'Birgit Günther', 'birgit@guentherweb.com', 'Riedweg 31', '46284', 'Dorsten', false, 'app'
  where not exists (select 1 from existing_p87)
  returning id
),
customer_p87 as (
  select id from existing_p87 union all select id from inserted_p87
)
insert into public.deal_parties (deal_side_id, customer_id, share_percent, discount_gross, position)
select
  (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller'), id, 33.333, 0, 2
from customer_p87
where (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller') is not null
  and not exists (
    select 1 from public.deal_parties dp2
     where dp2.deal_side_id = (select id from public.deal_sides where deal_id = (select id from public.deals where source = 'historical_import' and external_id = 'spreadsheet-efh-luner-weg-83-in-dorsten-none') and side = 'seller') and dp2.customer_id = customer_p87.id
  );

commit;