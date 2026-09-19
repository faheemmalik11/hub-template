-- 20260914130000_cost_centre_archived_pairings: the four workbook pairings the seed skipped.
--
-- WHY. 20260911250000 seeded 21 cost-centre numbers from the tax adviser's workbook, but its join
-- reads `join public.properties p on p.code = w.property_code and p.deleted_at is null`. Four of
-- the 21 properties are archived, so those pairings were silently dropped and the live count is 17:
--
--   IMPV / BR-BRE   102    Breslauer Str. 8        workbook: "Verkauf (09/23)"
--   MYBA / FT-KAR  1005    Karolinenstr. 6         workbook: "Kauf in Plan (09/2025)"
--   STAY / FT-RAI     3    Raiffeisenstraße 35     workbook: "keine Anmietung von Stäy mehr"
--   STAY / FT-WES     7    Westliche Ringstraße 6  workbook: "keine Anmietung mehr"
--
-- WHY THE NUMBER STILL BELONGS THERE. Archiving governs what a reviewer may CHOOSE from now on. It
-- says nothing about what has already been booked, and three of these four carry invoices today
-- (FT-RAI 1, FT-WES 4, FT-KAR 1). A receipt against a building that has since been sold still has
-- to reach the tax adviser under the number his own books use, so dropping the number turns a past
-- booking into "Kostenstelle fehlt" permanently. The number is his fact about the property, not a
-- statement that the property is still in use.
--
-- WHAT THIS DOES NOT DO:
--   * it does not un-archive anything. `properties.deleted_at` is untouched;
--   * it does not resurrect a link a person soft-deleted. Removing a link is somebody's decision
--     that the property no longer belongs to that company, and a migration must not reverse it. A
--     pairing whose link sits soft-deleted is therefore left alone and reported, not rewritten;
--   * it does not overwrite a number anyone has set. Only a null is filled.
--
-- Whether archiving sold objects is the right practice at all is an open question with the client
-- (docs/COST_CENTRES.md). This migration is correct under either answer.
--
-- Idempotent: both statements are no-ops once the rows are right.

begin;

-- ---------------------------------------------------------------------------
-- 1. The pairing has no row at all -> create it, carrying the number.
-- ---------------------------------------------------------------------------
with wanted(company_code, property_code, nr) as (
  values ('IMPV', 'BR-BRE', 102), ('MYBA', 'FT-KAR', 1005),
         ('STAY', 'FT-RAI',   3), ('STAY', 'FT-WES',    7)
)
insert into public.property_companies (property_id, company_id, cost_center_number)
select p.id, c.id, w.nr
  from wanted w
  join public.properties p on p.code = w.property_code   -- deliberately NOT filtered on deleted_at
  join public.companies  c on c.code = w.company_code
 where not exists (
   -- Any row, active or soft-deleted. A soft-deleted one means a person unlinked this pairing.
   select 1 from public.property_companies pc
    where pc.property_id = p.id and pc.company_id = c.id
 );

-- ---------------------------------------------------------------------------
-- 2. The pairing is linked and active but carries no number -> fill the gap only.
-- ---------------------------------------------------------------------------
with wanted(company_code, property_code, nr) as (
  values ('IMPV', 'BR-BRE', 102), ('MYBA', 'FT-KAR', 1005),
         ('STAY', 'FT-RAI',   3), ('STAY', 'FT-WES',    7)
)
update public.property_companies pc
   set cost_center_number = w.nr,
       updated_at = now()
  from wanted w
  join public.properties p on p.code = w.property_code
  join public.companies  c on c.code = w.company_code
 where pc.property_id = p.id
   and pc.company_id = c.id
   and pc.deleted_at is null
   and pc.cost_center_number is null;

commit;

-- Sanity after applying:
--   select count(*) from property_companies where cost_center_number is not null;   -- 21
--   select c.code, count(*) from property_companies pc
--     join companies c on c.id = pc.company_id
--    where pc.cost_center_number is not null group by 1 order by 1;
--     -- IMPV 2, INFI 3, MYBA 5, STAY 11
--
-- A pairing still missing after this has a SOFT-DELETED link, which this migration leaves alone on
-- purpose. To see them:
--   select c.code, p.code, pc.deleted_at, pc.delete_reason
--     from property_companies pc
--     join companies c on c.id = pc.company_id
--     join properties p on p.id = pc.property_id
--    where pc.deleted_at is not null;
