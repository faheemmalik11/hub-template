-- 20260817250000_supplier_duplicates_key_boundaries.sql
-- Correct two extraction mistakes in the duplicate keys added by 20260817240000, both found by
-- running the extraction over every vat_id actually stored rather than over the examples in the
-- audit. Separate migration rather than an edit, since 20260817240000 is already applied.
--
-- 1. THE VAT PATTERN GLUED LABEL LETTERS ONTO NUMBERS. `[A-Z]{2}[0-9]{8,12}` was matched against a
--    string with the spaces removed, so it happily read the tail of a word as a country code:
--
--      "N.I.F. A84205863"                              -> "FA84205863"   (the F of "N.I.F.")
--      "NIF A60195278"                                 -> "FA60195278"
--      "St.-Nr. 084/211/03985; USt-IdNr. 70 829 151637" -> "NR70829151637" (the Nr of "IdNr.")
--
--    Any two of those sharing an invented key would have been reported as the same company. The
--    pattern now requires the two letters to start a word ((?:^|[^A-Z])) and matches spaces INSIDE
--    the number instead of pre-stripping them, which also fixes the opposite error: real spaced
--    VAT ids like "DE 112 595 008" and "DE 81 2164907" were not recognised at all.
--
-- 2. THE STEUERNUMMER PATTERN COULD START MID-NUMBER. `[0-9]{2,3}/` matched the "212" inside
--    "9212/101/00021", so the stored key was a truncation of the real number. It now requires a
--    non-digit before it and allows the four-digit first block that produced the case.
--
-- Neither correction changes which groups are found on any of the three Hubs today (checked
-- before and after: Immonetz 7 groups, Stäy 0, Eiffler 0) -- both were latent, waiting for a
-- supplier record whose label happened to end in two letters.

begin;

create or replace view public.v_supplier_duplicates as
with basis as (
  select
    id,
    nullif(lower(regexp_replace(coalesce(name, ''), '[^[:alnum:]]', '', 'g')), '') as name_key,
    -- Two letters starting a word, then 8-12 digits that may be spaced into groups.
    nullif(
      replace(
        (regexp_match(upper(coalesce(vat_id, '')), '(?:^|[^A-Z])([A-Z]{2} ?[0-9][0-9 ]{7,13})'))[1],
        ' ', ''
      ),
      ''
    ) as ust_key,
    -- A German Steuernummer, not starting in the middle of a longer number.
    nullif(
      (regexp_match(coalesce(vat_id, ''), '(?:^|[^0-9])([0-9]{2,4}/[0-9]{3}/[0-9]{4,5})'))[1],
      ''
    ) as steuer_key
  from public.suppliers
  where deleted_at is null
)
select 'name'::text as key_type, name_key as key_value,
       count(*) as n, array_agg(id order by id) as ids
  from basis where name_key is not null
 group by name_key having count(*) > 1
union all
select 'vat_id'::text, ust_key, count(*), array_agg(id order by id)
  from basis where ust_key is not null
 group by ust_key having count(*) > 1
union all
select 'steuernummer'::text, steuer_key, count(*), array_agg(id order by id)
  from basis where steuer_key is not null
 group by steuer_key having count(*) > 1;

commit;

-- Sanity (after applying) -- no key may be a fragment of a label:
--   select distinct key_value from public.v_supplier_duplicates where key_type = 'vat_id';
--   -- every value must start with a real country code (DE/IT/PL/...), never FA/NR
--   select distinct key_value from public.v_supplier_duplicates where key_type = 'steuernummer';
--   -- Immonetz expects 9212/101/00021 here, not 212/101/00021
