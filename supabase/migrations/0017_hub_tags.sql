-- 0014 — invoice tagging: `tags` (label catalog) + `invoice_tags` (many-to-many link to invoices).
--
-- Additive only: two new tables, indexes, and RLS policies. Does not touch `invoices` or any
-- other existing table/column. The external Python pipeline never writes these tables and is
-- unaffected.
--
-- Idempotent: uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout, safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- tags (label catalog)
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case/whitespace-insensitive duplicate prevention ("Rechnung" and " rechnung " collide).
create unique index if not exists tags_name_unique
  on public.tags (lower(btrim(name)));

alter table public.tags enable row level security;

drop policy if exists "tags_read" on public.tags;
create policy "tags_read" on public.tags
  for select to authenticated using (true);

drop policy if exists "tags_insert" on public.tags;
create policy "tags_insert" on public.tags
  for insert to authenticated with check (true);

drop policy if exists "tags_update" on public.tags;
create policy "tags_update" on public.tags
  for update to authenticated using (true) with check (true);

drop policy if exists "tags_delete" on public.tags;
create policy "tags_delete" on public.tags
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- invoice_tags (many-to-many link: invoices <-> tags)
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_tags (
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invoice_id, tag_id)
);

-- The composite PK already indexes (invoice_id, tag_id) for invoice_id lookups; tag_id alone
-- (reverse lookup: invoices per tag, usage counts) needs its own index.
create index if not exists idx_invoice_tags_tag_id on public.invoice_tags (tag_id);

alter table public.invoice_tags enable row level security;

drop policy if exists "invoice_tags_read" on public.invoice_tags;
create policy "invoice_tags_read" on public.invoice_tags
  for select to authenticated using (true);

drop policy if exists "invoice_tags_insert" on public.invoice_tags;
create policy "invoice_tags_insert" on public.invoice_tags
  for insert to authenticated with check (true);

drop policy if exists "invoice_tags_delete" on public.invoice_tags;
create policy "invoice_tags_delete" on public.invoice_tags
  for delete to authenticated using (true);

commit;
