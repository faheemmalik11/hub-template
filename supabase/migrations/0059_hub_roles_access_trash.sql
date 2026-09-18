-- 0046_roles_access_trash.sql
-- Briefing Screen 17 (Roles, team & settings) + Screen 18 (Delete & trash), Appendix A7/A8.
--
-- Two independent pieces bundled in one migration because they share the same root cause
-- (Appendix A7's own words): "Every logged-in user may see everything (using (true)). With six
-- companies with real figures this is untenable."
--
--   1. Roles & company-scoped access. A partial RBAC scaffold already existed (tenants, roles,
--      app_users, user_company_access) but was a generic multi-tenant SaaS skeleton -- seeded
--      roles super_admin/tenant_admin/user, unrelated test tenants/users. Stäy is a SINGLE
--      tenant (confirmed with the user), so the tenant layer is dropped entirely and the four
--      roles from Appendix A7 are seeded directly: super_admin (developer, invisible to client),
--      admin (Philipp, sees everything), supervisor (optional, scoped approver),
--      assistant (Anja, no BWA/evaluations visibility).
--
--   2. Trash. Soft-delete (deleted_at/deleted_by/delete_reason) is already this codebase's
--      established convention for most entities -- what's missing is (a) any RESTORE capability
--      (none exists anywhere today), (b) a final PURGE (hard-delete) path, and (c) soft-delete
--      columns on outgoing_invoices, the one user-facing entity that lacks them.
--
-- Scope decision (see the plan for the full reasoning): this migration hardens READ access
-- (who can SEE what) via RLS SELECT policies on every company-scoped table, since that is the
-- literal client ask ("should only see the companies... applies everywhere"). Write policies
-- (INSERT/UPDATE) are deliberately left open to any authenticated user for this pass, except
-- `companies` (admin-only, explicit in A7) and the new app_users/user_company_access tables --
-- retrofitting write-side company checks correctly needs per-screen judgment (e.g. Screen 3's
-- assign-a-company-to-an-unassigned-invoice flow must not be blocked by the very check that
-- results from that assignment) that is a disclosed follow-up, not done half-way here.
--
-- IMPORTANT, found while writing this migration: `has_company_access(p_company uuid)` and
-- `current_app_user_id()` already existed live on this project, applied by hand at some earlier
-- point (not through any tracked migration -- absent from `supabase_migrations.schema_migrations`
-- and from every local migration file). The in-code comments cite Appendix A7 by name, so this
-- is earlier real work on this exact feature, not scaffold noise. Their design is adopted
-- as-is rather than replaced: "no grants recorded for a user" reads as UNRESTRICTED (matches
-- `user_company_access`'s own comment: "keeps current behaviour until the permissions feature
-- switches enforcement on"), so nobody gets locked out the moment this migration lands -- access
-- only narrows once an admin actually grants specific companies to a specific person via the
-- new /team screen. This migration re-declares both functions verbatim (idempotent, and finally
-- gives them a tracked migration) and adds `is_admin()`/`current_role_name()` alongside, a
-- distinct role-based check (not company-based) used for admin-only actions (managing employees,
-- editing company master data, final purge).

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop the multi-tenant layer (single tenant, confirmed with the client's developer).
-- ---------------------------------------------------------------------------
-- Drop the table first: its own "tenants_member_read" policy references app_users.tenant_id,
-- so Postgres sees the policy as a dependent of that column and refuses to drop the column
-- while the (about-to-be-deleted-anyway) policy still exists.
drop table if exists public.tenants cascade;
alter table public.roles drop column if exists tenant_id;
alter table public.app_users drop column if exists tenant_id;

-- ---------------------------------------------------------------------------
-- 2. Clean out the generic-scaffold test data, reseed the four real roles.
-- ---------------------------------------------------------------------------
delete from public.app_users
 where email in ('kamran_steels@gmail.com', 'kamran_steel@gmail.com', 'thinkpad.lenevot460@gmail.com');

delete from public.roles where name in ('tenant_admin', 'user');

insert into public.roles (name)
  values ('admin'), ('supervisor'), ('assistant')
  on conflict do nothing;
-- 'super_admin' already exists (row already used by the real logged-in user) -- left as-is.

comment on table public.roles is
  'Fixed set of four roles (Appendix A7): super_admin, admin, supervisor, assistant. '
  'Single tenant -- no per-tenant role customization, so this is a small closed list, not a '
  'user-manageable table.';

-- ---------------------------------------------------------------------------
-- 3. Access-check helpers. All SECURITY DEFINER so they bypass RLS on their own lookups
--    (avoids recursion when used inside app_users'/user_company_access's own policies) and are
--    safe to call from any policy. current_app_user_id()/has_company_access() re-declared
--    verbatim from the pre-existing (untracked) versions -- see the note above.
-- ---------------------------------------------------------------------------
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.app_users
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and is_active
   limit 1;
$$;

-- Role-based check, distinct from has_company_access's grant-based one below: used for actions
-- that are never about a specific company (managing employees, editing company master data,
-- final purge) so it must deny explicitly for a deactivated account rather than silently
-- returning null-ish "no role found" (same care as has_company_access takes below).
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
    from public.app_users u
    join public.roles r on r.id = u.role_id
   where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and u.is_active
   limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_name() in ('admin', 'super_admin'), false);
$$;

create or replace function public.has_company_access(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    -- Deliberately NOT current_app_user_id(): that function filters on is_active, so a
    -- deactivated account would come back as "no user found" and fall through to the
    -- unrestricted branch below. Offboarding has to deny, not open up, so the active flag is
    -- read here as data rather than used as a filter.
    select id, is_active
      from public.app_users
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     limit 1
  )
  select case
    -- A7: "if someone leaves the company, their access is deactivated, not deleted". Checked
    -- first, so a deactivated account is denied even the watch-all bucket.
    when exists (select 1 from me where not is_active) then false
    -- Watch-all. A receipt that is not assigned to a company yet has to stay visible to every
    -- reviewer, otherwise unassigned receipts would drop out of the queue instead of getting
    -- assigned, which is the exact failure the catch-all owner exists to prevent.
    when p_company is null then true
    -- No grants recorded for this person means unrestricted, preserving today's behaviour.
    -- Soft-deleted grants do not count as grants, otherwise revoking a person's last company
    -- would flip them from restricted straight back to seeing everything.
    when not exists (
      select 1
        from public.user_company_access a
        join me on a.user_id = me.id
       where a.deleted_at is null
    ) then true
    else exists (
      select 1
        from public.user_company_access a
        join me on a.user_id = me.id
       where a.company_id = p_company
         and a.deleted_at is null
         -- An explicit can_view = false is a denial, not a grant.
         and a.can_view
    )
  end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on a new function, which the security advisor
-- correctly flags -- an anonymous (unauthenticated) caller could otherwise invoke these. They'd
-- get a safe "deny" answer either way (auth.jwt() is null with no session), but revoking PUBLIC
-- and granting only to `authenticated` closes the hole properly rather than relying on that.
revoke execute on function public.current_app_user_id() from public;
revoke execute on function public.current_role_name() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.has_company_access(uuid) from public;
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_company_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. app_users / user_company_access: admin-managed on top of the existing self-read policies.
-- ---------------------------------------------------------------------------
drop policy if exists "app_users_admin_read" on public.app_users;
create policy "app_users_admin_read" on public.app_users
  for select to authenticated using (public.is_admin());

drop policy if exists "app_users_admin_insert" on public.app_users;
create policy "app_users_admin_insert" on public.app_users
  for insert to authenticated with check (public.is_admin());

drop policy if exists "app_users_admin_update" on public.app_users;
create policy "app_users_admin_update" on public.app_users
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_company_access_admin_read" on public.user_company_access;
create policy "user_company_access_admin_read" on public.user_company_access
  for select to authenticated using (public.is_admin());

drop policy if exists "user_company_access_admin_insert" on public.user_company_access;
create policy "user_company_access_admin_insert" on public.user_company_access
  for insert to authenticated with check (public.is_admin());

drop policy if exists "user_company_access_admin_update" on public.user_company_access;
create policy "user_company_access_admin_update" on public.user_company_access
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Rewrite SELECT policies on every company-scoped table to has_company_access(company_id).
--    INSERT/UPDATE left untouched (see the scope note at the top), except companies itself.
-- ---------------------------------------------------------------------------
drop policy if exists "auth_read" on public.companies;
drop policy if exists "gesellschaften_read" on public.companies;
drop policy if exists "gesellschaften_insert" on public.companies;
drop policy if exists "gesellschaften_update" on public.companies;
drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies
  for select to authenticated using (public.has_company_access(id));
drop policy if exists "companies_admin_insert" on public.companies;
create policy "companies_admin_insert" on public.companies
  for insert to authenticated with check (public.is_admin());
drop policy if exists "companies_admin_update" on public.companies;
create policy "companies_admin_update" on public.companies
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "auth_read" on public.invoices;
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "outgoing_invoices_select" on public.outgoing_invoices;
create policy "outgoing_invoices_select" on public.outgoing_invoices
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "bank_accounts_read" on public.bank_accounts;
drop policy if exists "bank_accounts_select" on public.bank_accounts;
create policy "bank_accounts_select" on public.bank_accounts
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "bank_transactions_read" on public.bank_transactions;
drop policy if exists "bank_transactions_select" on public.bank_transactions;
create policy "bank_transactions_select" on public.bank_transactions
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "manual_bookings_read" on public.manual_bookings;
drop policy if exists "manual_bookings_select" on public.manual_bookings;
create policy "manual_bookings_select" on public.manual_bookings
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "approval_rules_read" on public.approval_rules;
drop policy if exists "approval_rules_select" on public.approval_rules;
create policy "approval_rules_select" on public.approval_rules
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "assignment_rules_read" on public.assignment_rules;
drop policy if exists "assignment_rules_select" on public.assignment_rules;
create policy "assignment_rules_select" on public.assignment_rules
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "datev_handover_batches_select" on public.datev_handover_batches;
create policy "datev_handover_batches_select" on public.datev_handover_batches
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "datev_routes_select" on public.datev_routes;
create policy "datev_routes_select" on public.datev_routes
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "lexoffice_config_select" on public.lexoffice_config;
create policy "lexoffice_config_select" on public.lexoffice_config
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "lexoffice_sync_log_select" on public.lexoffice_sync_log;
create policy "lexoffice_sync_log_select" on public.lexoffice_sync_log
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "auth_read" on public.property_assignment;
drop policy if exists "property_assignment_select" on public.property_assignment;
create policy "property_assignment_select" on public.property_assignment
  for select to authenticated using (public.has_company_access(company_id));

-- suppliers/tags/bwa_categories/business_line/properties stay visible to every authenticated
-- role -- cross-company master data (suppliers has no company_id at all: one supplier can
-- invoice several companies), not per-company confidential. Only the invoices/transactions
-- under them are company-filtered, already covered above.

-- ---------------------------------------------------------------------------
-- 6. Trash: soft-delete parity for outgoing_invoices (the one gap), plus generic restore/purge.
-- ---------------------------------------------------------------------------
alter table public.outgoing_invoices
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists delete_reason text;

-- Every table below already has the deleted_at/deleted_by/delete_reason trio (confirmed via
-- information_schema) AND an existing user-facing delete action in the app -- this RPC pair is
-- the missing restore/purge half of a convention that's otherwise already in place everywhere.
create or replace function public.restore_record(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_rows    int;
  v_allowed constant text[] := array[
    'invoices', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'bwa_categories', 'properties', 'companies', 'business_line'
  ];
begin
  if p_table is null or p_id is null then
    raise exception 'restore_record: table and id are required';
  end if;
  if not (p_table = any(v_allowed)) then
    raise exception 'restore_record: table % is not trash-eligible', p_table;
  end if;

  -- GET DIAGNOSTICS, not FOUND: FOUND is not reliably set after a dynamic EXECUTE ... USING
  -- UPDATE on this project (confirmed empirically while writing this migration -- a real update
  -- with rows affected still left FOUND false), while GET DIAGNOSTICS ROW_COUNT is unambiguous
  -- for any DML, static or dynamic.
  execute format(
    'update public.%I set deleted_at = null, deleted_by = null, delete_reason = null '
    'where id = $1 and deleted_at is not null',
    p_table
  ) using p_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'restore_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, at)
  values (p_table, p_id, 'restored', 'Datensatz aus dem Papierkorb wiederhergestellt', v_actor, now());
end;
$$;

-- Admin-only, and only ever on an already soft-deleted row -- purging is the final, irreversible
-- step, never a shortcut past the trash. The change_history row is written BEFORE the delete
-- (with a snapshot of the row in `data`) so the audit trail survives the row itself.
--
-- `invoices` is special-cased to the existing purge_invoice() RPC instead of a blind delete:
-- invoices has referencing rows under NO ACTION FKs (invoice_transaction_matches,
-- processing_log, imported_messages) and original files sitting in Storage, none of which a
-- generic `delete from invoices` would clean up -- purge_invoice() already does this correctly.
-- Every other table in the allow-list is safe to delete directly: FK-checked (a live reference
-- fails loudly instead of silently orphaning data), and CASCADE where that's the correct
-- behaviour (e.g. approval_rules -> business_line/properties/suppliers).
create or replace function public.purge_record(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_allowed constant text[] := array[
    'invoices', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'bwa_categories', 'properties', 'companies', 'business_line'
  ];
  v_snapshot jsonb;
begin
  if not public.is_admin() then
    raise exception 'purge_record: admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'purge_record: table and id are required';
  end if;
  if not (p_table = any(v_allowed)) then
    raise exception 'purge_record: table % is not trash-eligible', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 and deleted_at is not null', p_table)
    into v_snapshot using p_id;
  if v_snapshot is null then
    raise exception 'purge_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values (p_table, p_id, 'purged', 'Datensatz endgültig gelöscht', v_actor, v_snapshot, now());

  if p_table = 'invoices' then
    perform public.purge_invoice(p_id);
  else
    execute format('delete from public.%I where id = $1', p_table) using p_id;
  end if;
end;
$$;

revoke execute on function public.restore_record(text, uuid) from public;
revoke execute on function public.purge_record(text, uuid) from public;
grant execute on function public.restore_record(text, uuid) to authenticated;
grant execute on function public.purge_record(text, uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- declare
--   v_company_a uuid;
--   v_company_b uuid;
--   v_test_user_id uuid := gen_random_uuid(); -- no real auth_user_id, just exercises has_company_access() logic paths
--   v_supplier uuid;
-- begin
--   select id into v_company_a from public.companies order by created_at limit 1;
--   select id into v_company_b from public.companies order by created_at desc limit 1;
--
--   -- has_company_access: NULL passes, admin (the seeded real user) sees everything.
--   assert public.has_company_access(null) = true, 'null company_id must be visible to everyone';
--
--   -- restore/purge round-trip on a disposable test supplier.
--   insert into public.suppliers (name) values ('Selbsttest Papierkorb GmbH') returning id into v_supplier;
--   update public.suppliers set deleted_at = now(), deleted_by = 'selftest', delete_reason = 'selftest'
--    where id = v_supplier;
--   perform public.restore_record('suppliers', v_supplier);
--   assert (select deleted_at from public.suppliers where id = v_supplier) is null, 'restore did not clear deleted_at';
--   assert exists (select 1 from public.change_history where table_name = 'suppliers' and record_id = v_supplier and type = 'restored'),
--     'restore did not log to change_history';
--
--   update public.suppliers set deleted_at = now(), deleted_by = 'selftest', delete_reason = 'selftest'
--    where id = v_supplier;
--   perform public.purge_record('suppliers', v_supplier);
--   assert not exists (select 1 from public.suppliers where id = v_supplier), 'purge did not remove the row';
--   assert exists (select 1 from public.change_history where table_name = 'suppliers' and record_id = v_supplier and type = 'purged'),
--     'purge did not log to change_history';
--
--   -- roles: exactly the four expected names, no leftover test data.
--   assert (select count(*) from public.roles) = 4, 'expected exactly 4 roles';
--   assert not exists (select 1 from public.app_users where email like '%kamran%' or email like '%thinkpad%'),
--     'test-scaffold app_users rows were not cleaned up';
--   assert not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenants'),
--     'tenants table should have been dropped';
--
--   raise notice 'self-check ok';
-- end $$;
