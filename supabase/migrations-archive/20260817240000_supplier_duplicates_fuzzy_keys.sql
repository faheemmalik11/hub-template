-- 20260817240000_supplier_duplicates_fuzzy_keys.sql
-- Make duplicate-supplier detection match the duplicates a person can see.
--
-- MEASURED BEFORE CHANGING ANYTHING: on this Hub the view returned ZERO groups while the supplier
-- table held at least five pairs that are obviously the same company. The feature was not
-- under-reporting, it was reporting nothing at all.
--
-- Three separate reasons, all of them the same mistake -- grouping on a raw stored string:
--
--   1. NAME grouped on `normalized_name`, a column the ingest pipeline fills in, and it disagrees
--      with itself for the same company:
--        "immonetz konzept GmbH"            -> "immonetz konzept"
--        "immonetz konzept GmbH"            -> "immonetzkonzeptgmbh"
--        "Dr. Rudel, Schäfer & Partner mbB" -> "dr rudel schäfer und partner mbb"
--        "Dr. Rudel, Schäfer & Partner mbB" -> "drrudelschferpartnermbb"
--      The DISPLAYED names in both pairs are byte-identical. Deriving the key from `name` instead
--      catches both pairs; `normalized_name` is not used at all any more.
--
--   2. VAT ID grouped on the raw `vat_id`, which frequently is not just a VAT ID:
--        "DE350359331"
--        "USt-ID: DE350359331; Steuer-Nr. 082/111/00762"
--      Same company, same number, no match. The identifier is now EXTRACTED from the field.
--
--   3. There was no key at all for a German Steuernummer, so the Rudel pair
--        "65/233/36607" / "Steuernummer: 65/233/36607"
--      had nothing to match on. It gets its own key type now.
--
-- IBAN IS DELIBERATELY NOT A KEY (it was one on Stäy and Eiffler; this drops it). Measured on Stäy:
-- its only duplicate group was three unrelated companies -- Max Planck Institut, PayCenter GmbH and
-- Stäy GmbH -- sharing one IBAN, which is a payment-service-provider account, not a duplicate. A
-- shared IBAN between two rows with the SAME name is already caught by the name key, so dropping
-- this loses no true positive and removes the only false one either Hub was showing.
--
-- Verified on Immonetz before/after: 0 groups -> 7 groups covering 5 real duplicate pairs
-- (both audit pairs, plus HUK-COBURG, Novum Hotels/Garner Hotel Kiel, and two Amazon EU rows).
-- Verified on Stäy: 1 false group -> 0. Verified on Eiffler: 0 -> 0 (it has no duplicates).
--
-- Also adds the soft-delete filter this Hub's copy was missing. Without it a deleted supplier still
-- counted toward a group, and the panel renders members by looking them up in the (live-only)
-- supplier list -- so the header counted a group whose row then silently refused to draw.

begin;

create or replace view public.v_supplier_duplicates as
with basis as (
  select
    id,
    -- Letters and digits of the visible name, case-folded. Punctuation, spacing and "&" vs "und"
    -- are exactly what differs between two hand/AI-entered spellings of one company.
    nullif(lower(regexp_replace(coalesce(name, ''), '[^[:alnum:]]', '', 'g')), '') as name_key,
    -- An EU VAT id anywhere in the field: two letters then 8-12 digits (DE + 9 here).
    nullif(substring(upper(coalesce(vat_id, '')) from '[A-Z]{2}[0-9]{8,12}'), '') as ust_key,
    -- A German Steuernummer anywhere in the field, in the common NN/NNN/NNNNN shape.
    nullif(substring(coalesce(vat_id, '') from '[0-9]{2,3}/[0-9]{3}/[0-9]{4,5}'), '') as steuer_key
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

-- Sanity (after applying):
--   select key_type, key_value, n from public.v_supplier_duplicates order by key_type, key_value;
--   -- Immonetz expects 7 rows; Stäy and Eiffler expect none.
--
--   -- and no group may contain a deleted supplier:
--   select d.key_value from public.v_supplier_duplicates d
--     join public.suppliers s on s.id = any(d.ids) where s.deleted_at is not null;
--   -- expect no rows
