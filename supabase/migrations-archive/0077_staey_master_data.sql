-- 0077_staey_master_data — Stäy's companies, properties and matching aliases.
--
-- SOURCE: the client's first message (5 companies) and the tax advisor's cost-centre workbook
-- "Kostenstellen Steuerberater Firmenübergreifend 10-2025.xlsx"
-- (communication/threads/2026-08-04-companies-and-cost-centers/assets/).
--
-- SAFE-ONLY SEED, following the precedent set by immonetz's own property seed:
--     "only the unambiguous properties are inserted. Ambiguous cases are deliberately NOT
--      seeded so the pipeline leaves them empty for human review instead of guessing."
-- That workbook is a human working document: the codes and numbers are reliable, the
-- company relationships are free-text prose, inconsistent, and time-dependent. So this
-- migration asserts the facts and refuses to invent the rest -- an invented owner puts a
-- receipt in the wrong company's books with the wrong VAT, which is worse than no owner.
--
-- WHAT IS SEEDED   companies, properties, entity_aliases
-- WHAT IS NOT      property_assignment (property <-> company <-> business line).
--                  Every case and its reason is listed at the bottom of this file.
--
-- Idempotent and additive: `on conflict do nothing` throughout, so re-running changes nothing
-- and any row a human has since corrected is preserved, never overwritten.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema: somewhere for the cost-centre numbers to live.
--    The workbook numbers a property DIFFERENTLY per company -- Ludwigshafen is 6 for Stäy
--    and 101 for Impuls -- so the number belongs to the PAIRING, not to the property.
-- ---------------------------------------------------------------------------
alter table public.property_assignment
  add column if not exists cost_center_number int;

comment on column public.property_assignment.cost_center_number is
  'Cost-centre number from the tax advisor''s workbook. Per company/property pairing, not per '
  'property: the same property carries a different number in each company''s books.';

-- The per-company overhead cost centre ("Gemeinkosten"/GK): 10000 for Stäy and Infio,
-- 1000 for Impuls, My Baufi and Stäy Gronau.
alter table public.companies
  add column if not exists overhead_cost_center int;

comment on column public.companies.overhead_cost_center is
  'The company''s "Gemeinkosten" (GK) cost centre from the tax advisor''s workbook.';

-- ---------------------------------------------------------------------------
-- 2. Companies (client message, communication thread 1)
--
--    CODES ARE PROVISIONAL. The client never supplied them; these mirror the codes the earlier
--    Stäy demo used. They end up in filenames, DATEV exports and cost-centre references, so they
--    must be confirmed before go-live.
--
--    booking_basis is NOT set: it defaults to 'payment_date'. Which Stäy companies book on
--    invoice date (accrual) is a tax-status question for the advisor -- immonetz's answer
--    (accrual for IMKO/IMGM) is theirs, not Stäy's.
-- ---------------------------------------------------------------------------
insert into public.companies (code, name, overhead_cost_center) values
  ('STAY', 'Stäy GmbH',             10000),   -- client: "to become Stäy AG in the future"
  ('MYBA', 'My Baufi AG',            1000),   -- client: "Saskia Andy's VV; access permissions to discuss"
  ('IMPV', 'Impuls VV GmbH',         1000),   -- OPEN: the client also writes "Impuls 1 VV GmbH"
  ('STGR', 'Stäy Gronau GmbH',       1000),
  ('INFI', 'Infio Immobilien GmbH', 10000)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Properties
--
--    15 unique properties. Codes and addresses come straight from the workbook and are reliable.
--
--    vat_status is left NULL everywhere ON PURPOSE. In this data model VAT follows the business
--    line (sale = exempt, rental = liable), and no property has a confirmed business line yet.
--    NULL records "unknown"; a guessed value would read as fact.
--
--    NOT properties, deliberately excluded: rows 12 and 13 of the Stäy sheet are
--    "Stäy Gronau GmbH" and "Impuls 1 VV GmbH" -- companies used as cost centres
--    (note: "Auslagen Pleo für Impuls"), not buildings.
-- ---------------------------------------------------------------------------
insert into public.properties (code, name, address) values
  ('MA-OMS',  'Mannheim, Oskar-Meixner-Straße 8',        'Oskar-Meixner-Straße 8, 68163 Mannheim'),
  ('LA-HIN',  'Lambsheim, Hinterstraße 20-22',           'Hinterstraße 20-22, 67245 Lambsheim'),
  ('FT-RAI',  'Frankenthal, Raiffeisenstraße 35',        'Raiffeisenstraße 35, 67227 Frankenthal'),
  ('WO-PAT',  'Worms, Paternusstraße 53',                'Paternusstraße 53, 67551 Worms'),
  ('MA-HLS',  'Mannheim, Heinrich-Lanz-Straße 37-39',    'Heinrich-Lanz-Straße 37-39, 68165 Mannheim'),
  ('LU-EKS',  'Ludwigshafen, Edigheimer Str. 92a+b / Kurt-Schumacher-Str. 96-100',
              'Edigheimer Str. 92a+b/Kurt-Schumacher-Str. 96-100, 67069 Ludwigshafen'),
  ('FT-WES',  'Frankenthal, Westliche Ringstraße 6',     'Westliche Ringstraße 6, 67227 Frankenthal'),
  ('FT-SCH',  'Frankenthal, Schnurgasse 3',              'Schnurgasse 3, 67227 Frankenthal'),
  ('KB-FUJ',  'Kelsterbach, Fujiallee 4',                'Fujiallee 4, 65451 Kelsterbach'),
  ('B-AMD',   'Berlin, Alt Mahlsdorf 97',                'Alt Mahlsdorf 97, 12623 Berlin'),
  ('HD-CZR',  'Heidelberg, Czernyring 42-44',            'Czernyring 42-44, 69115 Heidelberg'),
  ('NW-FHS5', 'Neustadt a.d. Weinstraße, Freiheitstr. 5','Freiheitstr. 5, 67434 Neustadt a.d. Wstr.'),
  ('NW-WBS',  'Neustadt a.d. Weinstraße, Wittelsbacher Str. 61',
              'Wittelsbacher Str. 61, 67434 Neustadt d.Wstr.'),
  ('BR-BRE',  'Bobenheim-Roxheim, Breslauer Str. 8',     'Breslauer Str. 8, 67240 Bobenheim-Roxheim'),
  ('FT-KAR',  'Frankenthal, Karolinenstr. 6',            'Karolinenstr. 6, 67227 Frankenthal')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Aliases — the raw text the extractor matches against.
--
--    Every alias carries the house number, so no alias is shared between two properties and
--    nothing is dropped later as ambiguous. Variants cover: the code, street + number, the full
--    address, umlaut spellings (ä->ae, ö->oe, ü->ue, ß->ss) and "Str." vs "Straße"/"Strasse".
--
--    ON CONFLICT repeats the index predicate (`where is_active`) because entity_aliases_uniq is
--    a PARTIAL unique index -- Postgres cannot infer a partial index without it.
-- ---------------------------------------------------------------------------
insert into public.entity_aliases (entity_type, entity_code, alias) values
  ('objekt','MA-OMS','MA-OMS'),
  ('objekt','MA-OMS','Oskar-Meixner-Straße 8'),
  ('objekt','MA-OMS','Oskar-Meixner-Strasse 8'),
  ('objekt','MA-OMS','Oskar-Meixner-Str. 8'),
  ('objekt','MA-OMS','Oskar-Meixner-Straße 8, 68163 Mannheim'),

  ('objekt','LA-HIN','LA-HIN'),
  ('objekt','LA-HIN','Hinterstraße 20-22'),
  ('objekt','LA-HIN','Hinterstrasse 20-22'),
  ('objekt','LA-HIN','Hinterstr. 20-22'),
  ('objekt','LA-HIN','Hinterstraße 20-22, 67245 Lambsheim'),

  ('objekt','FT-RAI','FT-RAI'),
  ('objekt','FT-RAI','Raiffeisenstraße 35'),
  ('objekt','FT-RAI','Raiffeisenstrasse 35'),
  ('objekt','FT-RAI','Raiffeisenstr. 35'),
  ('objekt','FT-RAI','Raiffeisenstraße 35, 67227 Frankenthal'),

  ('objekt','WO-PAT','WO-PAT'),
  ('objekt','WO-PAT','Paternusstraße 53'),
  ('objekt','WO-PAT','Paternusstrasse 53'),
  ('objekt','WO-PAT','Paternusstr. 53'),
  ('objekt','WO-PAT','Paternusstraße 53, 67551 Worms'),

  ('objekt','MA-HLS','MA-HLS'),
  ('objekt','MA-HLS','Heinrich-Lanz-Straße 37-39'),
  ('objekt','MA-HLS','Heinrich-Lanz-Strasse 37-39'),
  ('objekt','MA-HLS','Heinrich-Lanz-Str. 37-39'),
  ('objekt','MA-HLS','Heinrich-Lanz-Straße 37-39, 68165 Mannheim'),

  ('objekt','LU-EKS','LU-EKS'),
  ('objekt','LU-EKS','Edigheimer Str. 92a+b'),
  ('objekt','LU-EKS','Edigheimer Straße 92a+b'),
  ('objekt','LU-EKS','Kurt-Schumacher-Str. 96-100'),
  ('objekt','LU-EKS','Kurt-Schumacher-Straße 96-100'),

  ('objekt','FT-WES','FT-WES'),
  ('objekt','FT-WES','Westliche Ringstraße 6'),
  ('objekt','FT-WES','Westliche Ringstrasse 6'),
  ('objekt','FT-WES','Westliche Ringstr. 6'),
  ('objekt','FT-WES','Westliche Ringstraße 6, 67227 Frankenthal'),

  ('objekt','FT-SCH','FT-SCH'),
  ('objekt','FT-SCH','Schnurgasse 3'),
  ('objekt','FT-SCH','Schnurgasse 3, 67227 Frankenthal'),

  ('objekt','KB-FUJ','KB-FUJ'),
  ('objekt','KB-FUJ','Fujiallee 4'),
  ('objekt','KB-FUJ','Fujiallee 4, 65451 Kelsterbach'),

  ('objekt','B-AMD','B-AMD'),
  ('objekt','B-AMD','Alt Mahlsdorf 97'),
  ('objekt','B-AMD','Alt Mahlsdorf 97, 12623 Berlin'),

  ('objekt','HD-CZR','HD-CZR'),
  ('objekt','HD-CZR','Czernyring 42-44'),
  ('objekt','HD-CZR','Czernyring 42-44, 69115 Heidelberg'),

  ('objekt','NW-FHS5','NW-FHS5'),
  ('objekt','NW-FHS5','Freiheitstraße 5'),
  ('objekt','NW-FHS5','Freiheitstrasse 5'),
  ('objekt','NW-FHS5','Freiheitstr. 5'),
  ('objekt','NW-FHS5','Freiheitstr. 5, 67434 Neustadt a.d. Wstr.'),

  ('objekt','NW-WBS','NW-WBS'),
  ('objekt','NW-WBS','Wittelsbacher Straße 61'),
  ('objekt','NW-WBS','Wittelsbacher Strasse 61'),
  ('objekt','NW-WBS','Wittelsbacher Str. 61'),
  ('objekt','NW-WBS','Wittelsbacher Str. 61, 67434 Neustadt d.Wstr.'),

  ('objekt','BR-BRE','BR-BRE'),
  ('objekt','BR-BRE','Breslauer Straße 8'),
  ('objekt','BR-BRE','Breslauer Strasse 8'),
  ('objekt','BR-BRE','Breslauer Str. 8'),
  ('objekt','BR-BRE','Breslauer Str. 8, 67240 Bobenheim-Roxheim'),

  ('objekt','FT-KAR','FT-KAR'),
  ('objekt','FT-KAR','Karolinenstraße 6'),
  ('objekt','FT-KAR','Karolinenstrasse 6'),
  ('objekt','FT-KAR','Karolinenstr. 6'),
  ('objekt','FT-KAR','Karolinenstr. 6, 67227 Frankenthal'),

  -- Company aliases, so an extracted company name resolves to a code.
  ('gesellschaft','STAY','Stäy GmbH'),
  ('gesellschaft','STAY','Staey GmbH'),
  ('gesellschaft','STAY','Stäy'),
  ('gesellschaft','MYBA','My Baufi AG'),
  ('gesellschaft','MYBA','MyBaufi AG'),
  ('gesellschaft','MYBA','My Baufi'),
  ('gesellschaft','IMPV','Impuls VV GmbH'),
  ('gesellschaft','IMPV','Impuls 1 VV GmbH'),
  ('gesellschaft','IMPV','Impuls'),
  ('gesellschaft','STGR','Stäy Gronau GmbH'),
  ('gesellschaft','STGR','Staey Gronau GmbH'),
  ('gesellschaft','STGR','Stäy Gronau'),
  ('gesellschaft','INFI','Infio Immobilien GmbH'),
  ('gesellschaft','INFI','Infio')
on conflict (entity_type, entity_code, alias) where is_active do nothing;

commit;

-- ===========================================================================
-- NOT SEEDED ON PURPOSE — property_assignment (property <-> company <-> business line)
--
-- Note the schema itself refuses to guess: `properties` has NO company column, and
-- property_assignment is UNIQUE (property_id, business_line_id) -- one company per property per
-- business line. That is the immonetz model: a property may belong to two companies, but only
-- through two DIFFERENT business lines, and the VAT follows the business line.
--
-- The workbook does not supply that. Column D names one or two companies with no role, and the
-- relationship is described in a free-text note. Verbatim, per property:
--
--   MA-OMS  "Stäy"              / "Stäy Mieter"                    -- Stäy is TENANT; owner not named
--   LA-HIN  "Infio/ Stäy"       / "Infio Verkauf Anfang 2025 / Stäy Mieter"
--   FT-RAI  "Stäy"              / "keine Anmietung von Stäy mehr"  -- tenancy ENDED
--   WO-PAT  "Infio/ (Stäy)"     / "keine Anmietung von Stäy mehr"  -- Stäy bracketed = no longer
--   MA-HLS  "Infio/ Stäy"       / "2 Einheiten (1x infio und 1x privat Christ)" -- one unit PRIVATE
--   LU-EKS  "Impuls/ Stäy"      / "keine Anmietung von Stäy mehr / WE im Verkauf"
--   FT-WES  "Stäy"              / "keine Anmietung mehr"           -- ENDED
--   FT-SCH  "Stäy"              / "keine Anmietung mehr ab Oktober 25"
--   KB-FUJ  "Stäy"              / "Anmietung folgt noch"           -- NOT STARTED
--   B-AMD   "My Baufi AG/ Stäy" / "Neubau / Anmietung Stäy noch offen"
--   HD-CZR  "My Baufi/ Stäy"    / "Stäy Anmietung bis Ende 2025"
--   NW-FHS5 "My Baufi"          / "Stäy Anmietung Büro"            -- Stäy involved but NOT in column D
--   NW-WBS  "My Baufi"          / "wird saniert und verkauft"
--   BR-BRE  "Impuls"            / "Verkauf (09/23)"                -- already SOLD
--   FT-KAR  "My Baufi"          / "Kauf in Plan (09/2025)"         -- not yet PURCHASED
--
-- NW-FHS5 is the case that rules out reading column D as "owner / tenant": only My Baufi is
-- listed, yet the note says Stäy rents the office. The column is not a reliable pair.
--
-- QUESTIONS FOR THE CLIENT (each answer unblocks one or more rows above):
--   1. Per property: which companies are involved TODAY, and is each the owner or the tenant?
--   2. The six marked "keine Anmietung mehr" -- in scope at all, or historical only?
--   3. MA-HLS: one unit is held privately ("privat Christ") -- in or out of scope?
--   4. Stäy Gronau has no properties in the workbook -- correct, or still to come?
--   5. "Impuls VV GmbH" or "Impuls 1 VV GmbH"?
--   6. Which business line covers Stäy AS TENANT? Of the four seeded (LTR/STR/DEV/SVC), SVC is
--      the closest, but that is an accounting decision.
--   7. Confirm the company codes (STAY/MYBA/IMPV/STGR/INFI) -- they are provisional here.
--
-- Cost-centre numbers from the workbook, ready to attach once the pairings are confirmed
-- (property_assignment.cost_center_number):
--   Stäy      MA-OMS 1, LA-HIN 2, FT-RAI 3, WO-PAT 4, MA-HLS 5, LU-EKS 6, FT-WES 7,
--             FT-SCH 8, KB-FUJ 9, B-AMD 10, HD-CZR 11, (Stäy Gronau 12), (Impuls 13)
--   Impuls    LU-EKS 101, BR-BRE 102
--   My Baufi  B-AMD 1001, HD-CZR 1002, NW-FHS5 1003, NW-WBS 1004, FT-KAR 1005
--   Infio     LA-HIN 2001, WO-PAT 2002, MA-HLS 2003
--
-- Sanity after applying:
--   select code, name, overhead_cost_center from companies order by code;   -- 5 rows + NZO
--   select count(*) from properties;                                        -- 15
--   select entity_type, count(*) from entity_aliases group by 1;            -- objekt 68, gesellschaft 14
--   select count(*) from property_assignment;                               -- 0, by design
-- ===========================================================================
