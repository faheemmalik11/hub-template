-- 0012 — created_at / updated_at on the master-data tables.
--
-- The Hub's Suppliers / Companies / Properties lists now show "Erstellt" (created) and
-- "Aktualisiert" (updated) columns and allow sorting by them. `objekte` already has both
-- timestamps (migration 0004); this migration backfills the gaps:
--   * gesellschaften: had neither → add created_at + updated_at.
--   * lieferanten:     had created_at only → add updated_at.
--
-- updated_at is maintained by the app's update mutations (same pattern as properties), so no trigger.
-- Existing rows get now() for the NOT NULL columns; suppliers.updated_at stays NULL until a row is
-- first edited in the Hub (shown as "—"). Additive + idempotent.

begin;

-- companies — add both timestamps (NOT NULL, default now() backfills existing rows).
alter table public.companies
  add column if not exists created_at timestamptz not null default now();
alter table public.companies
  add column if not exists updated_at timestamptz not null default now();

-- suppliers — add updated_at (nullable: existing rows have never been edited in-app).
alter table public.suppliers
  add column if not exists updated_at timestamptz;

commit;
