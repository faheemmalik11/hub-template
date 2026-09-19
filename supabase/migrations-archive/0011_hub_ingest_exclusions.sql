-- 0008 — ingest_exclusions: configurable list of recipients/terms NOT to import yet.
--
-- Config-as-data (same pattern as vat_rates): the pipeline skips an invoice BEFORE creating a
-- Beleg when an active term appears in its recipient/issuer name. The Gmail/Drive source is left
-- untouched (the pipeline never modifies the mailbox/Drive), nothing is deleted, and nothing is
-- marked paid. Add more rows here or from a UI later — no code change needed.
--
-- Matching normalizes with resolve_codes.normalize() (case/punctuation/'&'<->'und'/legal-suffix),
-- so "Mieteinander GmbH", "mieteinander" and the misspelling "Miteinander" are all covered by the
-- terms below. Additive + idempotent + transactional.

begin;

create table if not exists public.ingest_exclusions (
  id          uuid primary key default gen_random_uuid(),
  term        text not null,                 -- raw term matched (normalized) against recipient/issuer name
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now()
);

create unique index if not exists ingest_exclusions_term_uniq
  on public.ingest_exclusions (lower(term));

-- First entry: Mieteinander (out of scope for now, client decision 2026-07-10).
insert into public.ingest_exclusions (term, note) values
  ('Mieteinander',      'Out of scope for now (client decision 2026-07-10)'),
  ('Miteinander',       'Common misspelling of Mieteinander'),
  ('Mieteinander GmbH', 'Out of scope for now (client decision 2026-07-10)')
on conflict (lower(term)) do nothing;

commit;

-- Sanity (after applying):
--   select term, is_active from ingest_exclusions order by term;   -- expect the 3 rows above
--
-- To re-enable a term later:  update ingest_exclusions set is_active=false where term='...';
-- Note: only affects FUTURE runs. Already-imported invoices are never touched by this list.
