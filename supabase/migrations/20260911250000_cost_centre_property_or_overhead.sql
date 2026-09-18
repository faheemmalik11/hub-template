-- Cost centres: a property, or "Gemeinkosten". Never both, never neither by accident.
--
-- WHY. Saskia, Stäy meeting 09.09.2026 (11:12-13:03): "At our tax adviser, each property is
-- effectively one cost centre, and everything else goes into overhead costs... If it says overhead
-- costs, then there is no property." The Hub had the property half and nothing for overhead, so an
-- invoice that belongs to no building could only be marked "Keine, trifft nicht zu" -- the ABSENCE
-- of an answer, which is not the same statement and must not export the same way. Her reason is
-- explicit at 12:36: "Mainly because of the transfer later."
--
-- WHERE THE NUMBER LIVES. On the property<->company LINK, not on the property. The tax adviser's
-- workbook numbers the same building differently per company: Ludwigshafen is 6 in Stäy's books
-- and 101 in Impuls's, Hinterstraße 2 for Stäy and 2001 for Infio. Migration 0077 had already
-- reached that conclusion and put the column on property_assignment; 0083 replaced that table with
-- property_companies and the column went with it. This puts it back where it belongs.
--
-- WHY THIS SEEDS PAIRINGS WHEN 0077 REFUSED TO. 0077 declined to seed property_assignment because
-- its only evidence was column D of the workbook: free-text prose naming one or two companies with
-- no role, where "My Baufi" alone sat next to a note saying Stäy rents the office. That column is
-- not a reliable pair. The cost-centre NUMBERS are different evidence: each company's own sheet
-- lists the properties booked in that company's accounts, with a number per line. A number under
-- Impuls is a statement by the tax adviser that Impuls books that property. That is exactly what a
-- property_companies row asserts, so seeding from the numbers asserts nothing the source does not.
--
-- It stays conservative anyway: `on conflict do update` only fills a number that is still null, so
-- a link a person has already made or corrected keeps its own value, and no row is ever removed.

begin;

-- ---------------------------------------------------------------------------
-- 1. The number, on the pairing.
-- ---------------------------------------------------------------------------
alter table public.property_companies
  add column if not exists cost_center_number int;

comment on column public.property_companies.cost_center_number is
  'Cost-centre number from the tax adviser''s workbook, per company/property pairing: the same '
  'property carries a different number in each company''s books (Ludwigshafen 6 for Stäy, 101 for '
  'Impuls). The overhead counterpart is companies.overhead_cost_center.';

-- ---------------------------------------------------------------------------
-- 2. "Gemeinkosten" as a statement on the invoice, distinct from "not decided".
--
--    A boolean rather than a magic property row: a cost centre that is not a building has no
--    address, no VAT status and no company link, so a fake property would need every one of those
--    columns to mean "ignore me". The number it resolves to is the invoice company's
--    overhead_cost_center, which migration 0077 already seeded (10000 Stäy/Infio, 1000 the rest).
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists is_overhead boolean not null default false;

comment on column public.invoices.is_overhead is
  'The invoice is overhead ("Gemeinkosten"): it belongs to the company, not to a property. '
  'Mutually exclusive with property_id. Distinct from both columns being empty, which means '
  'nobody has decided yet.';

-- Her rule, enforced: "If it says overhead costs, then there is no property."
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_overhead_xor_property'
  ) then
    alter table public.invoices
      add constraint invoices_overhead_xor_property
      check (not (is_overhead and property_id is not null)) not valid;
    -- NOT VALID, then validated: existing rows all have is_overhead = false, so this passes, but
    -- it keeps the statement from taking an ACCESS EXCLUSIVE scan on a large table twice.
    alter table public.invoices validate constraint invoices_overhead_xor_property;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The numbers from the workbook.
--
--    Stäy's own sheet numbers 12 and 13 are "Stäy Gronau GmbH" and "Impuls 1 VV GmbH" -- companies
--    used as cost centres, not buildings. 0077 excluded them from `properties` for that reason and
--    they are excluded here too.
-- ---------------------------------------------------------------------------
with wanted(company_code, property_code, nr) as (
  values
    -- Stäy
    ('STAY', 'MA-OMS',   1), ('STAY', 'LA-HIN',   2), ('STAY', 'FT-RAI',   3),
    ('STAY', 'WO-PAT',   4), ('STAY', 'MA-HLS',   5), ('STAY', 'LU-EKS',   6),
    ('STAY', 'FT-WES',   7), ('STAY', 'FT-SCH',   8), ('STAY', 'KB-FUJ',   9),
    ('STAY', 'B-AMD',   10), ('STAY', 'HD-CZR',  11),
    -- Impuls VV
    ('IMPV', 'LU-EKS', 101), ('IMPV', 'BR-BRE', 102),
    -- My Baufi
    ('MYBA', 'B-AMD',  1001), ('MYBA', 'HD-CZR', 1002), ('MYBA', 'NW-FHS5', 1003),
    ('MYBA', 'NW-WBS', 1004), ('MYBA', 'FT-KAR', 1005),
    -- Infio
    ('INFI', 'LA-HIN', 2001), ('INFI', 'WO-PAT', 2002), ('INFI', 'MA-HLS', 2003)
)
insert into public.property_companies (property_id, company_id, cost_center_number)
select p.id, c.id, w.nr
  from wanted w
  join public.properties p on p.code = w.property_code and p.deleted_at is null
  join public.companies  c on c.code = w.company_code
on conflict (property_id, company_id) where deleted_at is null
do update set cost_center_number = excluded.cost_center_number,
              updated_at = now()
  -- Only fills a gap. A number a person has since corrected is theirs and stays.
  where public.property_companies.cost_center_number is null;

commit;

-- Sanity:
--   select count(*) from property_companies where cost_center_number is not null;  -- 21
--   select c.code, count(*) from property_companies pc
--     join companies c on c.id = pc.company_id
--    where pc.cost_center_number is not null group by 1 order by 1;
--     -- IMPV 2, INFI 3, MYBA 5, STAY 11
--   select code, overhead_cost_center from companies order by code;
