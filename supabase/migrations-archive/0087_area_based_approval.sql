-- 0087_area_based_approval.sql
-- Area-based approval routing (client requirement, communication thread
-- 2026-08-04-department-heads-and-approvals): "In immonetz approvals went up a management
-- chain (assistant -> boss). In Stäy hub it's routed by area of responsibility instead, each
-- department head approves their own area (for example Hospitality, or Stäy real estate)."
--
-- CONTEXT -- read before touching this file again:
--   * Migration 0078 already seeded these 4 people (real emails) into `app_users`, with a free-
--     text `area_of_responsibility` column, but deliberately did NOT seed them into `approvers`
--     (used by /freigabe-regeln) -- its own note #4 says routing "before the area question is
--     settled would encode a guess." That question is what this migration answers.
--   * 0078's note #1 asked whether "area" = the business_line dimension (LTR/STR/DEV/SVC). Moot
--     now: migration 0083 (this session) removed business_line entirely. Area is necessarily a
--     new dimension, on `companies` and `approvers`, not a re-use of anything that used to exist.
--   * `app_users.area_of_responsibility` (free text, drives company VISIBILITY) and this
--     migration's `approvers.area`/`covers_all_areas` (canonical enum, drives approval ROUTING)
--     are deliberately two separate, unsynced representations of the same fact for the same 4
--     people -- same spirit as 0078's own note #4 keeping `approvers` and `app_users` as
--     separate identities. Not unified here; flagged so a future edit to one isn't assumed to
--     also update the other.
--   * Operational gap this migration does NOT close (see 0078 note #2): Alexis Gonzalez and
--     Lukas Oldach still have no Supabase-auth login and no `user_company_access` grants (0078
--     left them `is_active = false` on purpose -- "granting a guess would be wrong"). This
--     migration makes them resolvable as an invoice's routing target; they cannot actually open
--     the app or click approve until invited via /team and granted access to their companies
--     (Stäy GmbH + Stäy Gronau for Alexis; My Baufi + Impuls VV + Infio for Lukas).
--   * RLS risk, not addressed here (deliberately, to keep this migration single-concern):
--     `approvers`/`approval_rules` are still wide open to any `authenticated` user (0048's
--     original decision, scoped to "who may click approve," not "who may edit the routing
--     table"). This migration turns `approvers`/`approval_rules` into the thing that actually
--     decides who a real invoice's manager sign-off routes to -- worth a follow-up migration
--     gating INSERT/UPDATE behind `is_admin()` (same pattern `0059` already uses for `companies`/
--     `app_users`), tracked in docs/APPROVAL_ROUTING.md rather than silently inherited.
--
-- DECISIONS MADE HERE (the client left both open; see docs/APPROVAL_ROUTING.md for full
-- reasoning -- these are judgment calls, not client-confirmed facts):
--   * Company -> area mapping (inferred from company naming + the tax advisor's cost-centre
--     workbook, whose own per-property notes show Stäy leasing/operating units it doesn't own
--     across the other companies' buildings -- an operating/hospitality model, distinct from
--     their real-estate-ownership role):
--       hospitality: STAY (Stäy GmbH), STGR (Stäy Gronau GmbH)
--       stay_re:     MYBA (My Baufi AG), IMPV (Impuls VV GmbH), INFI (Infio Immobilien GmbH)
--   * "All areas" (Saskia Christ, Andreas Christ): either one alone is sufficient.
--   * Also seeds Petra Kistner / Vanessa Zelt into `approvers` (role='assistant', their real
--     company scopes from communication thread 1 -- already used by 0078 for
--     `user_company_access`) and one company-wide fallback `approval_rules` row per company,
--     completing the exact seed 0048 sketched and left commented out ("needs real approver
--     names, which Stäy has not confirmed yet"). This does NOT model Petra's cross-company
--     "mail/transfers/pre-check for ALL companies" duty (0078 note #3, still open, still needs
--     its own design) -- it only gives her a plain step_1 slot for the 3 companies she owns.
--
-- Deliberately unchanged: resolve_approval_rule(uuid)'s signature (still `returns
-- approval_rules`, same columns) -- existing callers (`useResolveApprovalRule`,
-- `nextLegalActions`, `approvalQueryTarget`, $nr.tsx's payment-handoff lookup) all read
-- `step_2_approver` off the RESOLVED row already; making that field itself fall back to the area
-- approver is transparent to every one of them, no frontend change required. The raw
-- `approval_rules` table (read directly by /freigabe-regeln's admin CRUD) is untouched -- an
-- unconfigured rule still shows a bare NULL there.
--
-- Idempotent throughout: `if not exists`, `drop constraint/function if exists`,
-- `on conflict do nothing/update`.

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
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'companies'
  ) then v_missing := v_missing || 'table companies'; end if;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'invoices'
  ) then v_missing := v_missing || 'table invoices'; end if;

  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'resolve_approval_rule'
  ) then v_missing := v_missing || 'function resolve_approval_rule'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '0087 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. companies.area
-- ===========================================================================
alter table public.companies
  add column if not exists area text check (area in ('hospitality', 'stay_re'));

comment on column public.companies.area is
  'Business area of responsibility (client: "each department head approves their own area"). '
  'NULL means not yet assigned -- resolve_approval_rule() leaves step_2_approver at whatever '
  'the rule itself set (typically NULL) rather than guessing. Distinct from company/cost-centre '
  'identity (client: "areas of responsibility are not companies") -- this mapping is a Stäy-Hub'
  '-side inference, not a client-confirmed fact; see docs/APPROVAL_ROUTING.md.';

-- ===========================================================================
-- 2. approvers.area / covers_all_areas
-- ===========================================================================
alter table public.approvers
  add column if not exists area text check (area in ('hospitality', 'stay_re')),
  add column if not exists covers_all_areas boolean not null default false;

comment on column public.approvers.area is
  'The one area this approver signs off for. NULL if not area-scoped (covers_all_areas, or a '
  'step_1-only accounting approver like Petra/Vanessa with no department-head role at all).';
comment on column public.approvers.covers_all_areas is
  'True for a department head whose area is "All areas" (client: Saskia Christ, Andreas '
  'Christ) -- resolve_area_approver() falls back to any covers_all_areas approver when no '
  'exact-area match exists. Mutually exclusive with area (see approvers_area_shape below).';

alter table public.approvers drop constraint if exists approvers_area_shape;
alter table public.approvers
  add constraint approvers_area_shape check (area is null or not covers_all_areas);

-- Only a department head (role='manager') participates in area routing -- encodes that a future
-- role='assistant' row (e.g. Petra/Vanessa) can never accidentally become a step-2 candidate.
alter table public.approvers drop constraint if exists approvers_area_requires_manager;
alter table public.approvers
  add constraint approvers_area_requires_manager
  check (area is null or role = 'manager');
alter table public.approvers drop constraint if exists approvers_all_areas_requires_manager;
alter table public.approvers
  add constraint approvers_all_areas_requires_manager
  check (not covers_all_areas or role = 'manager');

-- At most one active exact-match approver per area -- turns "someone activates a second
-- Hospitality head by mistake" into a rejected write instead of a silent, order-dependent pick.
create unique index if not exists approvers_one_active_per_area
  on public.approvers (area)
  where is_active and area is not null;

-- ===========================================================================
-- 3. resolve_area_approver -- exact area match, else an all-areas fallback
-- ===========================================================================
-- SETOF, not a single public.approvers: a non-SETOF function called in a FROM clause always
-- produces exactly one row (all-NULL when the underlying query matched nothing) instead of zero
-- rows -- SETOF gives real zero-or-one-row semantics, which resolve_approval_rule's own
-- `... into v_area_approver from resolve_area_approver(v_area) ra` call below (and self-check
-- 7h) both depend on to correctly distinguish "no approver found" from "found one with a null
-- field."
drop function if exists public.resolve_area_approver(text);
create or replace function public.resolve_area_approver(p_area text)
returns setof public.approvers
language sql
stable
set search_path = public
as $$
  select a.*
    from public.approvers a
   where p_area is not null
     and a.is_active
     and (
       a.area = p_area
       or (
         a.covers_all_areas
         and not exists (
           select 1 from public.approvers x
            where x.is_active and x.area = p_area
         )
       )
     )
   order by (a.area = p_area) desc, a.created_at asc
   limit 1;
$$;

comment on function public.resolve_area_approver(text) is
  'The department head for one area: an exact area match if an active one exists, else any '
  'active covers_all_areas approver (oldest first, deterministic tiebreak). No row if p_area is '
  'NULL or nothing matches -- an unassigned company never silently guesses an approver.';

grant execute on function public.resolve_area_approver(text) to authenticated;

-- ===========================================================================
-- 4. approval_rules.skip_step_2 -- disambiguates "not configured" from "deliberately single-step"
-- ===========================================================================
-- 0048's own comment: "step_2 null = single-step chain ... jumps straight to
-- freigegeben_vorgesetzter" -- NULL was already a deliberate config value. Overloading it to also
-- mean "auto-resolve by area" would silently remove the ability to configure a genuine
-- single-step rule. This column keeps that meaning explicit and separate.
alter table public.approval_rules
  add column if not exists skip_step_2 boolean not null default false;

comment on column public.approval_rules.skip_step_2 is
  'True = this rule is deliberately single-step (no manager sign-off at all); resolve_approval_'
  'rule() leaves step_2_approver at NULL even if the invoice''s company has an area with an '
  'active approver. False (default) = an empty step_2_approver falls through to area-based '
  'auto-resolution instead. Ignored when step_2_approver is explicitly set (that always wins).';

-- ===========================================================================
-- 5. resolve_approval_rule -- unchanged signature; the resolved row's step_2_approver now
--    falls back to the area-resolved approver when the winning rule left it empty and did not
--    opt out via skip_step_2. plpgsql (was sql) so the resolved row can be conditionally patched
--    in place rather than re-selecting every column.
-- ===========================================================================
create or replace function public.resolve_approval_rule(p_invoice_id uuid)
returns public.approval_rules
language plpgsql
stable
set search_path = public
as $$
declare
  v_rule public.approval_rules;
  v_area text;
  v_area_approver text;
begin
  select r.* into v_rule
    from public.approval_rules r
    join public.invoices i on i.id = p_invoice_id
   where r.is_active
     and r.deleted_at is null
     and r.min_amount <= coalesce(i.amount_gross, 0)
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
   order by r.specificity desc, r.min_amount desc, r.created_at desc
   limit 1;

  if v_rule.id is not null and v_rule.step_2_approver is null and not v_rule.skip_step_2 then
    select c.area into v_area
      from public.invoices i
      join public.companies c on c.id = i.company_id
     where i.id = p_invoice_id;

    select ra.name into v_area_approver from public.resolve_area_approver(v_area) ra;

    v_rule.step_2_approver := v_area_approver;
  end if;

  return v_rule;
end;
$$;

comment on function public.resolve_approval_rule(uuid) is
  'The winning approval chain for one invoice: most specific scope first, then the highest '
  'min_amount still at or below the invoice amount. If the winning rule left step_2_approver '
  'empty and did not set skip_step_2, the resolved row''s step_2_approver falls back to the '
  'area-based department head (resolve_area_approver, migration 0087) for the invoice''s '
  'company -- an explicit step_2_approver on the rule always wins over this fallback. NULL row '
  'when no rule matches at all.';

grant execute on function public.resolve_approval_rule(uuid) to authenticated;

-- ===========================================================================
-- 6. Seed data
-- ===========================================================================

-- 6a. The 4 real department heads.
insert into public.approvers (name, role, area, covers_all_areas, is_active)
values
  ('Alexis Gonzalez', 'manager', 'hospitality', false, true),
  ('Lukas Oldach',     'manager', 'stay_re',     false, true),
  ('Saskia Christ',    'manager', null,          true,  true),
  ('Andreas Christ',   'manager', null,          true,  true)
on conflict (name) do update
  set role             = excluded.role,
      area              = excluded.area,
      covers_all_areas  = excluded.covers_all_areas,
      updated_at        = now();

-- 6b. Accounting staff (thread 1, already used by 0078 for user_company_access) -- plain
-- step_1-only approvers, no area involvement at all.
insert into public.approvers (name, role, is_active)
values
  ('Petra Kistner', 'assistant', true),
  ('Vanessa Zelt',  'assistant', true)
on conflict (name) do update
  set role = excluded.role, updated_at = now();

-- 6c. Company -> area mapping.
update public.companies set area = 'hospitality' where code in ('STAY', 'STGR');
update public.companies set area = 'stay_re'      where code in ('MYBA', 'IMPV', 'INFI');

-- 6d. One company-wide fallback approval_rules row per company -- completes the exact seed 0048
-- sketched and left commented out. step_1 = the accounting person thread 1 assigned to that
-- company; step_2 left NULL/skip_step_2=false, so it auto-resolves to that company's area head.
insert into public.approval_rules (company_id, step_1_approver, step_2_approver, skip_step_2, min_amount, note, created_by)
select c.id,
       case when c.code in ('STAY', 'IMPV', 'STGR') then 'Petra Kistner' else 'Vanessa Zelt' end,
       null,
       false,
       0,
       'Company-wide fallback: assistant pre-check + area-based department-head sign-off (migration 0087)',
       'migration_0087'
  from public.companies c
 where c.code in ('STAY', 'IMPV', 'STGR', 'MYBA', 'INFI')
   and not exists (
     select 1 from public.approval_rules r
      where r.company_id = c.id
        and r.supplier_id is null and r.property_id is null
        and r.min_amount = 0 and r.deleted_at is null
   );

-- ===========================================================================
-- 7. Self-checks
-- ===========================================================================

-- 7a. Exact-area match: resolve_area_approver('hospitality') is the real seeded Alexis Gonzalez.
do $$
declare
  v_name text;
begin
  select ra.name into v_name from public.resolve_area_approver('hospitality') ra;
  if v_name is distinct from 'Alexis Gonzalez' then
    raise exception '0087 self-check 7a FAILED: expected Alexis Gonzalez for hospitality, got %', v_name;
  end if;
  raise notice '0087 self-check 7a ok: exact-area match resolves to Alexis Gonzalez';
end $$;

-- 7b. Exact-area match: resolve_area_approver('stay_re') is the real seeded Lukas Oldach.
do $$
declare
  v_name text;
begin
  select ra.name into v_name from public.resolve_area_approver('stay_re') ra;
  if v_name is distinct from 'Lukas Oldach' then
    raise exception '0087 self-check 7b FAILED: expected Lukas Oldach for stay_re, got %', v_name;
  end if;
  raise notice '0087 self-check 7b ok: exact-area match resolves to Lukas Oldach';
end $$;

-- 7c. All-areas fallback: with the exact-area head temporarily deactivated, resolution falls
-- back to a covers_all_areas approver (probed, rolled back).
do $$
declare
  v_name text;
begin
  update public.approvers set is_active = false where name = 'Alexis Gonzalez';

  select ra.name into v_name from public.resolve_area_approver('hospitality') ra;
  if v_name not in ('Saskia Christ', 'Andreas Christ') then
    raise exception '0087 self-check 7c FAILED: expected an all-areas fallback, got %', v_name;
  end if;

  raise notice '0087 self-check 7c ok: all-areas fallback fires when the exact-area head is inactive (resolved to %)', v_name;
  raise exception using errcode = 'restrict_violation', message = '0087 self-check 7c rollback';
exception
  when restrict_violation then
    null; -- unwinds the deactivation, keeps the schema changes above
end $$;

-- 7d. Mutual exclusivity: a row with both area and covers_all_areas set is rejected. Alexis is
-- temporarily deactivated first so the check_violation under test isn't masked by the separate
-- approvers_one_active_per_area unique index also firing on 'hospitality' (probed, rolled back).
do $$
begin
  update public.approvers set is_active = false where name = 'Alexis Gonzalez';

  begin
    insert into public.approvers (name, role, area, covers_all_areas)
    values ('0087 selfcheck bad approver', 'manager', 'hospitality', true);

    raise exception '0087 self-check 7d FAILED: area + covers_all_areas together was not rejected';
  exception
    when check_violation then
      raise notice '0087 self-check 7d ok: area + covers_all_areas together is rejected';
  end;

  raise exception using errcode = 'restrict_violation', message = '0087 self-check 7d rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 7e. resolve_approval_rule: an explicit step_2_approver on the winning rule is unaffected by
-- area auto-resolve (probed against a real invoice+supplier, rolled back).
do $$
declare
  v_invoice_id  uuid;
  v_supplier_id uuid;
  v_company_id  uuid;
  v_resolved    text;
begin
  select id, supplier_id, company_id
    into v_invoice_id, v_supplier_id, v_company_id
    from public.invoices
   where supplier_id is not null and company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice '0087 self-check 7e skipped: no invoice with both a supplier and a company';
  else
    insert into public.approval_rules (company_id, supplier_id, step_1_approver, step_2_approver, min_amount, note)
    values (v_company_id, v_supplier_id, 'Andreas Christ', 'Andreas Christ', 0, 'self-check 7e, rolled back');

    select r.step_2_approver into v_resolved from public.resolve_approval_rule(v_invoice_id) r;

    if v_resolved is distinct from 'Andreas Christ' then
      raise exception '0087 self-check 7e FAILED: expected explicit step_2_approver ''Andreas Christ'' to win, got %', v_resolved;
    end if;

    raise notice '0087 self-check 7e ok: an explicit step_2_approver is unaffected by area auto-resolve';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0087 self-check 7e rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 7f. resolve_approval_rule: falls through to area auto-resolve when the winning rule's
-- step_2_approver is NULL and skip_step_2 is false (probed, rolled back).
do $$
declare
  v_invoice_id   uuid;
  v_supplier_id  uuid;
  v_company_id   uuid;
  v_company_code text;
  v_expected     text;
  v_resolved     text;
begin
  select i.id, i.supplier_id, i.company_id, c.code
    into v_invoice_id, v_supplier_id, v_company_id, v_company_code
    from public.invoices i
    join public.companies c on c.id = i.company_id
   where i.supplier_id is not null and i.company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice '0087 self-check 7f skipped: no invoice with both a supplier and a company';
  else
    insert into public.approval_rules (company_id, supplier_id, step_1_approver, step_2_approver, skip_step_2, min_amount, note)
    values (v_company_id, v_supplier_id, 'Andreas Christ', null, false, 0, 'self-check 7f, rolled back');

    v_expected := case
      when v_company_code in ('STAY', 'STGR') then 'Alexis Gonzalez'
      when v_company_code in ('MYBA', 'IMPV', 'INFI') then 'Lukas Oldach'
      else null
    end;

    select r.step_2_approver into v_resolved from public.resolve_approval_rule(v_invoice_id) r;

    if v_expected is not null and v_resolved is distinct from v_expected then
      raise exception '0087 self-check 7f FAILED: expected area auto-resolve % for company %, got %',
        v_expected, v_company_code, v_resolved;
    end if;

    raise notice '0087 self-check 7f ok: a NULL step_2_approver falls through to area auto-resolve (%)', v_resolved;
  end if;

  raise exception using errcode = 'restrict_violation', message = '0087 self-check 7f rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 7g. resolve_approval_rule: skip_step_2=true stays single-step even though the invoice's
-- company has an area with an active approver (probed, rolled back).
do $$
declare
  v_invoice_id  uuid;
  v_supplier_id uuid;
  v_company_id  uuid;
  v_resolved    text;
begin
  select id, supplier_id, company_id
    into v_invoice_id, v_supplier_id, v_company_id
    from public.invoices
   where supplier_id is not null and company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice '0087 self-check 7g skipped: no invoice with both a supplier and a company';
  else
    insert into public.approval_rules (company_id, supplier_id, step_1_approver, step_2_approver, skip_step_2, min_amount, note)
    values (v_company_id, v_supplier_id, 'Andreas Christ', null, true, 0, 'self-check 7g, rolled back');

    select r.step_2_approver into v_resolved from public.resolve_approval_rule(v_invoice_id) r;

    if v_resolved is not null then
      raise exception '0087 self-check 7g FAILED: expected skip_step_2 to keep step_2_approver NULL, got %', v_resolved;
    end if;

    raise notice '0087 self-check 7g ok: skip_step_2=true keeps the chain single-step';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0087 self-check 7g rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 7h. resolve_area_approver(NULL) resolves to nothing -- an unassigned company's invoices never
-- silently guess an approver.
do $$
declare
  v_found boolean;
begin
  select exists(select 1 from public.resolve_area_approver(null)) into v_found;
  if v_found then
    raise exception '0087 self-check 7h FAILED: resolve_area_approver(NULL) returned a row';
  end if;
  raise notice '0087 self-check 7h ok: resolve_area_approver(NULL) returns no row';
end $$;

commit;

-- Sanity (run manually after applying):
--   select name, role, area, covers_all_areas from public.approvers order by name;
--   select code, name, area from public.companies order by code;
--   select id, company_id, step_1_approver, step_2_approver, skip_step_2 from public.approval_rules where deleted_at is null;
--   select (public.resolve_approval_rule(id)).step_2_approver from public.invoices limit 5;
