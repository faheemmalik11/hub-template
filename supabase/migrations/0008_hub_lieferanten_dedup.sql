-- 0005 — Supplier (suppliers) de-duplication.
--
-- Suppliers are an OPEN set (new vendors on every batch), so a hand-maintained alias list like the one for
-- companies does not fit. Instead the pipeline resolves supplier identity on STABLE keys: VAT-ID first, then
-- IBAN, and only then a normalized name. normalized_name stores that fallback key (written by the pipeline
-- via resolve_codes.normalize, so normalization stays single-source in Python) and is indexed for fast lookup.
--
-- Effect: from now on one real vendor stops fragmenting into several records across name variations. Existing
-- duplicates are not merged automatically; the view below lists them for a human to merge deliberately.
-- Additive + idempotent + transactional.

begin;

alter table suppliers add column if not exists normalized_name text;

create index if not exists lieferanten_normalized_name_idx on suppliers (normalized_name);
create index if not exists lieferanten_ust_id_idx on suppliers (vat_id);
create index if not exists lieferanten_iban_idx on suppliers (iban);

-- Likely-duplicate suppliers for manual review/merge: same normalized name, or same VAT-ID, across >1 row.
create or replace view v_lieferanten_duplicates as
  select 'name'::text as key_type, normalized_name as key_value, count(*) as n, array_agg(id order by id) as ids
    from suppliers
   where normalized_name is not null and normalized_name <> ''
   group by normalized_name having count(*) > 1
  union all
  select 'ust_id', vat_id, count(*), array_agg(id order by id)
    from suppliers
   where vat_id is not null and vat_id <> ''
   group by vat_id having count(*) > 1;

commit;

-- After applying: backfill normalized_name for existing rows with the pipeline's normalizer (Python),
-- then check:  select * from v_lieferanten_duplicates;
