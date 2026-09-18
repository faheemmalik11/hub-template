-- 0011 — RLS write policies for the master-data tables (properties, companies, suppliers).
--
-- Problem: `properties` (migration 0004) has RLS enabled in the live DB with only read access, so the
-- Hub's "create property" / "edit property" screens fail with 42501
-- ("new row violates row-level security policy for table properties"). The same gap applies to the
-- company-create screen (companies) and the supplier edit / soft-delete screen (suppliers),
-- which use the same authenticated client-side write pattern.
--
-- Fix: ensure RLS is enabled and that the `authenticated` role may read + insert + update these
-- master-data tables. The Hub only ever creates/edits master data; it never hard-deletes
-- (suppliers soft-delete sets deleted_at, which is an UPDATE). The external ingestion pipeline
-- writes via service_role, which bypasses RLS — so these policies do not affect it.
--
-- Idempotent: enabling RLS is a no-op if already enabled, and each policy is dropped-if-exists
-- before being (re)created, so this migration is safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- properties (properties/projects)
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;

drop policy if exists "objekte_read" on public.properties;
create policy "objekte_read" on public.properties
  for select to authenticated using (true);

drop policy if exists "objekte_insert" on public.properties;
create policy "objekte_insert" on public.properties
  for insert to authenticated with check (true);

drop policy if exists "objekte_update" on public.properties;
create policy "objekte_update" on public.properties
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- companies (companies)
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

drop policy if exists "gesellschaften_read" on public.companies;
create policy "gesellschaften_read" on public.companies
  for select to authenticated using (true);

drop policy if exists "gesellschaften_insert" on public.companies;
create policy "gesellschaften_insert" on public.companies
  for insert to authenticated with check (true);

drop policy if exists "gesellschaften_update" on public.companies;
create policy "gesellschaften_update" on public.companies
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- suppliers (suppliers). Edit + soft-delete (deleted_at) are both UPDATEs.
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;

drop policy if exists "lieferanten_read" on public.suppliers;
create policy "lieferanten_read" on public.suppliers
  for select to authenticated using (true);

drop policy if exists "lieferanten_insert" on public.suppliers;
create policy "lieferanten_insert" on public.suppliers
  for insert to authenticated with check (true);

drop policy if exists "lieferanten_update" on public.suppliers;
create policy "lieferanten_update" on public.suppliers
  for update to authenticated using (true) with check (true);

commit;
