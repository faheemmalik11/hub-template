begin;

-- ETW Donnerstraße 82 in Essen | notarised unknown | 220000 EUR
with d_etw_donnerstra_e_82_in_essen_none as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Donnerstraße 82 in Essen', 'historical_import', 'spreadsheet-row-30', 'settled',
    null, 220000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'seller', 'percent', 3.0, null::numeric from d_etw_donnerstra_e_82_in_essen_none;

-- RMH Agnes-Miegel-Weg 29c in Kamp-Lintfort | notarised 2026-01-12T00:00:00 | 414000 EUR
with d_rmh_agnes_miegel_weg_29c_in_kamp_lintfort_2026_0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RMH Agnes-Miegel-Weg 29c in Kamp-Lintfort', 'historical_import', 'spreadsheet-row-1', 'settled',
    '2026-01-12', 414000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_rmh_agnes_miegel_weg_29c_in_kamp_lintfort_2026_0
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_rmh_agnes_miegel_weg_29c_in_kamp_lintfort_2026_0;

-- RH Im Sundern 46 in Bottrop | notarised 2026-01-13T00:00:00 | 270000 EUR
with d_rh_im_sundern_46_in_bottrop_2026_01_13t00_00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RH Im Sundern 46 in Bottrop', 'historical_import', 'spreadsheet-row-4', 'settled',
    '2026-01-13', 270000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_rh_im_sundern_46_in_bottrop_2026_01_13t00_00_00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_rh_im_sundern_46_in_bottrop_2026_01_13t00_00_00;

-- DHH Roonstraße 10 in Bottrop | notarised 2026-02-03T00:00:00 | 595000 EUR
with d_dhh_roonstra_e_10_in_bottrop_2026_02_03t00_00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'DHH Roonstraße 10 in Bottrop', 'historical_import', 'spreadsheet-row-6', 'settled',
    '2026-02-03', 595000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_dhh_roonstra_e_10_in_bottrop_2026_02_03t00_00_00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_dhh_roonstra_e_10_in_bottrop_2026_02_03t00_00_00;

-- RMH Durchholzstraße 36 in Gladbeck | notarised 2026-02-12T00:00:00 | 190000 EUR
with d_rmh_durchholzstra_e_36_in_gladbeck_2026_02_12t00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RMH Durchholzstraße 36 in Gladbeck', 'historical_import', 'spreadsheet-row-11', 'settled',
    '2026-02-12', 190000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_rmh_durchholzstra_e_36_in_gladbeck_2026_02_12t00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_rmh_durchholzstra_e_36_in_gladbeck_2026_02_12t00;

-- ETW Pestalozzistraße 24 in Bottrop | notarised 2026-02-12T00:00:00 | 170000 EUR
with d_etw_pestalozzistra_e_24_in_bottrop_2026_02_12t00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Pestalozzistraße 24 in Bottrop', 'historical_import', 'spreadsheet-row-13', 'settled',
    '2026-02-12', 170000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_etw_pestalozzistra_e_24_in_bottrop_2026_02_12t00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_etw_pestalozzistra_e_24_in_bottrop_2026_02_12t00;

-- ETW Scharnhölzfeld 3 in Bottrop | notarised 2026-02-12T00:00:00 | 394700 EUR
with d_etw_scharnh_lzfeld_3_in_bottrop_2026_02_12t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Scharnhölzfeld 3 in Bottrop', 'historical_import', 'spreadsheet-row-15', 'settled',
    '2026-02-12', 394700, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 1.25, null::numeric from d_etw_scharnh_lzfeld_3_in_bottrop_2026_02_12t00_00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_etw_scharnh_lzfeld_3_in_bottrop_2026_02_12t00_00;

-- DHH Ludgeriestraße 3 in Dorsten | notarised 2026-02-19T00:00:00 | 300000 EUR
with d_dhh_ludgeriestra_e_3_in_dorsten_2026_02_19t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'DHH Ludgeriestraße 3 in Dorsten', 'historical_import', 'spreadsheet-row-18', 'settled',
    '2026-02-19', 300000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_dhh_ludgeriestra_e_3_in_dorsten_2026_02_19t00_00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_dhh_ludgeriestra_e_3_in_dorsten_2026_02_19t00_00;

-- ZFH In den Weywiesen 32 in Bottrop | notarised 2026-02-26T00:00:00 | 320000 EUR
with d_zfh_in_den_weywiesen_32_in_bottrop_2026_02_26t00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ZFH In den Weywiesen 32 in Bottrop', 'historical_import', 'spreadsheet-row-20', 'settled',
    '2026-02-26', 320000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_zfh_in_den_weywiesen_32_in_bottrop_2026_02_26t00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_zfh_in_den_weywiesen_32_in_bottrop_2026_02_26t00;

-- RMH Holtfortstraße 43a in Bottrop | notarised 2026-03-11T00:00:00 | 170000 EUR
with d_rmh_holtfortstra_e_43a_in_bottrop_2026_03_11t00_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RMH Holtfortstraße 43a in Bottrop', 'historical_import', 'spreadsheet-row-22', 'settled',
    '2026-03-11', 170000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 1.5, null::numeric from d_rmh_holtfortstra_e_43a_in_bottrop_2026_03_11t00_
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_rmh_holtfortstra_e_43a_in_bottrop_2026_03_11t00_;

-- ZFH Daimlerstraße 36 in Bottrop | notarised 2026-03-12T00:00:00 | 485000 EUR
with d_zfh_daimlerstra_e_36_in_bottrop_2026_03_12t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ZFH Daimlerstraße 36 in Bottrop', 'historical_import', 'spreadsheet-row-24', 'settled',
    '2026-03-12', 485000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 1.5, null::numeric from d_zfh_daimlerstra_e_36_in_bottrop_2026_03_12t00_00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_zfh_daimlerstra_e_36_in_bottrop_2026_03_12t00_00;

-- ETW Lindhorststraße 267 in Bottrop | notarised 2026-03-13T00:00:00 | 370000 EUR
with d_etw_lindhorststra_e_267_in_bottrop_2026_03_13t00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Lindhorststraße 267 in Bottrop', 'historical_import', 'spreadsheet-row-26', 'settled',
    '2026-03-13', 370000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_etw_lindhorststra_e_267_in_bottrop_2026_03_13t00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_etw_lindhorststra_e_267_in_bottrop_2026_03_13t00;

-- EFH Memelstraße 19 in Bottrop | notarised 2026-05-12T00:00:00 | 375000 EUR
with d_efh_memelstra_e_19_in_bottrop_2026_05_12t00_00_0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Memelstraße 19 in Bottrop', 'historical_import', 'spreadsheet-row-29', 'settled',
    '2026-05-12', 375000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_efh_memelstra_e_19_in_bottrop_2026_05_12t00_00_0
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_efh_memelstra_e_19_in_bottrop_2026_05_12t00_00_0;

-- EFH Nathrathstraße 5 in Bottrop | notarised 2026-06-01T00:00:00 | 675000 EUR
with d_efh_nathrathstra_e_5_in_bottrop_2026_06_01t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Nathrathstraße 5 in Bottrop', 'historical_import', 'spreadsheet-row-32', 'settled',
    '2026-06-01', 675000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'seller', 'fixed', null::numeric, 21008.4 from d_efh_nathrathstra_e_5_in_bottrop_2026_06_01t00_00;

-- ETW Zeppelinstraße 96 in Bottrop | notarised 2026-06-03T00:00:00 | 280000 EUR
with d_etw_zeppelinstra_e_96_in_bottrop_2026_06_03t00_0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Zeppelinstraße 96 in Bottrop', 'historical_import', 'spreadsheet-row-33', 'settled',
    '2026-06-03', 280000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_etw_zeppelinstra_e_96_in_bottrop_2026_06_03t00_0
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_etw_zeppelinstra_e_96_in_bottrop_2026_06_03t00_0;

-- ETW Körnerstraße 106b in Bottrop | notarised 2026-06-08T00:00:00 | 763000 EUR
with d_etw_k_rnerstra_e_106b_in_bottrop_2026_06_08t00_0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Körnerstraße 106b in Bottrop', 'historical_import', 'spreadsheet-row-35', 'settled',
    '2026-06-08', 763000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.0, null::numeric from d_etw_k_rnerstra_e_106b_in_bottrop_2026_06_08t00_0
union all
  select id, 'seller', 'percent', 2.0, null::numeric from d_etw_k_rnerstra_e_106b_in_bottrop_2026_06_08t00_0;

-- EFH Lilienthalstraße 4 in Bottrop | notarised 2026-06-17T00:00:00 | 799000 EUR
with d_efh_lilienthalstra_e_4_in_bottrop_2026_06_17t00_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Lilienthalstraße 4 in Bottrop', 'historical_import', 'spreadsheet-row-37', 'settled',
    '2026-06-17', 799000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_efh_lilienthalstra_e_4_in_bottrop_2026_06_17t00_
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_efh_lilienthalstra_e_4_in_bottrop_2026_06_17t00_;

-- RMH Brentanostraße 8 in Bottrop-Kirchhellen | notarised 2026-06-18T00:00:00 | 430000 EUR
with d_rmh_brentanostra_e_8_in_bottrop_kirchhellen_2026 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RMH Brentanostraße 8 in Bottrop-Kirchhellen', 'historical_import', 'spreadsheet-row-39', 'settled',
    '2026-06-18', 430000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_rmh_brentanostra_e_8_in_bottrop_kirchhellen_2026
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_rmh_brentanostra_e_8_in_bottrop_kirchhellen_2026;

-- Grundstück Dietrich-Bonnhöfer-Straße 39 in Wesel | notarised 2026-06-22T00:00:00 | 330000 EUR
with d_grundst_ck_dietrich_bonnh_fer_stra_e_39_in_wesel as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'Grundstück Dietrich-Bonnhöfer-Straße 39 in Wesel', 'historical_import', 'spreadsheet-row-41', 'settled',
    '2026-06-22', 330000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_grundst_ck_dietrich_bonnh_fer_stra_e_39_in_wesel
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_grundst_ck_dietrich_bonnh_fer_stra_e_39_in_wesel;

-- ETW Horsterstraße 10 in Bottrop | notarised 2026-06-23T00:00:00 | 119000 EUR
with d_etw_horsterstra_e_10_in_bottrop_2026_06_23t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Horsterstraße 10 in Bottrop', 'historical_import', 'spreadsheet-row-43', 'settled',
    '2026-06-23', 119000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_etw_horsterstra_e_10_in_bottrop_2026_06_23t00_00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_etw_horsterstra_e_10_in_bottrop_2026_06_23t00_00;

-- ETW Brucker Holt 28 in Essen | notarised 2026-06-25T00:00:00 | 380000 EUR
with d_etw_brucker_holt_28_in_essen_2026_06_25t00_00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Brucker Holt 28 in Essen', 'historical_import', 'spreadsheet-row-46', 'settled',
    '2026-06-25', 380000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_etw_brucker_holt_28_in_essen_2026_06_25t00_00_00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_etw_brucker_holt_28_in_essen_2026_06_25t00_00_00;

-- MFH Gladbecker Straße 283 in Bottrop | notarised 2026-06-25T00:00:00 | 750000 EUR
with d_mfh_gladbecker_stra_e_283_in_bottrop_2026_06_25t as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'MFH Gladbecker Straße 283 in Bottrop', 'historical_import', 'spreadsheet-row-49', 'settled',
    '2026-06-25', 750000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.0, null::numeric from d_mfh_gladbecker_stra_e_283_in_bottrop_2026_06_25t
union all
  select id, 'seller', 'percent', 2.0, null::numeric from d_mfh_gladbecker_stra_e_283_in_bottrop_2026_06_25t;

-- RMH Höchtebögen 4 in Oberhausen | notarised 2026-06-29T00:00:00 | 384000 EUR
with d_rmh_h_chteb_gen_4_in_oberhausen_2026_06_29t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RMH Höchtebögen 4 in Oberhausen', 'historical_import', 'spreadsheet-row-51', 'settled',
    '2026-06-29', 384000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_rmh_h_chteb_gen_4_in_oberhausen_2026_06_29t00_00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_rmh_h_chteb_gen_4_in_oberhausen_2026_06_29t00_00;

-- ETW Fernewaldstraße 275 in Bottrop | notarised 2026-06-30T00:00:00 | 485000 EUR
with d_etw_fernewaldstra_e_275_in_bottrop_2026_06_30t00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Fernewaldstraße 275 in Bottrop', 'historical_import', 'spreadsheet-row-53', 'settled',
    '2026-06-30', 485000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_etw_fernewaldstra_e_275_in_bottrop_2026_06_30t00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_etw_fernewaldstra_e_275_in_bottrop_2026_06_30t00;

-- ETW Schützenstraße 18-20 in Bottrop | notarised 2026-07-15T00:00:00 | 92000 EUR
with d_etw_sch_tzenstra_e_18_20_in_bottrop_2026_07_15t0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Schützenstraße 18-20 in Bottrop', 'historical_import', 'spreadsheet-row-55', 'settled',
    '2026-07-15', 92000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_etw_sch_tzenstra_e_18_20_in_bottrop_2026_07_15t0
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_etw_sch_tzenstra_e_18_20_in_bottrop_2026_07_15t0;

-- ETW Im Mallingforst 38 in Bottrop | notarised 2026-07-30T00:00:00 | 269000 EUR
with d_etw_im_mallingforst_38_in_bottrop_2026_07_30t00_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Im Mallingforst 38 in Bottrop', 'historical_import', 'spreadsheet-row-58', 'settled',
    '2026-07-30', 269000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_etw_im_mallingforst_38_in_bottrop_2026_07_30t00_
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_etw_im_mallingforst_38_in_bottrop_2026_07_30t00_;

-- DHH Herzogstraße 32 in Bottrop | notarised 2026-07-30T00:00:00 | 249000 EUR
with d_dhh_herzogstra_e_32_in_bottrop_2026_07_30t00_00_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'DHH Herzogstraße 32 in Bottrop', 'historical_import', 'spreadsheet-row-60', 'settled',
    '2026-07-30', 249000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_dhh_herzogstra_e_32_in_bottrop_2026_07_30t00_00_
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_dhh_herzogstra_e_32_in_bottrop_2026_07_30t00_00_;

-- EFH Eichendorffstraße 129 in Bottrop | notarised 2026-08-03T00:00:00 | 440000 EUR
with d_efh_eichendorffstra_e_129_in_bottrop_2026_08_03t as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Eichendorffstraße 129 in Bottrop', 'historical_import', 'spreadsheet-row-62', 'settled',
    '2026-08-03', 440000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_efh_eichendorffstra_e_129_in_bottrop_2026_08_03t
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_efh_eichendorffstra_e_129_in_bottrop_2026_08_03t;

-- ZFH Kampstraße 86 in Marl | notarised 2026-08-05T00:00:00 | 525000 EUR
with d_zfh_kampstra_e_86_in_marl_2026_08_05t00_00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ZFH Kampstraße 86 in Marl', 'historical_import', 'spreadsheet-row-64', 'settled',
    '2026-08-05', 525000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.0, null::numeric from d_zfh_kampstra_e_86_in_marl_2026_08_05t00_00_00
union all
  select id, 'seller', 'percent', 2.0, null::numeric from d_zfh_kampstra_e_86_in_marl_2026_08_05t00_00_00;

-- DHH Gustav-Freytag-Straße 23 in Bottrop | notarised 2026-08-25T00:00:00 | 249000 EUR
with d_dhh_gustav_freytag_stra_e_23_in_bottrop_2026_08_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'DHH Gustav-Freytag-Straße 23 in Bottrop', 'historical_import', 'spreadsheet-row-66', 'settled',
    '2026-08-25', 249000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 6.0, null::numeric from d_dhh_gustav_freytag_stra_e_23_in_bottrop_2026_08_
union all
  select id, 'seller', 'percent', 6.0, null::numeric from d_dhh_gustav_freytag_stra_e_23_in_bottrop_2026_08_;

-- MFH Schmiedestraße 33 in Bottrop-Grafenwald | notarised 2026-08-21T00:00:00 | 610000 EUR
with d_mfh_schmiedestra_e_33_in_bottrop_grafenwald_2026 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'MFH Schmiedestraße 33 in Bottrop-Grafenwald', 'historical_import', 'spreadsheet-row-69', 'settled',
    '2026-08-21', 610000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 5.0, null::numeric from d_mfh_schmiedestra_e_33_in_bottrop_grafenwald_2026
union all
  select id, 'seller', 'percent', 5.0, null::numeric from d_mfh_schmiedestra_e_33_in_bottrop_grafenwald_2026;

-- EFH Roonstraße 4 in Bottrop | notarised 2026-09-01T00:00:00 | 575000 EUR
with d_efh_roonstra_e_4_in_bottrop_2026_09_01t00_00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Roonstraße 4 in Bottrop', 'historical_import', 'spreadsheet-row-77', 'settled',
    '2026-09-01', 575000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_efh_roonstra_e_4_in_bottrop_2026_09_01t00_00_00
union all
  select id, 'seller', 'percent', 5.0, null::numeric from d_efh_roonstra_e_4_in_bottrop_2026_09_01t00_00_00;

-- MFH Herzogstraße 27 in Bottrop | notarised 2026-08-07T00:00:00 | 479000 EUR
with d_mfh_herzogstra_e_27_in_bottrop_2026_08_07t00_00_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'MFH Herzogstraße 27 in Bottrop', 'historical_import', 'spreadsheet-row-80', 'settled',
    '2026-08-07', 479000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_mfh_herzogstra_e_27_in_bottrop_2026_08_07t00_00_
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_mfh_herzogstra_e_27_in_bottrop_2026_08_07t00_00_;

-- RMH Thomastraße 30 in Bottrop | notarised 2026-08-31T00:00:00 | 420000 EUR
with d_rmh_thomastra_e_30_in_bottrop_2026_08_31t00_00_0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'RMH Thomastraße 30 in Bottrop', 'historical_import', 'spreadsheet-row-81', 'settled',
    '2026-08-31', 420000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_rmh_thomastra_e_30_in_bottrop_2026_08_31t00_00_0
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_rmh_thomastra_e_30_in_bottrop_2026_08_31t00_00_0;

-- REH Meisenweg 3E in Bottrop-Kirchhellen | notarised 2026-09-10T00:00:00 | 280000 EUR
with d_reh_meisenweg_3e_in_bottrop_kirchhellen_2026_09_ as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'REH Meisenweg 3E in Bottrop-Kirchhellen', 'historical_import', 'spreadsheet-row-85', 'settled',
    '2026-09-10', 280000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_reh_meisenweg_3e_in_bottrop_kirchhellen_2026_09_
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_reh_meisenweg_3e_in_bottrop_kirchhellen_2026_09_;

-- ETW Hansiepenbusch 5 in Bottrop | notarised 2026-09-10T00:00:00 | 369000 EUR
with d_etw_hansiepenbusch_5_in_bottrop_2026_09_10t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'ETW Hansiepenbusch 5 in Bottrop', 'historical_import', 'spreadsheet-row-87', 'settled',
    '2026-09-10', 369000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 2.5, null::numeric from d_etw_hansiepenbusch_5_in_bottrop_2026_09_10t00_00
union all
  select id, 'seller', 'percent', 2.5, null::numeric from d_etw_hansiepenbusch_5_in_bottrop_2026_09_10t00_00;

-- DHH Händelstraße 9A in Gladbeck | notarised 2026-10-01T00:00:00 | 269000 EUR
with d_dhh_h_ndelstra_e_9a_in_gladbeck_2026_10_01t00_00 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'DHH Händelstraße 9A in Gladbeck', 'historical_import', 'spreadsheet-row-89', 'settled',
    '2026-10-01', 269000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_dhh_h_ndelstra_e_9a_in_gladbeck_2026_10_01t00_00
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_dhh_h_ndelstra_e_9a_in_gladbeck_2026_10_01t00_00;

-- EFH Duesbergs Kamp 11 in Dorsten | notarised 2026-08-20T00:00:00 | 435000 EUR
with d_efh_duesbergs_kamp_11_in_dorsten_2026_08_20t00_0 as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Duesbergs Kamp 11 in Dorsten', 'historical_import', 'spreadsheet-row-97', 'settled',
    '2026-08-20', 435000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_efh_duesbergs_kamp_11_in_dorsten_2026_08_20t00_0
union all
  select id, 'seller', 'percent', 3.0, null::numeric from d_efh_duesbergs_kamp_11_in_dorsten_2026_08_20t00_0;

-- EFH Luner Weg 83 in Dorsten | notarised unknown | 290000 EUR
with d_efh_luner_weg_83_in_dorsten_none as (
  insert into public.deals
    (company_id, property_label, source, external_id, status, notarised_on, purchase_price, vat_rate, note)
  values (
    'c788fe5d-0427-4527-9282-12601c4d7884', 'EFH Luner Weg 83 in Dorsten', 'historical_import', 'spreadsheet-efh-luner-weg-83-in-dorsten-none', 'settled',
    null, 290000, 19.0,
    'Imported from 2026_09_Ausgangsrechnungen_Tippgeber.xlsx for statistics only, per Fabian 23 Nov 2026.'
  )
  on conflict (source, external_id) where external_id is not null do nothing
  returning id
)
insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
  select id, 'buyer', 'percent', 3.0, null::numeric from d_efh_luner_weg_83_in_dorsten_none
union all
  select id, 'seller', 'percent', 9.0, null::numeric from d_efh_luner_weg_83_in_dorsten_none;

commit;