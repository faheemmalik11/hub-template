-- 0030_bwa_categories.sql
-- Briefing Screen 4 ("Categories & rules") and Appendix A3: a real two-level cost-category
-- taxonomy, a year-keyed category-to-account mapping, and the two remaining rule-engine pieces
-- the briefing names — bulk rule suggestions from existing receipts, and "learn payment reference
-- and supplier -> category from a confirmed bank match".
--
-- WHAT ALREADY EXISTS, UNTOUCHED BY THIS MIGRATION
--
-- The rule engine itself (migrations 0025, 0028, 0029): multi-dimensional assignment_rules,
-- "a human beats a rule" (cost_category_source/vat_source), retroactive preview before a rule
-- applies, and bulk apply. Rule CONFLICT PRIORITY — the briefing's own open question — is already
-- answered by assignment_rule_specificity(): most-pinned-dimensions wins, ties broken by the
-- newest rule (see 0025's own comment; 0029 says this tested clean across 30 edge cases). This
-- migration carries category_id through that exact same ladder. It does not change the ladder.
--
-- WHAT IS MISSING, AND WHAT THIS MIGRATION ADDS
--
-- invoices.cost_category and assignment_rules.cost_category are free text with no real taxonomy
-- and no link to a DATEV account, which is exactly why the tax advisor still has to categorize by
-- hand. This migration adds:
--   1. bwa_categories       - the two-level taxonomy (≈20 coarse groups, ≈87 fine tags), seeded
--                             from Appendix A3, which the briefing says not to "correct".
--   2. bwa_category_aliases - free-text spelling -> category_id, mirrors entity_aliases (0003).
--   3. bwa_account_mapping  - (fiscal_year, account) -> category_id. DATEV rebuilds the chart of
--                             accounts every year, hence the year in the key. Seeded EMPTY: the
--                             real bwa-mapping-imko.csv (108 real SKR03 accounts) was never handed
--                             over to this repo, and inventing account numbers for a real DATEV
--                             handover would be actively harmful. The Hub's import screen (paste
--                             CSV -> preview -> confirm) is how the real file gets loaded in.
--   4. invoices.category_id / assignment_rules.category_id - additive. The Python ingestion
--      pipeline keeps writing cost_category as an AI-guessed free string, untouched by this
--      migration. category_id is the Hub-owned, structured resolution: apply_assignment_rules
--      writes both together (category_id, plus a canonical cost_category text derived from the
--      category's own name), under the SAME cost_category_source human-lock that already exists.
--      A rule with no category_id (created before this migration, or by the pipeline's own test
--      fixtures which insert cost_category text directly) behaves exactly as before.
--   5. suggest_assignment_rules()      - bulk "supplier -> category" suggestions from existing
--                                        receipts, for the Vorschläge tab.
--   6. learn_assignment_rule_from_match() - called when a bank match is confirmed: upserts a rule
--                                        from the receipt's supplier (+ payment reference, for a
--                                        recurring direct debit) -> its category, so the SAME rule
--                                        engine benefits future invoices from that supplier.
--   7. resolve_transaction_category()  - read-only suggestion for a transaction that has no
--                                        receipt (the offene-posten screen), never an automatic
--                                        booking.
--
-- BACKFILL, CHECKED AGAINST REAL DATA (read-only query, run with explicit go-ahead)
--
-- Distinct invoices.cost_category values in production today: Dienstleistungen (51), Sonstiges
-- (36), empty (22), Technikkosten (16), Rohmaterial (7), Personal (4); 136 rows total. Four of
-- five are too generic to alias to one specific fine tag without guessing — "Sonstiges" or
-- "Dienstleistungen" mapped to a single category would silently miscategorize receipts that don't
-- belong there. Only "Personal" -> the coarse category Personalkosten is an unambiguous, exact
-- match, so that is the only alias seeded from real data below. Everything else stays
-- category_id = null and surfaces honestly as "not yet categorized" in the Vorschläge tab.
--
-- name_de VALUES ARE STANDARD SKR03/BWA TERMINOLOGY, NOT A CLIENT-SPECIFIC TRANSLATION
--
-- This repo only has the English translation of the briefing ("Language: English, translated
-- from the German original"), not the German original of Appendix A3 itself. The German names
-- seeded below are the standard terms used industry-wide in a German BWA (the briefing itself
-- says the evaluation must "reproduce exactly" DATEV's own standard Form 01 line structure, which
-- uses this same vocabulary) — not invented per-client wording. Still worth a quick confirm
-- against the client's real German original before go-live, since this is exactly the document
-- Philipp will compare line-by-line against his DATEV BWA.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='invoices')
  then v_missing := v_missing || 'relation public.invoices'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='assignment_rules')
  then v_missing := v_missing || 'relation public.assignment_rules'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='suppliers')
  then v_missing := v_missing || 'relation public.suppliers'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='bank_transactions')
  then v_missing := v_missing || 'relation public.bank_transactions'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='invoice_transaction_matches')
  then v_missing := v_missing || 'relation public.invoice_transaction_matches'; end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='suppliers' and column_name='iban')
  then v_missing := v_missing || 'column suppliers.iban'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bank_transactions'
                    and column_name='payment_reference')
  then v_missing := v_missing || 'column bank_transactions.payment_reference'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bank_transactions'
                    and column_name='counterparty_iban')
  then v_missing := v_missing || 'column bank_transactions.counterparty_iban'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='bank_transactions'
                    and column_name='transaction_type')
  then v_missing := v_missing || 'column bank_transactions.transaction_type'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoice_transaction_matches'
                    and column_name='invoice_id')
  then v_missing := v_missing || 'column invoice_transaction_matches.invoice_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoice_transaction_matches'
                    and column_name='transaction_id')
  then v_missing := v_missing || 'column invoice_transaction_matches.transaction_id'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='resolve_assignment_rule')
  then v_missing := v_missing || 'function public.resolve_assignment_rule'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='escape_ilike_pattern')
  then v_missing := v_missing || 'function public.escape_ilike_pattern'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'migration 0030 preconditions not met, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;
  raise notice '0030 preconditions ok';
end $$;

-- ===========================================================================
-- 1. bwa_categories — two-level taxonomy (Appendix A3)
-- ===========================================================================
create table if not exists public.bwa_categories (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name_de    text not null,
  name_en    text not null,
  -- null = coarse (top-level) category. A child's own block/line always match its parent's; kept
  -- as plain columns rather than derived, so a fine tag is queryable on its own without a join.
  parent_id  uuid references public.bwa_categories(id) on delete restrict,
  bwa_block  text not null check (bwa_block in
               ('einnahmen', 'wareneinsatz', 'kosten', 'neutral', 'steuern', 'sonderfall')),
  bwa_line   text not null,
  -- "Belongs in no evaluation line" (Appendix A3): asset addition, loan repayment, deposit,
  -- private withdrawal, VAT payment. Actively excludes the amount from the P&L once the bank is
  -- connected — without this flag the evaluation computes fantasy figures (A3's own words).
  is_nicht_guv boolean not null default false,
  -- "Nicht zugeordnet" (not assigned): the catch-all a receipt lands in until a human resolves it.
  is_catchall  boolean not null default false,
  is_active  boolean not null default true,
  note       text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete only: "every category remains changeable and deletable at any time" (briefing),
  -- but a deleted category must not vanish from any rule/receipt that already references it.
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text
);

create unique index if not exists bwa_categories_code_uniq on public.bwa_categories (code);
create index if not exists bwa_categories_parent on public.bwa_categories (parent_id);
create index if not exists bwa_categories_active on public.bwa_categories (parent_id) where is_active and deleted_at is null;

alter table public.bwa_categories enable row level security;
drop policy if exists "bwa_categories_read" on public.bwa_categories;
create policy "bwa_categories_read" on public.bwa_categories for select to authenticated using (true);
drop policy if exists "bwa_categories_insert" on public.bwa_categories;
create policy "bwa_categories_insert" on public.bwa_categories for insert to authenticated with check (true);
drop policy if exists "bwa_categories_update" on public.bwa_categories;
create policy "bwa_categories_update" on public.bwa_categories for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 1a. Coarse categories (18 BWA-line groups + the 2 special cases)
-- ---------------------------------------------------------------------------
insert into public.bwa_categories (code, name_de, name_en, bwa_block, bwa_line, is_nicht_guv, is_catchall)
values
  ('REVENUE',            'Umsatzerlöse',                       'Revenue',                    'einnahmen',    'umsatzerloese',               false, false),
  ('OTHER_OP_INCOME',     'Sonstige betriebliche Erträge',      'Other operating income',     'einnahmen',    'sonstige_betriebliche_ertraege', false, false),
  ('COGS_MATERIAL',       'Materialaufwand / Wareneinsatz',     'Cost of materials / goods',  'wareneinsatz', 'materialaufwand',             false, false),
  ('PERSONNEL',           'Personalkosten',                     'Personnel costs',            'kosten',       'personalkosten',              false, false),
  ('OCCUPANCY',           'Raumkosten',                         'Occupancy costs',            'kosten',       'raumkosten',                  false, false),
  ('BUSINESS_TAX',        'Betriebliche Steuern',               'Business taxes',             'kosten',       'betriebliche_steuern',        false, false),
  ('INSURANCE',           'Versicherungen / Beiträge',          'Insurance / contributions',  'kosten',       'versicherungen_beitraege',    false, false),
  ('VEHICLE',             'Kfz-Kosten (ohne Steuer)',           'Vehicle costs (excl. tax)',  'kosten',       'kfz_kosten',                  false, false),
  ('ADVERTISING_TRAVEL',  'Werbe- / Reisekosten',               'Advertising / travel costs', 'kosten',       'werbe_reisekosten',           false, false),
  ('COGS_SOLD',           'Kosten der bezogenen Leistungen',    'Cost of goods sold',         'kosten',       'kosten_bezogener_leistungen', false, false),
  ('DEPRECIATION',        'Abschreibungen',                     'Depreciation',               'kosten',       'abschreibungen',              false, false),
  ('REPAIR_MAINTENANCE',  'Reparatur / Instandhaltung',         'Repair / maintenance',       'kosten',       'reparatur_instandhaltung',    false, false),
  ('OTHER_COSTS',         'Sonstige Kosten',                    'Other costs',                'kosten',       'sonstige_kosten',             false, false),
  ('INTEREST_EXPENSE',    'Zinsaufwand',                        'Interest expense',           'neutral',      'zinsaufwand',                 false, false),
  ('OTHER_NEUTRAL_EXPENSE','Sonstiger neutraler Aufwand',       'Other neutral expense',      'neutral',      'sonstiger_neutraler_aufwand', false, false),
  ('INTEREST_INCOME',     'Zinserträge',                        'Interest income',            'neutral',      'zinsertraege',                false, false),
  ('OTHER_NEUTRAL_INCOME','Sonstige neutrale Erträge',          'Other neutral income',       'neutral',      'sonstige_neutrale_ertraege',  false, false),
  ('TAX_INCOME_EARNINGS', 'Steuern vom Einkommen und Ertrag',   'Taxes income and earnings',  'steuern',      'steuern_einkommen_ertrag',    false, false),
  ('UNASSIGNED',          'Nicht zugeordnet',                   'Not assigned',               'sonderfall',   'nicht_zugeordnet',            false, true),
  ('NOT_PNL',             'Gehört in keine Auswertungszeile',   'Belongs in no evaluation line', 'sonderfall','nicht_guv',                   true,  false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 1b. Fine tags, joined to their coarse parent by code
-- ---------------------------------------------------------------------------
insert into public.bwa_categories (code, name_de, name_en, parent_id, bwa_block, bwa_line, is_nicht_guv, note)
select v.code, v.name_de, v.name_en, p.id, p.bwa_block, p.bwa_line, p.is_nicht_guv, v.note
from (values
  -- Revenue
  ('REV_TAXFREE',            'Einkünfte steuerfrei',                 'Income tax-exempt',              'REVENUE', null),
  ('REV_COMMERCIAL',         'Mieteinnahmen gewerblich',             'Rental income commercial',       'REVENUE', null),
  ('REV_OTHER7',             'Sonstige Erträge 7%',                  'Other income 7%',                'REVENUE', null),
  ('REV_OTHER19',            'Sonstige Erträge 19%',                 'Other income 19%',               'REVENUE', null),
  ('REV_WORKSHOP',           'Workshop / Seminar',                   'Workshop / seminar',              'REVENUE', null),
  ('REV_BROKER',             'Vermittlungsprovision',                'Broker commission',              'REVENUE', null),
  ('REV_TENANT_MEETINGS',    'Mieterversammlungen',                  'Tenant meetings',                'REVENUE', null),
  ('REV_DISCOUNT_GRANTED',   'Skonto gewährt',                       'Discount granted',               'REVENUE', null),
  ('REV_INTERCOMPANY',       'Konzernumsatz',                        'Intercompany revenue',           'REVENUE', null),
  -- Other operating income
  ('OOI_FX_GAIN',            'Währungsgewinn',                       'Currency gain',                  'OTHER_OP_INCOME', null),
  -- Cost of materials / goods
  ('COG_EXT_SERVICE',        'Fremdleistung (Wareneinsatz)',         'External service (cost of goods)','COGS_MATERIAL', null),
  ('COG_CONSTRUCTION_13B',   'Bauleistung § 13b',                    'Construction service § 13b',     'COGS_MATERIAL', null),
  ('COG_PURCHASE',           'Wareneinkauf',                         'Purchase of goods',              'COGS_MATERIAL', null),
  ('COG_DISCOUNT_RECEIVED',  'Skonto erhalten',                      'Discount received',              'COGS_MATERIAL', null),
  ('COG_BONUS_RECEIVED',     'Bonus erhalten',                       'Bonus received',                 'COGS_MATERIAL', null),
  -- Personnel costs
  ('PER_SALARIES',           'Gehälter',                             'Salaries',                       'PERSONNEL', null),
  ('PER_MD_SALARY',          'Geschäftsführergehalt',                'Managing-director salary',       'PERSONNEL', null),
  ('PER_SOCIAL',             'Soziale Abgaben',                      'Social contributions',           'PERSONNEL', null),
  ('PER_VOLUNTARY',          'Freiwillige soziale Leistungen',       'Voluntary social benefits',      'PERSONNEL', null),
  ('PER_WAGE_SUBSIDY',       'Lohnzuschuss',                         'Wage subsidy',                   'PERSONNEL', null),
  ('PER_MINIJOB',            'Minijob / Aushilfen',                  'Minijob / temp help',            'PERSONNEL', null),
  -- Occupancy costs
  ('OCC_OFFICE_RENT',        'Büromiete',                            'Office rent',                    'OCCUPANCY', null),
  ('OCC_WEG',                'WEG- / Nebenkosten',                   'WEG / ancillary costs',          'OCCUPANCY', null),
  ('OCC_ENERGY',             'Energie',                              'Energy',                         'OCCUPANCY', null),
  ('OCC_CLEANING',           'Reinigung',                            'Cleaning',                       'OCCUPANCY', null),
  ('OCC_MAINTENANCE',        'Büroinstandhaltung',                   'Office maintenance',             'OCCUPANCY', null),
  ('OCC_LEVIES',             'Grundbesitzabgaben',                   'Real-estate levies',             'OCCUPANCY', null),
  ('OCC_OTHER',              'Sonstige Raumkosten',                  'Other occupancy costs',          'OCCUPANCY', null),
  ('OCC_LAND',               'Grundstücksaufwand',                   'Land expense',                   'OCCUPANCY', null),
  -- Business taxes
  ('TAXB_PROPERTY',          'Grundsteuer',                          'Property tax',                   'BUSINESS_TAX', null),
  ('TAXB_VEHICLE',           'Kfz-Steuer',                           'Vehicle tax',                     'BUSINESS_TAX', null),
  -- Insurance / contributions
  ('INS_GENERAL',            'Versicherungen',                       'Insurance',                      'INSURANCE', null),
  ('INS_BUILDING',           'Gebäudeversicherung',                  'Building insurance',             'INSURANCE', null),
  ('INS_MEMBERSHIP',         'Beiträge / Mitgliedschaften',          'Contributions / memberships',    'INSURANCE', null),
  ('INS_OTHER',              'Sonstige Abgaben',                     'Other levies',                   'INSURANCE', null),
  -- Vehicle costs
  ('VEH_INSURANCE',          'Kfz-Versicherung',                     'Vehicle insurance',              'VEHICLE', null),
  ('VEH_FUEL',               'Kraftstoff / Betriebskosten',          'Fuel / operating costs',         'VEHICLE', null),
  ('VEH_REPAIR',             'Kfz-Reparatur',                        'Vehicle repair',                 'VEHICLE', null),
  ('VEH_TOLL',               'Maut',                                 'Toll',                           'VEHICLE', null),
  ('VEH_LEASING',            'Kfz-Leasing',                          'Vehicle leasing',                'VEHICLE', null),
  ('VEH_OTHER',              'Sonstige Kfz-Kosten',                  'Other vehicle costs',            'VEHICLE', null),
  -- Advertising / travel costs
  ('ADV_MARKETING',          'Werbung / Marketing',                  'Marketing / advertising',        'ADVERTISING_TRAVEL', null),
  ('ADV_GIFTS',              'Geschenke',                            'Gifts',                          'ADVERTISING_TRAVEL', null),
  ('ADV_HOSPITALITY',        'Bewirtung',                            'Hospitality',                    'ADVERTISING_TRAVEL', null),
  ('ADV_SMALL_COURTESIES',   'Aufmerksamkeiten',                     'Small courtesies',               'ADVERTISING_TRAVEL', null),
  ('ADV_HOSPITALITY_ND',     'Bewirtung (nicht abzugsfähig)',        'Hospitality (non-deductible)',   'ADVERTISING_TRAVEL', null),
  ('ADV_NONDEDUCTIBLE',      'Nicht abzugsfähige Betriebsausgaben',  'Non-deductible expenses',        'ADVERTISING_TRAVEL', null),
  ('ADV_TRAVEL',             'Reisekosten',                          'Travel costs',                   'ADVERTISING_TRAVEL', null),
  ('ADV_ACCOUNT_4620',       'Sonstiges (Konto 4620)',               'Other (account 4620)',
    'ADVERTISING_TRAVEL', 'Konto 4620 ist beim Steuerberater noch offen (Appendix A3) — keine Kontonummer annehmen, bis er sie bestätigt hat.'),
  -- Cost of goods sold
  ('COGS_WARRANTY',          'Gewährleistung',                       'Warranty',                       'COGS_SOLD', null),
  -- Depreciation
  ('DEP_DEPRECIATION',       'Abschreibungen',                       'Depreciation',                   'DEPRECIATION', null),
  -- Repair / maintenance
  ('REP_SOFTWARE',           'Softwarepflege',                       'Software maintenance',           'REPAIR_MAINTENANCE', null),
  -- Other costs
  ('OTH_OPEX',               'Sonstiger betrieblicher Aufwand',      'Other operating expenses',       'OTHER_COSTS', null),
  ('OTH_EXT_SERVICE',        'Fremdleistung (sonstige)',             'External service (other)',       'OTHER_COSTS', null),
  ('OTH_POSTAGE',            'Porto / Versand',                      'Postage / shipping',             'OTHER_COSTS', null),
  ('OTH_PHONE',              'Telefon',                              'Telephone',                      'OTHER_COSTS', null),
  ('OTH_INTERNET',           'Internet',                             'Internet',                       'OTHER_COSTS', null),
  ('OTH_OFFICE_SUPPLIES',    'Büromaterial',                         'Office supplies',                'OTHER_COSTS', null),
  ('OTH_TRAINING',           'Fortbildung',                          'Training',                       'OTHER_COSTS', null),
  ('OTH_LEGAL',              'Rechts- / Beratungskosten',            'Legal / consulting costs',       'OTHER_COSTS', null),
  ('OTH_BOOKKEEPING',        'Buchführung / steuerliche Beratung',   'Bookkeeping / tax advice',       'OTHER_COSTS', null),
  ('OTH_FURNISHINGS_RENT',   'Miete bewegliche Wirtschaftsgüter',    'Rent of furnishings (movable)',  'OTHER_COSTS', null),
  ('OTH_SOFTWARE_LICENSES',  'Software / Lizenzen',                  'Software / licenses',            'OTHER_COSTS', null),
  ('OTH_WASTE',              'Entsorgung',                           'Waste disposal',                 'OTHER_COSTS', null),
  ('OTH_BANK_CHARGES',       'Bankgebühren',                         'Bank charges',                   'OTHER_COSTS', null),
  ('OTH_SUPPLIES',           'Sonstiger Betriebsbedarf',             'Other operating supplies',       'OTHER_COSTS', null),
  -- Interest expense
  ('INT_EXP',                'Zinsaufwand',                         'Interest expense',               'INTEREST_EXPENSE', null),
  -- Other neutral expense
  ('NEU_PRIOR_EXPENSE',      'Periodenfremder Aufwand',              'Prior-period expense',           'OTHER_NEUTRAL_EXPENSE', null),
  ('NEU_DONATION',           'Spenden',                              'Donation',                       'OTHER_NEUTRAL_EXPENSE', null),
  -- Interest income
  ('INT_INC_PARTICIPATION',  'Beteiligungserträge',                  'Participation income',           'INTEREST_INCOME', null),
  ('INT_INC_INTEREST',       'Zinserträge',                          'Interest income',                'INTEREST_INCOME', null),
  -- Other neutral income
  ('NEU_ASSET_DISPOSAL',     'Anlagenabgang',                        'Asset disposal',                 'OTHER_NEUTRAL_INCOME', null),
  ('NEU_PRIOR_INCOME',       'Periodenfremder Ertrag',                'Prior-period income',            'OTHER_NEUTRAL_INCOME', null),
  ('NEU_OTHER_IRREGULAR',    'Sonstige außerordentliche Erträge',    'Other irregular income',         'OTHER_NEUTRAL_INCOME', null),
  ('NEU_DEBT_WAIVER',        'Erträge aus Forderungsverzicht',       'Income from debt waiver',        'OTHER_NEUTRAL_INCOME', null),
  ('NEU_CONTINUED_PAY',      'Erstattung Entgeltfortzahlung',        'Continued-pay reimbursement',    'OTHER_NEUTRAL_INCOME', null),
  ('NEU_RESIDENTIAL_TAXFREE','Mieteinnahmen Wohnen (steuerfrei)',    'Rental income residential (tax-exempt)', 'OTHER_NEUTRAL_INCOME', null),
  ('NEU_ASSET_SALE_GAIN',    'Anlagenverkauf (Gewinn)',              'Asset sale (gain)',              'OTHER_NEUTRAL_INCOME', null),
  -- Taxes income and earnings
  ('TAX_CORPORATE',          'Körperschaftsteuer',                   'Corporate tax',                  'TAX_INCOME_EARNINGS', null),
  ('TAX_SOLIDARITY',         'Solidaritätszuschlag',                 'Solidarity surcharge',           'TAX_INCOME_EARNINGS', null),
  ('TAX_TRADE',              'Gewerbesteuer',                        'Trade tax',                      'TAX_INCOME_EARNINGS', null),
  -- Belongs in no evaluation line (NICHT_GUV)
  ('NGV_ASSET_ADDITION',     'Anlagenzugang',                        'Asset addition',                 'NOT_PNL', null),
  ('NGV_LOAN_REPAYMENT',     'Darlehenstilgung',                     'Loan repayment',                 'NOT_PNL', null),
  ('NGV_DEPOSIT',            'Kaution / Einlage',                    'Deposit',                        'NOT_PNL', null),
  ('NGV_PRIVATE_WITHDRAWAL', 'Privatentnahme',                       'Private withdrawal',             'NOT_PNL', null),
  ('NGV_VAT_PAYMENT',        'Umsatzsteuerzahlung',                  'VAT payment',                    'NOT_PNL', null)
) as v(code, name_de, name_en, parent_code, note)
join public.bwa_categories p on p.code = v.parent_code
on conflict (code) do nothing;

-- ===========================================================================
-- 2. bwa_category_aliases — free-text spelling -> category_id (mirrors entity_aliases, 0003)
-- ===========================================================================
create table if not exists public.bwa_category_aliases (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.bwa_categories(id) on delete cascade,
  alias       text not null,
  is_active   boolean not null default true,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists bwa_category_aliases_uniq
  on public.bwa_category_aliases (lower(btrim(alias)));
create index if not exists bwa_category_aliases_lookup
  on public.bwa_category_aliases (category_id) where is_active;

alter table public.bwa_category_aliases enable row level security;
drop policy if exists "bwa_category_aliases_read" on public.bwa_category_aliases;
create policy "bwa_category_aliases_read" on public.bwa_category_aliases for select to authenticated using (true);
drop policy if exists "bwa_category_aliases_insert" on public.bwa_category_aliases;
create policy "bwa_category_aliases_insert" on public.bwa_category_aliases for insert to authenticated with check (true);
drop policy if exists "bwa_category_aliases_update" on public.bwa_category_aliases;
create policy "bwa_category_aliases_update" on public.bwa_category_aliases for update to authenticated using (true) with check (true);

-- Every category's own name (DE and EN) resolves to itself, so exact-name text already in the
-- system (either language) matches immediately.
insert into public.bwa_category_aliases (category_id, alias)
select id, name_de from public.bwa_categories
union all
select id, name_en from public.bwa_categories
on conflict (lower(btrim(alias))) do nothing;

-- The one confident real-data alias (see the migration header): invoices.cost_category = 'Personal'
-- (4 rows, read-only-verified 2026-07-29) maps unambiguously to the coarse Personalkosten category.
insert into public.bwa_category_aliases (category_id, alias, note)
select id, 'Personal',
  'Backfilled from production: invoices.cost_category = ''Personal'' (4 rows) is an unambiguous '
  'match for this coarse category. The other real values in use at the time (Dienstleistungen, '
  'Sonstiges, Technikkosten, Rohmaterial) were deliberately NOT aliased — too generic to map to '
  'one specific category without guessing. See migration 0030.'
from public.bwa_categories where code = 'PERSONNEL'
on conflict (lower(btrim(alias))) do nothing;

-- ===========================================================================
-- 3. bwa_account_mapping — (fiscal_year, account) -> category_id, seeded EMPTY
-- ===========================================================================
create table if not exists public.bwa_account_mapping (
  id          uuid primary key default gen_random_uuid(),
  fiscal_year int not null check (fiscal_year between 2000 and 2100),
  account     text not null,
  category_id uuid not null references public.bwa_categories(id),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text
);

-- NOT partial (no `where deleted_at is null`), unlike most soft-delete uniqueness constraints in
-- this codebase. The CSV import writes via Supabase's `.upsert(rows, { onConflict:
-- "fiscal_year,account" })`, which emits a plain `ON CONFLICT (fiscal_year, account)` — Postgres
-- only accepts a partial index as that clause's arbiter when the same predicate is repeated in the
-- ON CONFLICT clause itself, which the JS client's upsert helper has no way to do. A partial index
-- here would make every import call fail outright, not just a genuine conflict. There is no delete
-- action in the UI for this table yet, so the tradeoff (a soft-deleted row would still occupy its
-- (year, account) slot) is theoretical for now; revisit together if that changes.
create unique index if not exists bwa_account_mapping_year_account_uniq
  on public.bwa_account_mapping (fiscal_year, account);
create index if not exists bwa_account_mapping_category on public.bwa_account_mapping (category_id);

comment on table public.bwa_account_mapping is
  'Category-to-DATEV-account mapping, keyed by fiscal year because DATEV rebuilds the chart of '
  'accounts every year. Seeded empty (migration 0030) — the real accounts arrive via the Hub''s '
  'CSV import screen, never guessed here.';

alter table public.bwa_account_mapping enable row level security;
drop policy if exists "bwa_account_mapping_read" on public.bwa_account_mapping;
create policy "bwa_account_mapping_read" on public.bwa_account_mapping for select to authenticated using (true);
drop policy if exists "bwa_account_mapping_insert" on public.bwa_account_mapping;
create policy "bwa_account_mapping_insert" on public.bwa_account_mapping for insert to authenticated with check (true);
drop policy if exists "bwa_account_mapping_update" on public.bwa_account_mapping;
create policy "bwa_account_mapping_update" on public.bwa_account_mapping for update to authenticated using (true) with check (true);

-- ===========================================================================
-- 4. category_id on invoices and assignment_rules (additive)
-- ===========================================================================
alter table public.invoices
  add column if not exists category_id uuid references public.bwa_categories(id);
alter table public.assignment_rules
  add column if not exists category_id uuid references public.bwa_categories(id);

create index if not exists idx_invoices_category on public.invoices (category_id);
create index if not exists idx_assignment_rules_category on public.assignment_rules (category_id);

comment on column public.invoices.category_id is
  'Structured taxonomy reference (bwa_categories), additive to the free-text cost_category the '
  'pipeline writes. Written by apply_assignment_rules alongside a canonical cost_category text, '
  'under the same cost_category_source human-lock. Null means "not yet categorized". See 0030.';
comment on column public.assignment_rules.category_id is
  'Structured taxonomy reference. A rule created before migration 0030 (or inserted directly by '
  'the pipeline''s own test fixtures) may have this null and only a free-text cost_category — '
  'resolution falls back to comparing that text exactly as it did before this migration.';

-- ===========================================================================
-- 5. Rule engine: category_id-aware preview + apply
-- ===========================================================================
-- resolve_assignment_rule is UNCHANGED: it only decides WHICH rule wins, not what value it
-- carries, so it needs no edit here.

create or replace function public.assignment_rule_preview(p_rule uuid)
returns table (matches bigint, would_change bigint)
language plpgsql
stable
set search_path = public
as $$
declare
  r public.assignment_rules;
begin
  select * into r from public.assignment_rules where id = p_rule;
  if not found then
    return query select 0::bigint, 0::bigint;
    return;
  end if;

  return query
  with cand as (
    select i.id, i.category_id, i.cost_category, i.cost_category_source,
           i.vat_rate, i.vat_treatment, i.vat_source
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
       and (r.business_line_id is null or r.business_line_id = i.business_line_id)
       and (r.property_id      is null or r.property_id      = i.property_id)
       and (r.company_id       is null or r.company_id       = i.company_id)
       and (
         r.reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      where public.resolve_assignment_rule(c.id, r.target) = r.id
        and case r.target
              when 'cost_category' then
                coalesce(c.cost_category_source, 'ai') <> 'human'
                and (
                  (r.category_id is not null and c.category_id is distinct from r.category_id)
                  or (r.category_id is null and coalesce(c.cost_category, '') <> coalesce(r.cost_category, ''))
                )
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (coalesce(c.vat_rate, -1) <> coalesce(r.vat_rate, -1)
                     or coalesce(c.vat_treatment, '') <> coalesce(r.vat_treatment, ''))
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview(uuid) is
  'Retroactive impact of one rule. cost_category compares by category_id when the rule has one, '
  'else by text (0030); vat_rate compares rate or treatment (0029).';

-- Adding p_category_id extends the parameter list, which Postgres would otherwise register as a
-- second overload alongside the 10-parameter version rather than replacing it (bit both 0028 and
-- 0029 already hit this and drop explicitly first — same fix here).
drop function if exists public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text
);

create or replace function public.assignment_rule_preview_scope(
  p_target            text,
  p_cost_category     text    default null,
  p_vat_rate          numeric default null,
  p_supplier_id       uuid    default null,
  p_business_line_id  uuid    default null,
  p_property_id       uuid    default null,
  p_company_id        uuid    default null,
  p_reference_pattern text    default null,
  p_exclude_rule      uuid    default null,
  p_vat_treatment     text    default null,
  p_category_id       uuid    default null
)
returns table (matches bigint, would_change bigint)
language plpgsql
stable
set search_path = public
as $$
declare
  v_spec int := public.assignment_rule_specificity(
    p_reference_pattern, p_supplier_id, p_business_line_id, p_property_id, p_company_id
  );
begin
  return query
  with cand as (
    select
      i.category_id, i.cost_category, i.cost_category_source, i.vat_rate, i.vat_treatment, i.vat_source,
      (
        select max(r.specificity)
          from public.assignment_rules r
         where r.is_active
           and r.deleted_at is null
           and r.target = p_target
           and (p_exclude_rule is null or r.id <> p_exclude_rule)
           and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
           and (r.business_line_id is null or r.business_line_id = i.business_line_id)
           and (r.property_id      is null or r.property_id      = i.property_id)
           and (r.company_id       is null or r.company_id       = i.company_id)
           and (
             r.reference_pattern is null
             or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
           )
      ) as best
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and (p_supplier_id      is null or p_supplier_id      = i.supplier_id)
       and (p_business_line_id is null or p_business_line_id = i.business_line_id)
       and (p_property_id      is null or p_property_id      = i.property_id)
       and (p_company_id       is null or p_company_id        = i.company_id)
       and (
         p_reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(p_reference_pattern) || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      where (c.best is null or c.best <= v_spec)
        and case p_target
              when 'cost_category' then
                coalesce(c.cost_category_source, 'ai') <> 'human'
                and (
                  (p_category_id is not null and c.category_id is distinct from p_category_id)
                  or (p_category_id is null and coalesce(c.cost_category, '') <> coalesce(p_cost_category, ''))
                )
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (coalesce(c.vat_rate, -1) <> coalesce(p_vat_rate, -1)
                     or coalesce(c.vat_treatment, '') <> coalesce(p_vat_treatment, ''))
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview_scope is
  'Retroactive impact of a prospective rule, before it is saved. Pass p_exclude_rule when '
  're-previewing an existing rule. Counts a category_id (or vat_treatment) -only mismatch too (0030).';

grant execute on function public.assignment_rule_preview(uuid) to authenticated;
grant execute on function public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text, uuid
) to authenticated;

create or replace function public.apply_assignment_rules(p_invoice uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv          public.invoices;
  v_rule         public.assignment_rules;
  v_changed      jsonb := '[]'::jsonb;
  v_skipped      jsonb := '[]'::jsonb;
  v_log_lines    text[] := array[]::text[];
  v_new_amount   numeric;
  v_new_net      numeric;
  v_new_cat_name text;
  v_cat_changed  boolean;
begin
  select * into v_inv from public.invoices where id = p_invoice and deleted_at is null;
  if not found then
    raise exception 'invoice % not found or deleted', p_invoice;
  end if;

  -- Cost category (+ structured category_id, migration 0030). A rule's category_id is canonical
  -- when set; cost_category text is then DERIVED from the category's own name, so a legacy reader
  -- of the free-text column always agrees with the structured value. A rule with no category_id
  -- (pre-0030, or the pipeline's own test fixtures that insert cost_category text directly)
  -- behaves exactly as before this migration.
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'cost_category');
  if found then
    if coalesce(v_inv.cost_category_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'cost_category', 'reason', 'human', 'rule_id', v_rule.id);
    else
      if v_rule.category_id is not null then
        select name_de into v_new_cat_name from public.bwa_categories where id = v_rule.category_id;
        v_cat_changed := v_inv.category_id is distinct from v_rule.category_id;
      else
        v_new_cat_name := v_rule.cost_category;
        v_cat_changed := coalesce(v_inv.cost_category, '') <> coalesce(v_rule.cost_category, '');
      end if;

      if v_cat_changed then
        update public.invoices
           set category_id = v_rule.category_id,
               cost_category = coalesce(v_new_cat_name, v_rule.cost_category),
               cost_category_source = 'rule',
               updated_at = now()
         where id = p_invoice;
        v_changed := v_changed || jsonb_build_object(
          'field', 'cost_category', 'from', v_inv.cost_category,
          'to', coalesce(v_new_cat_name, v_rule.cost_category), 'rule_id', v_rule.id);
        v_log_lines := v_log_lines || format('Kostenkategorie: %s -> %s (Regel)',
          coalesce(v_inv.cost_category, 'ohne'), coalesce(v_new_cat_name, v_rule.cost_category));
      end if;
    end if;
  end if;

  -- VAT rate + treatment: unchanged from migrations 0028/0029.
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    elsif coalesce(v_inv.vat_rate, -1) <> coalesce(v_rule.vat_rate, -1)
       or coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '') then
      if v_inv.amount_gross is not null and v_rule.vat_rate is not null then
        v_new_amount := round(v_inv.amount_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), 2);
        v_new_net    := v_inv.amount_gross - v_new_amount;
      else
        v_new_net    := v_inv.amount_net;
        v_new_amount := case when v_rule.vat_rate is null then null
                             else round(coalesce(v_inv.amount_net, 0) * v_rule.vat_rate / 100, 2) end;
      end if;

      update public.invoices
         set vat_rate = v_rule.vat_rate,
             vat_amount = v_new_amount,
             amount_net = v_new_net,
             vat_treatment = v_rule.vat_treatment,
             vat_source = 'rule',
             updated_at = now()
       where id = p_invoice;
      v_changed := v_changed || jsonb_build_object(
        'field', 'vat_rate', 'from', v_inv.vat_rate, 'to', v_rule.vat_rate, 'rule_id', v_rule.id)
        || jsonb_build_object(
        'field', 'vat_amount', 'from', v_inv.vat_amount, 'to', v_new_amount, 'rule_id', v_rule.id);
      if coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '') then
        v_changed := v_changed || jsonb_build_object(
          'field', 'vat_treatment', 'from', v_inv.vat_treatment, 'to', v_rule.vat_treatment,
          'rule_id', v_rule.id);
      end if;
      v_log_lines := v_log_lines || format(
        'USt-Satz: %s -> %s (Regel, USt-Betrag angepasst: %s -> %s%s)',
        coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text,
        coalesce(v_inv.vat_amount::text, 'ohne'), coalesce(v_new_amount::text, 'ohne'),
        case when v_rule.vat_treatment is not null
             then ', Behandlung: ' || v_rule.vat_treatment else '' end);
    end if;
  end if;

  if array_length(v_log_lines, 1) > 0 then
    insert into public.invoice_history (invoice_id, type, text, data, actor)
    values (
      p_invoice,
      'regel',
      array_to_string(v_log_lines, ' · '),
      jsonb_build_object('changed', v_changed, 'skipped', v_skipped),
      p_actor
    );
  end if;

  return jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
end $$;

comment on function public.apply_assignment_rules(uuid, text) is
  'Applies the winning cost-category (+ structured category_id, 0030) and VAT rules to one '
  'receipt, never overwriting a human-set value, and logs what changed to invoice_history.';

grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;

-- ===========================================================================
-- 6. Bulk rule suggestions from existing receipts (Vorschläge tab)
-- ===========================================================================
-- "Go through the initial suggestion list: the system looks at the already existing receipts and
-- suggests a whole list of 'supplier -> category'." Groups receipts NOT currently covered by an
-- active rule (resolve_assignment_rule returns null), by supplier + their most common category,
-- so confirming this list creates exactly the rules that would have the most retroactive effect.
create or replace function public.suggest_assignment_rules()
returns table (
  supplier_id      uuid,
  category_id      uuid,
  cost_category    text,
  receipt_count    bigint,
  total_receipts   bigint
)
language sql
stable
set search_path = public
as $$
  with base as (
    select i.id, i.supplier_id, i.category_id, i.cost_category
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and i.supplier_id is not null
       and (i.category_id is not null or coalesce(i.cost_category, '') <> '')
       and public.resolve_assignment_rule(i.id, 'cost_category') is null
  ),
  grouped as (
    select supplier_id, category_id, cost_category, count(*) as n
      from base
     group by supplier_id, category_id, cost_category
  ),
  ranked as (
    select *, row_number() over (partition by supplier_id order by n desc) as rnk
      from grouped
  ),
  totals as (
    select supplier_id, count(*) as total from base group by supplier_id
  )
  select r.supplier_id, r.category_id, r.cost_category, r.n, t.total
    from ranked r
    join totals t on t.supplier_id = r.supplier_id
   where r.rnk = 1
   order by t.total desc;
$$;

comment on function public.suggest_assignment_rules() is
  'Suppliers not yet covered by an active cost_category rule, grouped by their most common '
  'existing category, for the Vorschläge tab. See migration 0030.';

grant execute on function public.suggest_assignment_rules() to authenticated;

-- ===========================================================================
-- 7. Learn from a confirmed bank match
-- ===========================================================================
-- "Once a receipt is matched to a transaction, the system should learn payment reference and
-- supplier to category mapping." Only learns from a rule- or human-decided category, never a bare
-- AI guess — the same "a human beats the AI" standard the rest of this engine already holds to,
-- just applied to what gets taught rather than what gets overwritten.
--
-- The reference pattern is only learned for a recurring direct debit (transaction_type =
-- 'lastschrift'): that is the "frequent case of recurring debits" the briefing names, where the
-- SAME payment reference really does recur verbatim period after period. For any other movement
-- (a transfer, say) the reference usually varies per invoice, so only a plain supplier-level rule
-- is learned — a wrong reference pattern would silently narrow the rule to invoices that happen to
-- share today's exact wording.
create or replace function public.learn_assignment_rule_from_match(p_match uuid, p_actor text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match   public.invoice_transaction_matches;
  v_inv     public.invoices;
  v_txn     public.bank_transactions;
  v_pattern text;
  v_existing uuid;
  v_rule_id  uuid;
begin
  select * into v_match from public.invoice_transaction_matches where id = p_match;
  if not found then
    return null;
  end if;

  select * into v_inv from public.invoices where id = v_match.invoice_id and deleted_at is null;
  if not found or v_inv.supplier_id is null then
    return null;
  end if;

  if coalesce(v_inv.cost_category_source, 'ai') not in ('rule', 'human') then
    return null;
  end if;
  if v_inv.category_id is null and coalesce(v_inv.cost_category, '') = '' then
    return null;
  end if;

  select * into v_txn from public.bank_transactions where id = v_match.transaction_id;
  if found and v_txn.transaction_type = 'lastschrift' and coalesce(v_txn.payment_reference, '') <> '' then
    v_pattern := v_txn.payment_reference;
  else
    v_pattern := null;
  end if;

  select id into v_existing
    from public.assignment_rules
   where target = 'cost_category'
     and deleted_at is null
     and supplier_id = v_inv.supplier_id
     and business_line_id is null and property_id is null and company_id is null
     and coalesce(lower(btrim(reference_pattern)), '') = coalesce(lower(btrim(v_pattern)), '');

  if v_existing is not null then
    update public.assignment_rules
       set cost_category = v_inv.cost_category,
           category_id = v_inv.category_id,
           is_active = true,
           note = 'Automatisch gelernt aus bestätigtem Bankabgleich (zuletzt aktualisiert über Beleg '
                  || v_inv.id || ').',
           updated_at = now()
     where id = v_existing
    returning id into v_rule_id;
    return v_rule_id;
  end if;

  insert into public.assignment_rules (
    target, cost_category, category_id, supplier_id, reference_pattern, created_by, note
  ) values (
    'cost_category', v_inv.cost_category, v_inv.category_id, v_inv.supplier_id, v_pattern, p_actor,
    'Automatisch gelernt aus bestätigtem Bankabgleich (Beleg ' || v_inv.id || ').'
  )
  returning id into v_rule_id;
  return v_rule_id;
end $$;

comment on function public.learn_assignment_rule_from_match(uuid, text) is
  'Called when a bank match is confirmed: upserts a supplier (+ reference, for a recurring direct '
  'debit) -> category rule from the receipt''s own rule/human-decided category. Never learns from '
  'a bare AI guess. Idempotent: repeated confirmation updates the same rule rather than duplicating '
  'it. See migration 0030.';

grant execute on function public.learn_assignment_rule_from_match(uuid, text) to authenticated;

-- ===========================================================================
-- 8. Suggested category for a transaction with no receipt (offene-posten)
-- ===========================================================================
-- Read-only recommendation, never an automatic booking — the same stance the briefing takes on
-- the VAT reserve (Screen 5) and everywhere else a figure is only ever a suggestion. Supplier is
-- resolved by an exact IBAN match against the counterparty; a future iteration can widen this once
-- Screen 12's IBAN-history idea is built.
create or replace function public.resolve_transaction_category(p_transaction uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select r.category_id
    from public.bank_transactions t
    join public.suppliers s
      on s.iban is not null
     and s.iban = t.counterparty_iban
     and s.deleted_at is null
    join public.assignment_rules r
      on r.target = 'cost_category'
     and r.is_active
     and r.deleted_at is null
     and r.supplier_id = s.id
     and r.category_id is not null
     and (
       r.reference_pattern is null
       or coalesce(t.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   where t.id = p_transaction
   order by r.specificity desc, r.created_at desc
   limit 1;
$$;

comment on function public.resolve_transaction_category(uuid) is
  'Read-only suggested category for a transaction with no matched receipt, resolved via an exact '
  'IBAN match to a supplier and that supplier''s assignment_rules. A recommendation for '
  'offene-posten, never a booking. See migration 0030.';

grant execute on function public.resolve_transaction_category(uuid) to authenticated;

-- ===========================================================================
-- 9. Self-checks
-- ===========================================================================

-- 9a. Exactly two levels deep.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.bwa_categories c
    join public.bwa_categories p on p.id = c.parent_id
   where p.parent_id is not null;
  if v_bad > 0 then
    raise exception '0030 self-check FAILED: % category row(s) are nested more than two levels deep', v_bad;
  end if;
  raise notice '0030 self-check ok: category tree is exactly two levels deep';
end $$;

-- 9b. Seed counts match the briefing's own "roughly 20" coarse groups and "87" fine tags UNDER
-- them (Appendix A3's "87" names the fine-tag layer specifically, not the combined row count).
do $$
declare v_top int; v_fine int;
begin
  select count(*) into v_top from public.bwa_categories where parent_id is null;
  select count(*) into v_fine from public.bwa_categories where parent_id is not null;
  if v_top < 15 or v_top > 25 then
    raise exception '0030 self-check FAILED: expected roughly 20 top-level categories, found %', v_top;
  end if;
  if v_fine < 70 or v_fine > 100 then
    raise exception '0030 self-check FAILED: expected roughly 87 fine tags, found %', v_fine;
  end if;
  raise notice '0030 self-check ok: % top-level categories, % fine tags (briefing expects ~20 / ~87)', v_top, v_fine;
end $$;

-- 9c. The one real-data alias resolves where expected.
do $$
declare v_id uuid; v_expected uuid;
begin
  select category_id into v_id from public.bwa_category_aliases where lower(btrim(alias)) = lower('Personal');
  select id into v_expected from public.bwa_categories where code = 'PERSONNEL';
  if v_id is null or v_id <> v_expected then
    raise exception '0030 self-check FAILED: alias ''Personal'' does not resolve to Personalkosten';
  end if;
  raise notice '0030 self-check ok: alias ''Personal'' resolves to Personalkosten';
end $$;

-- 9d. apply_assignment_rules writes category_id, and the human lock still protects it. Probes a
-- real invoice with a throwaway rule scoped ONLY to that one invoice's own supplier, then rolls
-- back everything (the invoice update AND the probe rule) via the same restrict_violation trick
-- 0029 already uses.
--
-- The probe INSERT can collide with assignment_rules_scope_unique if the chosen invoice's supplier
-- already has a real, plain supplier-only cost_category rule (same scope shape, nothing else
-- pinned) — a live possibility once real rules exist, not a hypothetical. That is caught as
-- unique_violation, separately from the deliberate restrict_violation rollback below, so a
-- collision skips this one probe with a notice instead of aborting the whole migration.
do $$
declare
  v_cat_id     uuid;
  v_inv_id     uuid;
  v_rule_id    uuid;
  v_after_cat  uuid;
  v_before_human uuid;
  v_after_human  uuid;
begin
  select id into v_cat_id from public.bwa_categories where code = 'OCC_ENERGY';

  select id into v_inv_id from public.invoices
   where deleted_at is null and supplier_id is not null
   limit 1;

  if v_inv_id is null then
    raise notice '0030 self-check: no invoice available to probe category_id application, skipping';
  else
    insert into public.assignment_rules (target, category_id, cost_category, supplier_id, created_by, note)
    select 'cost_category', v_cat_id, 'Energie', i.supplier_id, 'migration-0030-selfcheck', 'selfcheck-temp'
      from public.invoices i where i.id = v_inv_id
    returning id into v_rule_id;

    update public.invoices set cost_category_source = null where id = v_inv_id;
    perform public.apply_assignment_rules(v_inv_id, 'migration-0030-selfcheck');
    select category_id into v_after_cat from public.invoices where id = v_inv_id;
    if v_after_cat is distinct from v_cat_id then
      raise exception '0030 self-check FAILED: apply_assignment_rules did not write category_id (got %)', v_after_cat;
    end if;

    update public.invoices set cost_category_source = 'human' where id = v_inv_id;
    select category_id into v_before_human from public.invoices where id = v_inv_id;
    perform public.apply_assignment_rules(v_inv_id, 'migration-0030-selfcheck');
    select category_id into v_after_human from public.invoices where id = v_inv_id;
    if v_after_human is distinct from v_before_human then
      raise exception '0030 self-check FAILED: a human-set cost_category_source did not protect category_id';
    end if;

    raise notice '0030 self-check ok: apply_assignment_rules writes category_id and the human lock still protects it';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0030 self-check rollback';
exception
  when restrict_violation then
    null; -- unwinds the probe, keeps the schema changes above
  when unique_violation then
    raise notice '0030 self-check 9d skipped: the chosen invoice''s supplier already has a '
      'colliding plain supplier-only rule, so the probe rule could not be inserted';
end $$;

-- 9e. learn_assignment_rule_from_match: idempotent, creates at most one rule, and never learns
-- from a bare AI category. Rolled back the same way.
do $$
declare
  v_match_id     uuid;
  v_before_count int;
  v_after_count  int;
  v_rule_1       uuid;
  v_rule_2       uuid;
  v_ai_match_id  uuid;
begin
  select m.id into v_match_id
    from public.invoice_transaction_matches m
    join public.invoices i on i.id = m.invoice_id
   where i.deleted_at is null
     and i.supplier_id is not null
     and coalesce(i.cost_category_source, 'ai') in ('rule', 'human')
     and (i.category_id is not null or coalesce(i.cost_category, '') <> '')
   limit 1;

  if v_match_id is null then
    raise notice '0030 self-check: no confirmed match with a rule/human category to probe learn_assignment_rule_from_match, skipping';
  else
    select count(*) into v_before_count from public.assignment_rules where deleted_at is null;
    v_rule_1 := public.learn_assignment_rule_from_match(v_match_id, 'migration-0030-selfcheck');
    v_rule_2 := public.learn_assignment_rule_from_match(v_match_id, 'migration-0030-selfcheck');
    if v_rule_1 is distinct from v_rule_2 then
      raise exception '0030 self-check FAILED: learn_assignment_rule_from_match is not idempotent (% vs %)', v_rule_1, v_rule_2;
    end if;
    select count(*) into v_after_count from public.assignment_rules where deleted_at is null;
    if v_after_count > v_before_count + 1 then
      raise exception '0030 self-check FAILED: learn_assignment_rule_from_match created more than one new rule for one match';
    end if;
    raise notice '0030 self-check ok: learn_assignment_rule_from_match is idempotent (rule %)', v_rule_1;
  end if;

  select m.id into v_ai_match_id
    from public.invoice_transaction_matches m
    join public.invoices i on i.id = m.invoice_id
   where i.deleted_at is null
     and coalesce(i.cost_category_source, 'ai') = 'ai'
   limit 1;
  if v_ai_match_id is not null then
    if public.learn_assignment_rule_from_match(v_ai_match_id, 'migration-0030-selfcheck') is not null then
      raise exception '0030 self-check FAILED: learn_assignment_rule_from_match learned from a bare-AI category';
    end if;
    raise notice '0030 self-check ok: an AI-only category is never learned from';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0030 self-check rollback';
exception when restrict_violation then
  null;
end $$;

-- 9f. Soft-deleting a category hides it from active use but its name stays resolvable. This one
-- creates and then explicitly deletes its own throwaway row (no real data involved), rather than
-- the rollback trick.
do $$
declare
  v_id   uuid;
  v_name text;
begin
  insert into public.bwa_categories (code, name_de, name_en, bwa_block, bwa_line, note)
  values ('SELFCHECK_TEMP_0030', 'Selbsttest-Kategorie', 'Selfcheck category', 'sonderfall', 'selfcheck',
          'temporary row for migration 0030''s self-check, deleted at the end of this block')
  returning id into v_id;

  update public.bwa_categories
     set deleted_at = now(), deleted_by = 'migration-0030-selfcheck', delete_reason = 'selfcheck',
         is_active = false
   where id = v_id;

  if exists (select 1 from public.bwa_categories where id = v_id and is_active) then
    raise exception '0030 self-check FAILED: soft-deleted category still reports is_active';
  end if;

  select name_de into v_name from public.bwa_categories where id = v_id;
  if v_name is distinct from 'Selbsttest-Kategorie' then
    raise exception '0030 self-check FAILED: a soft-deleted category''s name is no longer resolvable';
  end if;

  delete from public.bwa_categories where id = v_id;
  raise notice '0030 self-check ok: soft-delete hides a category from active use without losing its name';
end $$;

-- 9g. (fiscal_year, account) is unique per year, but the same account number is allowed to repeat
-- in a different year (DATEV rebuilds the chart of accounts annually). Uses sentinel years that
-- are unrealistic for real use but still satisfy the table's own `fiscal_year between 2000 and
-- 2100` check constraint (an earlier version of this self-check used 1900/1901 and violated that
-- very constraint), so this can never collide with a real imported mapping.
do $$
declare
  v_cat uuid;
  v_id1 uuid;
  v_id2 uuid;
begin
  select id into v_cat from public.bwa_categories where code = 'OCC_ENERGY';

  insert into public.bwa_account_mapping (fiscal_year, account, category_id, note)
  values (2099, '4200', v_cat, 'selfcheck') returning id into v_id1;
  insert into public.bwa_account_mapping (fiscal_year, account, category_id, note)
  values (2100, '4200', v_cat, 'selfcheck') returning id into v_id2;

  begin
    insert into public.bwa_account_mapping (fiscal_year, account, category_id, note)
    values (2099, '4200', v_cat, 'selfcheck-dup');
    raise exception '0030 self-check FAILED: (fiscal_year, account) unique constraint did not block a duplicate';
  exception when unique_violation then
    null; -- expected
  end;

  delete from public.bwa_account_mapping where id in (v_id1, v_id2);
  raise notice '0030 self-check ok: the same account number is allowed in two different fiscal years, but not twice in one';
end $$;

-- 9h. suggest_assignment_rules never suggests a supplier already covered by an active rule.
do $$
declare
  v_supplier uuid;
  v_covered  boolean;
begin
  select supplier_id into v_supplier from public.assignment_rules
   where target = 'cost_category' and is_active and deleted_at is null and supplier_id is not null
   limit 1;
  if v_supplier is null then
    raise notice '0030 self-check: no active supplier-scoped rule to probe suggest_assignment_rules exclusion, skipping';
  else
    select exists (
      select 1 from public.suggest_assignment_rules() s where s.supplier_id = v_supplier
    ) into v_covered;
    if v_covered then
      raise exception '0030 self-check FAILED: suggest_assignment_rules suggested a supplier already covered by an active rule';
    end if;
    raise notice '0030 self-check ok: suggest_assignment_rules excludes suppliers already covered by an active rule';
  end if;
end $$;

-- 9i. resolve_transaction_category executes cleanly against real data (or reports there is none).
do $$
declare
  v_txn uuid;
  v_res uuid;
begin
  select id into v_txn from public.bank_transactions limit 1;
  if v_txn is not null then
    v_res := public.resolve_transaction_category(v_txn);
    raise notice '0030 self-check ok: resolve_transaction_category executes cleanly (result %)', v_res;
  else
    raise notice '0030 self-check: no bank_transactions row to probe resolve_transaction_category, skipping';
  end if;
end $$;

commit;
