-- 0013 — backfill suppliers.updated_at and keep it populated.
--
-- The Hub now sorts the master-data lists by "Aktualisiert" (updated_at) by default and treats a
-- missing updated_at as equal to created_at. companies/properties already default updated_at to
-- now(); suppliers.updated_at (added in 0012) is nullable and NULL for every row that predates it.
--
-- This backfills those rows from created_at and sets a default so pipeline-inserted suppliers always
-- carry a value. Idempotent. Depends on 0012 (adds suppliers.updated_at).

begin;

update public.suppliers
  set updated_at = coalesce(created_at, now())
  where updated_at is null;

alter table public.suppliers
  alter column updated_at set default now();

commit;
