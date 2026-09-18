-- 0072_source_external_upsertable — make (source, external_id) usable as an ON CONFLICT target.
--
-- 0071 created this as a PARTIAL unique index (`where external_id is not null`). Postgres can
-- only infer a partial index when the statement repeats its predicate:
--     ... on conflict (source, external_id) where external_id is not null ...
-- PostgREST's upsert (supabase-js `.upsert({ onConflict: 'source,external_id' })`) cannot emit
-- that clause, so every sync would have failed with:
--     ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- The predicate is unnecessary anyway. Postgres treats NULLs as DISTINCT in a unique index by
-- default (NULLS DISTINCT, still the default in PG 17), so a plain unique index already permits
-- unlimited rows with external_id IS NULL — which is exactly what BANKSapi rows are. They dedup
-- on banksapi_hash instead.

begin;

drop index if exists public.bank_transactions_source_external_idx;

create unique index if not exists bank_transactions_source_external_idx
  on public.bank_transactions (source, external_id);

comment on index public.bank_transactions_source_external_idx is
  'Dedup key for pleo/manual rows and the ON CONFLICT target for their sync. NOT partial: a '
  'partial index cannot be inferred by PostgREST upserts. NULL external_id (BANKSapi rows) stays '
  'unconstrained because Postgres treats NULLs as distinct.';

commit;
