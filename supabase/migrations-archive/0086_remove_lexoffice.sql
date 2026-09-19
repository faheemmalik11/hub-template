-- 0086_remove_lexoffice.sql
-- Removes LexOffice entirely. It was inherited from immonetz's codebase this repo was forked
-- from; StäyHub has no LexOffice integration requirement -- the client was explicit: "no API
-- integration to any invoicing tool -- neither now nor planned for the initial scope." No real
-- Stäy company has a LexOffice account. The manual outgoing-invoice-upload feature (migration
-- 0085) already covers the actual requirement.
--
-- customers/outgoing_invoices themselves are NOT dropped -- they're shared with the upload
-- feature (source='upload'), only their LexOffice-specific columns/values go. lexoffice_config/
-- lexoffice_sync_log are dropped outright.
--
-- SAFETY: customers/outgoing_invoices are not wrapped by any legacy `select *` view the way
-- invoices/v_invoices_list was during the business-line removal (migration 0083) -- confirmed by
-- reading migration 0052 in full -- so dropping their LexOffice columns is a plain, safe
-- ALTER TABLE ... DROP COLUMN. Still, this migration checks live row counts before narrowing
-- either source CHECK constraint and raises loudly instead of silently succeeding if it finds a
-- row that would be orphaned by the narrower vocabulary -- the same idiom every migration this
-- session uses before a destructive step.
--
-- lexoffice_config held 2 real rows as of the 2026-08-04 RLS audit (docs/ROLES_AND_ACCESS.md) --
-- possibly a credential belonging to a different client (immonetz), given lexoffice.functions.ts's
-- own comments reference testing "against a live IMKO key" (IMKO is immonetz's company code, not
-- one of Stäy's five). Dropping the table removes it from THIS database; if that key was ever
-- live, it may be worth having it rotated on the LexOffice/immonetz side too -- outside anything
-- this migration can do.
--
-- Idempotent throughout: `if not exists`, `drop policy/constraint if exists`, same convention as
-- every other migration this session.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'customers')
  then raise exception '0086 preconditions failed: table customers is missing (run 0052 first)';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'outgoing_invoices')
  then raise exception '0086 preconditions failed: table outgoing_invoices is missing (run 0052 first)';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'lexoffice_config')
  then raise exception '0086 preconditions failed: table lexoffice_config is missing (run 0052 first)';
  end if;
  raise notice '0086 preconditions ok';
end $$;

-- ===========================================================================
-- 1. Pre-flight: refuse to narrow either source CHECK if it would orphan a live row. A row here
--    means a human decision is needed (migrate it, or widen the vocabulary back), not an
--    automatic drop.
-- ===========================================================================
do $$
declare
  v_bad_outgoing int;
  v_bad_customers int;
begin
  select count(*) into v_bad_outgoing
    from public.outgoing_invoices where source is distinct from 'upload';
  if v_bad_outgoing > 0 then
    raise exception
      '0086 pre-flight FAILED: % outgoing_invoices row(s) have source <> ''upload''. '
      'These would be orphaned by narrowing outgoing_invoices_source_check to (''upload''). '
      'Resolve them first (migrate to source=''upload'' or decide to keep them some other way) '
      'before re-running this migration.', v_bad_outgoing;
  end if;

  select count(*) into v_bad_customers
    from public.customers where source = 'lexoffice';
  if v_bad_customers > 0 then
    raise exception
      '0086 pre-flight FAILED: % customers row(s) have source = ''lexoffice''. These would be '
      'orphaned by narrowing customers_source_check to (''app'', ''upload''). Resolve them first '
      '(e.g. re-source them as ''app'') before re-running this migration.', v_bad_customers;
  end if;

  raise notice '0086 pre-flight ok: no outgoing_invoices/customers row would be orphaned';
end $$;

-- ===========================================================================
-- 2. Drop the LexOffice-specific columns
-- ===========================================================================
alter table public.customers drop column if exists lexoffice_contact_id;
alter table public.outgoing_invoices drop column if exists lexoffice_voucher_id;

-- ===========================================================================
-- 3. Narrow the source vocabulary now that LexOffice can never be the source of a new row
-- ===========================================================================
alter table public.customers drop constraint if exists customers_source_check;
alter table public.customers add constraint customers_source_check
  check (source in ('app', 'upload'));
comment on column public.customers.source is
  '''app'' = created directly in the Hub (e.g. /kunden), ''upload'' = created alongside an '
  'uploaded outgoing invoice (migration 0085). LexOffice removed entirely by migration 0086.';

alter table public.outgoing_invoices drop constraint if exists outgoing_invoices_source_check;
alter table public.outgoing_invoices add constraint outgoing_invoices_source_check
  check (source in ('upload'));
comment on column public.outgoing_invoices.source is
  'Always ''upload'' (migration 0085) -- LexOffice removed entirely by migration 0086, so there is '
  'no other way an outgoing invoice enters this table.';

-- ===========================================================================
-- 4. customers now needs a real INSERT path -- LexOffice's "create there first, mirror here" is
--    gone, and /kunden's "Neuer Kunde" dialog needs somewhere to write to. customers is the
--    direct sales-side analog of suppliers, which already has exactly this policy (migration
--    0014's lieferanten_insert) -- matching it here rather than inventing a new shape.
-- ===========================================================================
drop policy if exists "customers_insert" on public.customers;
create policy "customers_insert" on public.customers
  for insert to authenticated with check (true);

-- ===========================================================================
-- 5. Drop lexoffice_config / lexoffice_sync_log and their RPCs
-- ===========================================================================
drop function if exists public.set_lexoffice_config(uuid, text, boolean, text, text);
drop function if exists public.update_lexoffice_config_status(uuid, boolean, text, text);
drop table if exists public.lexoffice_config;
drop table if exists public.lexoffice_sync_log;

commit;

-- ===========================================================================
-- 6. Self-checks
-- ===========================================================================

-- 6a. lexoffice_config/lexoffice_sync_log and both RPCs are actually gone.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'lexoffice_config')
  then raise exception '0086 self-check FAILED: lexoffice_config still exists'; end if;
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'lexoffice_sync_log')
  then raise exception '0086 self-check FAILED: lexoffice_sync_log still exists'; end if;
  if exists (select 1 from pg_proc where proname = 'set_lexoffice_config'
              and pronamespace = 'public'::regnamespace)
  then raise exception '0086 self-check FAILED: set_lexoffice_config still exists'; end if;
  if exists (select 1 from pg_proc where proname = 'update_lexoffice_config_status'
              and pronamespace = 'public'::regnamespace)
  then raise exception '0086 self-check FAILED: update_lexoffice_config_status still exists'; end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'customers'
                and column_name = 'lexoffice_contact_id')
  then raise exception '0086 self-check FAILED: customers.lexoffice_contact_id still exists'; end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'outgoing_invoices'
                and column_name = 'lexoffice_voucher_id')
  then raise exception '0086 self-check FAILED: outgoing_invoices.lexoffice_voucher_id still exists';
  end if;
  raise notice '0086 self-check ok: lexoffice_config/lexoffice_sync_log and their columns/RPCs '
    'are fully removed';
end $$;

-- 6b. Both narrowed CHECK constraints actually reject the old vocabulary now.
do $$
declare
  v_company_id uuid;
  v_customer_id uuid;
  v_rejected boolean;
begin
  select id into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise notice '0086 self-check 6b skipped: no company available to probe';
  else
    begin
      insert into public.customers (company_id, name, source)
      values (v_company_id, 'self-check 0086', 'lexoffice');
      v_rejected := false;
    exception when check_violation then
      v_rejected := true;
    end;
    if not v_rejected then
      raise exception '0086 self-check 6b FAILED: customers.source still accepts ''lexoffice''';
    end if;

    insert into public.customers (company_id, name, source)
    values (v_company_id, 'self-check 0086', 'app')
    returning id into v_customer_id;

    begin
      insert into public.outgoing_invoices (company_id, customer_id, source, amount_gross)
      values (v_company_id, v_customer_id, 'lexoffice', 1);
      v_rejected := false;
    exception when check_violation then
      v_rejected := true;
    end;
    if not v_rejected then
      raise exception '0086 self-check 6b FAILED: outgoing_invoices.source still accepts ''lexoffice''';
    end if;

    raise notice '0086 self-check 6b ok: both source CHECK constraints reject the old vocabulary';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0086 self-check 6b rollback';
exception when restrict_violation then
  null;
end $$;

-- 6c. authenticated can now insert a customer directly (RLS-enforced, not just catalog GRANT --
-- same reasoning as migration 0052's own self-check 5c' on why this table needs a functional
-- probe rather than an information_schema.table_privileges check).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'customers'
       and cmd = 'INSERT' and 'authenticated' = any(roles) and with_check = 'true'
  ) then
    raise exception '0086 self-check FAILED: customers_insert policy missing or not open';
  end if;
  raise notice '0086 self-check 6c ok: customers_insert policy is open to authenticated';
end $$;

-- ===========================================================================
-- Sanity (run manually after applying):
--   select source, count(*) from public.customers group by 1;
--   select source, count(*) from public.outgoing_invoices group by 1;
-- ===========================================================================
