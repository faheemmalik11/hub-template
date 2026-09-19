-- 20260815190000 — ingest_exclusions: drop the stale global term unique index.
--
-- Background. The live table carries TWO unique indexes:
--   ingest_exclusions_term_scope_uniq — the current one, on (lower(term), scope)
--   ingest_exclusions_term_uniq       — a legacy one, on lower(term) alone
-- The legacy index makes a term globally unique, so the same term cannot exist under two different
-- scopes — e.g. a rule on "Miteinander" in scope 'party' blocks ever adding "Miteinander" in scope
-- 'subject'. That contradicts the scoped model the screen is built around: `scope` exists precisely
-- so the same string can mean different things in different parts of the mail/invoice.
--
-- Why it is still here. `0002_base_schema.sql` (lines 414-415) already drops `term_uniq` and creates
-- the scoped index — but `0011_hub_ingest_exclusions.sql` sorts AFTER it and re-creates the legacy
-- index with `create unique index if not exists ingest_exclusions_term_uniq`. The later migration
-- resurrects exactly what the earlier one removed, so every fresh apply ends up with both. The
-- Immonetz Hub does not have this index (it was dropped there out-of-band), which is why the same
-- screen behaves differently between the two Hubs.
--
-- This migration drops the legacy index only. The scoped index stays and keeps enforcing "one rule
-- per term per scope". Idempotent.

begin;

drop index if exists public.ingest_exclusions_term_uniq;

commit;

-- Sanity (after applying) — expect only ingest_exclusions_pkey and ingest_exclusions_term_scope_uniq:
--   select indexname from pg_indexes
--    where schemaname = 'public' and tablename = 'ingest_exclusions' and indexdef ilike '%unique%';
--
-- Note: 0011_hub_ingest_exclusions.sql will re-create the legacy index if it is ever replayed
-- against a fresh database. Applying this migration after it (as the ordering does) is what keeps
-- the end state correct.
