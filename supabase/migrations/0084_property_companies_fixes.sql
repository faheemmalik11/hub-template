-- 0084_property_companies_fixes.sql
-- Two bugs found in code review of migration 0083, before any real data exists in
-- property_companies (still 0 rows) so both are safe schema-only fixes:
--
--   1. RLS mismatch. `properties` INSERT/UPDATE are open to any authenticated user
--      (migration 0014: `objekte_insert`/`objekte_update`, `with check (true)`) -- any
--      authenticated user can create or edit a property, e.g. via the `?neu=<code>`
--      deep-link from an invoice whose extracted property isn't in the master data yet.
--      0083 gated property_companies INSERT/UPDATE to `is_admin()` only, mirroring
--      property_assignment's own admin-only write policy (migration 0079). That mismatch
--      means a non-admin user can create a property through the now-mandatory
--      company-selection form, have the property insert succeed, and then have the
--      company-link insert fail on RLS -- leaving an orphaned, unassigned property, which
--      is exactly the state this feature exists to prevent. Fixed by matching
--      `properties`' own openness: any authenticated user may insert/update
--      property_companies, same as they already can for the property itself.
--
--   2. Non-partial UNIQUE constraint. `unique (property_id, company_id)` in 0083 is not
--      scoped to active rows, so soft-deleting a company link (useSetPropertyCompanies'
--      remove path) and later re-adding the SAME company to the SAME property collides
--      with the old soft-deleted row (23505 duplicate key) -- the user cannot re-link a
--      company they'd previously unlinked. Fixed the same way assignment_rules_scope_unique
--      (migration 0038) handles the identical problem: a partial unique INDEX scoped to
--      `where deleted_at is null`, so a soft-deleted row no longer occupies the key.

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'property_companies')
  then
    raise exception 'migration 0084 preconditions not met: public.property_companies is missing '
      '(expected from migration 0083)';
  end if;
  raise notice '0084 preconditions ok';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Open INSERT/UPDATE to any authenticated user, matching properties' own RLS shape
-- ---------------------------------------------------------------------------
drop policy if exists "property_companies_admin_insert" on public.property_companies;
create policy "property_companies_insert" on public.property_companies
  for insert to authenticated with check (true);

drop policy if exists "property_companies_admin_update" on public.property_companies;
create policy "property_companies_update" on public.property_companies
  for update to authenticated using (true) with check (true);

comment on table public.property_companies is
  'Direct property <-> company assignment, replacing the business-line model (migration 0083). A '
  'property may belong to more than one company (the client''s dual-ownership cases); the UI '
  'requires at least one before a property''s form can be saved, enforced client-side. Insert/'
  'update open to any authenticated user, matching properties'' own write policy (migration 0014) '
  '-- fixed by 0084 after review found it gated to admin-only while property creation itself is '
  'not. Soft-delete only -- a past link explains how earlier receipts were booked.';

-- ---------------------------------------------------------------------------
-- 2. Replace the plain UNIQUE constraint with a partial unique index on active rows
-- ---------------------------------------------------------------------------
-- Default constraint name for `unique (property_id, company_id)` declared inline on the CREATE
-- TABLE in 0083. Looked up by definition rather than assumed, in case the live name differs.
do $$
declare
  v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.property_companies'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (property_id, company_id)';
  if v_con is not null then
    execute format('alter table public.property_companies drop constraint %I', v_con);
    raise notice '0084 dropped non-partial unique constraint %', v_con;
  else
    raise notice '0084: no plain UNIQUE(property_id, company_id) constraint found, skipping drop';
  end if;
end $$;

create unique index if not exists property_companies_active_unique
  on public.property_companies (property_id, company_id)
  where deleted_at is null;

comment on index public.property_companies_active_unique is
  'A property may only link to the same company once among ACTIVE rows. Partial (deleted_at is '
  'null) so re-adding a previously soft-deleted company link does not collide with the old row '
  '(migration 0084 -- 0083''s original constraint was not partial).';

commit;

-- ---------------------------------------------------------------------------
-- Self-checks
-- ---------------------------------------------------------------------------

-- 8a. RLS: insert/update policies exist and are not admin-gated.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'property_companies'
       and policyname = 'property_companies_insert' and cmd = 'INSERT'
       and with_check = 'true'
  ) then
    raise exception '0084 self-check FAILED: property_companies_insert policy missing or not open';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'property_companies'
       and policyname = 'property_companies_update' and cmd = 'UPDATE'
       and qual = 'true' and with_check = 'true'
  ) then
    raise exception '0084 self-check FAILED: property_companies_update policy missing or not open';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'property_companies'
       and policyname in ('property_companies_admin_insert', 'property_companies_admin_update')
  ) then
    raise exception '0084 self-check FAILED: old admin-only policies still present';
  end if;
  raise notice '0084 self-check ok: property_companies insert/update are open to authenticated';
end $$;

-- 8b. Soft-delete then re-add the same (property, company) pair actually works now. Probes real
-- rows if a property and a company exist, rolled back via the restrict_violation idiom.
do $$
declare
  v_prop uuid;
  v_comp uuid;
  v_id1  uuid;
  v_id2  uuid;
begin
  select id into v_prop from public.properties limit 1;
  select id into v_comp from public.companies limit 1;
  if v_prop is null or v_comp is null then
    raise notice '0084 self-check skipped: need at least one property and one company to probe';
  else
    insert into public.property_companies (property_id, company_id)
    values (v_prop, v_comp) returning id into v_id1;

    update public.property_companies set deleted_at = now() where id = v_id1;

    -- Re-adding the same pair must succeed now that the old row is soft-deleted.
    insert into public.property_companies (property_id, company_id)
    values (v_prop, v_comp) returning id into v_id2;

    raise notice '0084 self-check ok: re-adding a soft-deleted (property, company) link succeeds';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0084 self-check rollback';
exception when restrict_violation then
  null; -- unwinds both probe rows, keeps the schema changes above
end $$;
