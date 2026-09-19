-- 0088_approval_rls_admin_only.sql
-- Gate writes to `approvers`/`approval_rules` behind is_admin() — a follow-up flagged explicitly
-- in migration 0087's own header comment and docs/APPROVAL_ROUTING.md:
--
--   "approvers/approval_rules are still wide open to any authenticated user (0048's original
--    decision, scoped to 'who may click approve,' not 'who may edit the routing table'). This
--    feature turns those tables into the thing that actually decides who a real invoice's
--    manager sign-off routes to. Under the current policy, any authenticated user could flip
--    covers_all_areas on themselves or repoint a department head's area."
--
-- 0048's own "no gating" decision explicitly covered a different axis (approval ACTIONS stay
-- name-based and client-side-gated only, no RLS -- unchanged by this migration) -- not the
-- routing CONFIGURATION itself, which this migration tightens using the exact pattern 0059
-- already established for `companies`/`app_users` (is_admin(), SELECT stays open).
--
-- UI side: /freigabe-regeln's nav entry is gated to ADMIN_ROLES in the same commit that applies
-- this migration (src/components/layout/app-shell.tsx), matching how /team, /papierkorb, and
-- /dateibenennung are already gated -- nav-hiding only, no route-level redirect guard, per this
-- app's existing documented convention ("hiding a link here just keeps the menu honest about
-- what a role can actually do, it doesn't grant or withhold anything by itself" -- the real
-- boundary is this RLS change).
--
-- Idempotent: `drop policy if exists` before every `create policy`.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'approvers'
  ) then v_missing := v_missing || 'table approvers'; end if;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'approval_rules'
  ) then v_missing := v_missing || 'table approval_rules'; end if;

  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'is_admin'
  ) then v_missing := v_missing || 'function is_admin'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '0088 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. approvers -- INSERT/UPDATE admin-only, SELECT stays open
-- ===========================================================================
drop policy if exists "approvers_insert" on public.approvers;
create policy "approvers_insert" on public.approvers
  for insert to authenticated with check (public.is_admin());

drop policy if exists "approvers_update" on public.approvers;
create policy "approvers_update" on public.approvers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- 2. approval_rules -- INSERT/UPDATE admin-only, SELECT stays open
-- ===========================================================================
drop policy if exists "approval_rules_insert" on public.approval_rules;
create policy "approval_rules_insert" on public.approval_rules
  for insert to authenticated with check (public.is_admin());

drop policy if exists "approval_rules_update" on public.approval_rules;
create policy "approval_rules_update" on public.approval_rules
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- 3. Self-checks
-- ===========================================================================
-- Migrations run as the service role (bypasses RLS entirely), so an automated check here cannot
-- actually simulate "a non-admin session gets rejected" -- 0059 hit the same limitation for its
-- own is_admin()-gated companies policies and left that as a documented manual check (see the
-- bottom of this file). What CAN be checked automatically is that the policy definitions
-- themselves reference is_admin(), not just that they exist.

-- 3a. All four policies exist and their expressions actually call is_admin() (catches "the policy
-- was recreated but the check expression is still `true`", not just "the policy is missing").
do $$
declare
  v_bad text[] := array[]::text[];
  v_expr text;
begin
  select with_check into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approvers' and policyname = 'approvers_insert';
  if v_expr is null or v_expr not ilike '%is_admin%' then
    v_bad := v_bad || 'approvers_insert';
  end if;

  select qual into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approvers' and policyname = 'approvers_update';
  if v_expr is null or v_expr not ilike '%is_admin%' then
    v_bad := v_bad || 'approvers_update (using)';
  end if;

  select with_check into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approvers' and policyname = 'approvers_update';
  if v_expr is null or v_expr not ilike '%is_admin%' then
    v_bad := v_bad || 'approvers_update (with check)';
  end if;

  select with_check into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approval_rules' and policyname = 'approval_rules_insert';
  if v_expr is null or v_expr not ilike '%is_admin%' then
    v_bad := v_bad || 'approval_rules_insert';
  end if;

  select qual into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approval_rules' and policyname = 'approval_rules_update';
  if v_expr is null or v_expr not ilike '%is_admin%' then
    v_bad := v_bad || 'approval_rules_update (using)';
  end if;

  select with_check into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approval_rules' and policyname = 'approval_rules_update';
  if v_expr is null or v_expr not ilike '%is_admin%' then
    v_bad := v_bad || 'approval_rules_update (with check)';
  end if;

  if array_length(v_bad, 1) > 0 then
    raise exception '0088 self-check 3a FAILED: policies not gated on is_admin(): %', array_to_string(v_bad, ', ');
  end if;
  raise notice '0088 self-check 3a ok: all four INSERT/UPDATE policies are gated on is_admin()';
end $$;

-- 3b. SELECT stays exactly as this migration found it -- it must not narrow read access, since
-- resolving an approval chain has to work regardless of the acting user's own admin status.
-- `approvers` kept its original 0048 policy (approvers_read, unconditionally open) untouched.
-- `approval_rules`'s was already rewritten by 0059 (approval_rules_select, scoped to
-- has_company_access(company_id)) before this migration ever ran -- unrelated to this change,
-- so the check confirms it's still exactly that, not that it's unconditionally open.
do $$
declare
  v_expr text;
begin
  select qual into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approvers' and policyname = 'approvers_read';
  if v_expr is distinct from 'true' then
    raise exception '0088 self-check 3b FAILED: approvers_read is no longer unconditionally open (got: %)', v_expr;
  end if;

  select qual into v_expr from pg_policies
   where schemaname = 'public' and tablename = 'approval_rules' and policyname = 'approval_rules_select';
  if v_expr is null or v_expr not ilike '%has_company_access%' then
    raise exception '0088 self-check 3b FAILED: approval_rules_select is no longer scoped by has_company_access (got: %)', v_expr;
  end if;

  raise notice '0088 self-check 3b ok: approvers_read is unchanged and open, approval_rules_select is unchanged and company-scoped';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Manual verification (run as a real non-admin session, e.g. an assistant, not the service
-- role -- RLS cannot be exercised meaningfully from inside this migration):
--
--   -- As a non-admin (assistant/supervisor): both must fail with a policy violation.
--   insert into public.approvers (name, role) values ('RLS probe', 'assistant');
--   update public.approval_rules set min_amount = min_amount where id = '<any real id>';
--
--   -- As an admin/super_admin: both must succeed (then clean up the probe row/undo the update).
-- ---------------------------------------------------------------------------
