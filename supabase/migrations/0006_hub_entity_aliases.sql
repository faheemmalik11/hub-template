-- 0003 — entity_aliases: generic code <-> name-variant mapping for deterministic resolution.
--
-- One row per (entity_type, entity_code, alias). The pipeline uses it to map an extracted
-- company/property name to a canonical code; the Hub UI can view/add/deactivate rows. It is
-- reusable for any entity_type ('gesellschaft', 'objekt', later e.g. 'lieferant').
--
-- Normalization (case / spacing / punctuation / '&'<->'und' / legal-suffix) lives in the
-- pipeline (resolve_codes.py), so ONLY raw variants are stored here — no normalized column,
-- no duplicated normalization logic. Ambiguity ("one variant -> two codes") is dropped by the
-- pipeline at load time. Transactional + idempotent.

begin;

create table if not exists public.entity_aliases (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,                 -- 'gesellschaft' | 'objekt' | (future types)
  entity_code  text not null,                 -- canonical code, e.g. 'IMKO'
  alias        text not null,                 -- raw variant, exactly as a human types it
  is_active    boolean not null default true,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   text,
  updated_at   timestamptz not null default now()
);

create unique index if not exists entity_aliases_uniq
  on public.entity_aliases (entity_type, entity_code, alias);
create index if not exists entity_aliases_lookup_idx
  on public.entity_aliases (entity_type) where is_active;

-- No seed data. The immonetz company aliases that used to live here were that client's
-- master data and do not apply to Stäy. Seed Stäy's companies/aliases separately
-- once the company list is confirmed (see communication thread 1).

commit;

-- Sanity (run manually after applying):
--   select entity_type, entity_code, count(*) from entity_aliases group by 1,2 order by 1,2;
