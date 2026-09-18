-- 0035_approval_workflow.sql
-- Briefing Screen 6 ("Approval workflow"): before an invoice is paid it must be checked and
-- approved, usually in two stages (assistant pre-checks, management gives final approval), with
-- the path (who, in what order, above what amount) configurable per company.
--
-- Deliberately NOT built here (decided with the client before this migration):
--   * No new roles/permissions table tied to Supabase auth, no RLS-level enforcement of who may
--     approve. Approvers stay name-based, the same spirit as the existing hardcoded
--     `ZUWEISBAR` (the assignable-people list) in src/lib/data/format.ts — just promoted
--     to a real table because a deputy pointer and per-company chain config cannot live in a
--     flat TS array. Action-button gating happens client-side.
--   * No new `workflow_status` value. The 9 already in the CHECK constraint
--     (migrations 0002 + this-file's-predecessor 0025) cover every action the briefing asks for:
--     'eingegangen','in_pruefung','rueckfrage','freigegeben_assistenz','freigegeben_vorgesetzter',
--     'uebergeben_datev','abgeschlossen','abgelehnt','nicht_relevant'.
--   * No new audit table. Every approve/return/reject/skip action is logged as one more
--     `invoice_history` row (via the existing `insertVerlauf` helper), the same table already
--     used for 'statuswechsel'/'notiz'/'zuordnung' entries — this gets per-step cycle time for
--     free from `created_at` deltas, no new timestamp plumbing.
--
-- Live schema naming (see 0025's own note): the tables this migration references are the
-- English-renamed live names (`invoices`, `invoice_history`, `companies`, `suppliers`,
-- `properties`, `business_line`), NOT the German names still shown in the stale
-- `supabase/schema.sql` snapshot. Verified directly against src/lib/data/queries.ts, which
-- already queries `.from("invoices")` / `.from("invoice_history")` throughout.
--
-- Idempotent throughout: `if not exists`, `drop policy if exists`, lookup-driven `do` blocks.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
  v_name    text;
begin
  foreach v_name in array array[
    'invoices', 'invoice_history', 'companies', 'suppliers', 'properties', 'business_line'
  ]
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = v_name
    ) then
      v_missing := v_missing || v_name;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoice_history' and column_name = 'type'
  ) then
    v_missing := v_missing || 'column invoice_history.type';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'amount_gross'
  ) then
    v_missing := v_missing || 'column invoices.amount_gross';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Migration 0035 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. Approvers — name-based, not tied to Supabase auth identity (decided)
-- ===========================================================================
-- `name` is declared UNIQUE inline (not via a separate CREATE UNIQUE INDEX afterward) because
-- `deputy_name`'s self-referencing FK needs that unique constraint to already exist at the point
-- the FK is defined within this same CREATE TABLE.
create table if not exists public.approvers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  role          text not null check (role in ('assistant', 'manager')),
  -- Who covers for this approver while they're away. Self-referencing by name (not id) so the
  -- column reads the same way `assigned_to` already does elsewhere in this app.
  deputy_name   text references public.approvers(name) on delete set null,
  -- After how many days without movement a receipt waiting on this approver counts as
  -- "overdue" in the UI. NULL = no escalation badge for this approver.
  escalation_days int check (escalation_days is null or escalation_days > 0),
  -- Briefing Screen 6: "after final approval, either the boss transfers the money himself, or
  -- the approval goes to the person with account access" — only meaningful on a manager.
  payment_handler text check (payment_handler is null or payment_handler in ('boss', 'account_holder')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.approvers enable row level security;
drop policy if exists "approvers_read" on public.approvers;
create policy "approvers_read" on public.approvers for select to authenticated using (true);
drop policy if exists "approvers_insert" on public.approvers;
create policy "approvers_insert" on public.approvers for insert to authenticated with check (true);
drop policy if exists "approvers_update" on public.approvers;
create policy "approvers_update" on public.approvers for update to authenticated using (true) with check (true);

-- ===========================================================================
-- 2. Approval rules — dynamic chain resolution, mirrors assignment_rules' shape (0025)
-- ===========================================================================
-- Reuses the exact "most specific wins" scope+specificity pattern already proven for category/
-- VAT assignment, as its own table (not a new `target` on `assignment_rules`) because the value
-- a rule resolves to here is a two-step chain plus a threshold, not a single scalar.
create or replace function public.approval_rule_specificity(
  p_supplier_id      uuid,
  p_business_line_id uuid,
  p_property_id      uuid,
  p_company_id       uuid
)
returns int
language sql
immutable
as $$
  select
    16 * (
        (case when p_supplier_id      is not null then 1 else 0 end)
      + (case when p_business_line_id is not null then 1 else 0 end)
      + (case when p_property_id      is not null then 1 else 0 end)
      + (case when p_company_id       is not null then 1 else 0 end)
    )
    + (case when p_supplier_id      is not null then 8 else 0 end)
    + (case when p_business_line_id is not null then 4 else 0 end)
    + (case when p_property_id      is not null then 2 else 0 end)
    + (case when p_company_id       is not null then 1 else 0 end);
$$;

create table if not exists public.approval_rules (
  id uuid primary key default gen_random_uuid(),

  -- Scope. NULL on a dimension means "any". At least one of the four, or this row could only
  -- ever be the single per-company (or global) fallback — see the not-empty check below.
  supplier_id      uuid references public.suppliers(id) on delete cascade,
  business_line_id uuid references public.business_line(id) on delete cascade,
  property_id      uuid references public.properties(id) on delete cascade,
  company_id       uuid references public.companies(id) on delete cascade,

  -- Briefing: "approval from a threshold amount". Matches invoices with amount_gross >= this.
  min_amount numeric not null default 0 check (min_amount >= 0),

  -- The chain. step_2 null = single-step chain (this receipt never touches
  -- 'freigegeben_assistenz', approving it jumps straight to 'freigegeben_vorgesetzter').
  step_1_approver text not null references public.approvers(name),
  step_2_approver text references public.approvers(name),

  specificity int generated always as (
    public.approval_rule_specificity(supplier_id, business_line_id, property_id, company_id)
  ) stored,

  is_active  boolean not null default true,
  note       text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Soft delete only — a rule that shaped a past approval stays auditable.
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text,

  -- A rule must pin at least one dimension, mirroring assignment_rules' own safeguard: without
  -- this a single all-NULL row would silently become a global catch-all, the same risk 0025
  -- already guarded against for category/VAT rules.
  constraint approval_rules_scope_not_empty check (
    supplier_id is not null
    or business_line_id is not null
    or property_id is not null
    or company_id is not null
  )
);

create index if not exists idx_approval_rules_resolve
  on public.approval_rules (specificity desc)
  where is_active and deleted_at is null;

create unique index if not exists approval_rules_scope_unique
  on public.approval_rules (supplier_id, business_line_id, property_id, company_id, min_amount)
  nulls not distinct
  where deleted_at is null;

alter table public.approval_rules enable row level security;
drop policy if exists "approval_rules_read" on public.approval_rules;
create policy "approval_rules_read" on public.approval_rules for select to authenticated using (true);
drop policy if exists "approval_rules_insert" on public.approval_rules;
create policy "approval_rules_insert" on public.approval_rules for insert to authenticated with check (true);
drop policy if exists "approval_rules_update" on public.approval_rules;
create policy "approval_rules_update" on public.approval_rules for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Resolution: which chain applies to one invoice
-- ---------------------------------------------------------------------------
create or replace function public.resolve_approval_rule(p_invoice_id uuid)
returns public.approval_rules
language sql
stable
set search_path = public
as $$
  select r.*
    from public.approval_rules r
    join public.invoices i on i.id = p_invoice_id
   where r.is_active
     and r.deleted_at is null
     and r.min_amount <= coalesce(i.amount_gross, 0)
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.business_line_id is null or r.business_line_id = i.business_line_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
   order by r.specificity desc, r.min_amount desc, r.created_at desc
   limit 1;
$$;

comment on function public.resolve_approval_rule(uuid) is
  'The winning approval chain for one invoice: most specific scope first, then the highest '
  'min_amount still at or below the invoice amount. NULL row set when no rule matches (should '
  'not happen once every company has its fallback row).';

-- ===========================================================================
-- 3. Seed data
-- ===========================================================================
-- No approver seed. The original rows named immonetz's staff; Stäy's approvers are
-- different people (four department heads -- see communication thread 2) and their approval
-- rules are still unspecified. Create them via the admin screen rather than inventing them.

-- One company-wide fallback rule per company, so every invoice resolves to a chain even before
-- anyone configures a more specific rule. Two-step (assistant pre-checks, manager gives final
-- approval) at any amount, matching the briefing's default description of the process.
-- Fallback rule intentionally not seeded: it needs real approver names, which Stäy has not
-- confirmed yet. Until then invoices resolve to a NULL chain, which resolve_approval_rule()
-- already handles.
-- insert into public.approval_rules (company_id, step_1_approver, step_2_approver, min_amount, note)
-- select c.id, '<step 1>', '<step 2>', 0, 'Default fallback'
--   from public.companies c
--  where not exists (
--    select 1 from public.approval_rules r
--     where r.company_id = c.id
--       and r.supplier_id is null and r.business_line_id is null and r.property_id is null
--       and r.min_amount = 0 and r.deleted_at is null
--  );

-- ===========================================================================
-- 4. Self-checks — probe real data, always roll back (restrict_violation idiom)
-- ===========================================================================

-- 4a. A rule scoped to a real company + supplier beats that company's own (unscoped) fallback
-- row. Pins supplier_id specifically so the probe's scope tuple cannot collide with the
-- company-wide fallback seeded in section 3 (same company, min_amount, but all dimensions
-- null) under approval_rules_scope_unique.
do $$
declare
  v_company_id  uuid;
  v_supplier_id uuid;
  v_invoice_id  uuid;
  v_scoped_id   uuid;
  v_won         uuid;
begin
  select id, supplier_id, company_id
    into v_invoice_id, v_supplier_id, v_company_id
    from public.invoices
   where supplier_id is not null and company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice 'approval_rules self-check 4a skipped: no invoice with both a supplier and a company';
  else
    insert into public.approval_rules (company_id, supplier_id, step_1_approver, step_2_approver, min_amount, note)
    values (v_company_id, v_supplier_id, 'Approver A', 'Approver B', 0, 'self-check 4a, rolled back')
    returning id into v_scoped_id;

    select r.id into v_won from public.resolve_approval_rule(v_invoice_id) r;

    if v_won is distinct from v_scoped_id then
      raise exception 'approval_rules self-check 4a FAILED: expected scoped rule % to win for invoice %, got %',
        v_scoped_id, v_invoice_id, v_won;
    end if;

    raise notice 'approval_rules self-check 4a ok: scoped rule beats the company fallback';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0035 self-check 4a rollback';
exception
  when restrict_violation then
    null; -- unwinds the probe row, keeps the schema changes above
end $$;

-- 4b. A rule whose min_amount is above the invoice's own amount is excluded from resolution.
do $$
declare
  v_invoice_id uuid;
  v_amount     numeric;
  v_company_id uuid;
  v_high_id    uuid;
  v_won        uuid;
begin
  select id, amount_gross, company_id into v_invoice_id, v_amount, v_company_id
    from public.invoices
   where amount_gross is not null and company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice 'approval_rules self-check 4b skipped: no invoice with a known amount_gross';
  else
    insert into public.approval_rules (company_id, step_1_approver, step_2_approver, min_amount, note)
    values (v_company_id, 'Approver A', 'Approver B', v_amount + 1000000, 'self-check 4b, rolled back')
    returning id into v_high_id;

    select r.id into v_won from public.resolve_approval_rule(v_invoice_id) r;

    if v_won = v_high_id then
      raise exception 'approval_rules self-check 4b FAILED: a rule with min_amount above the invoice amount won (%)',
        v_high_id;
    end if;

    raise notice 'approval_rules self-check 4b ok: a too-high min_amount rule is excluded';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0035 self-check 4b rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 4c. Soft-deleting a rule removes it from resolve_approval_rule's output. Pins supplier_id for
-- the same scope-collision reason as 4a.
do $$
declare
  v_company_id  uuid;
  v_supplier_id uuid;
  v_invoice_id  uuid;
  v_scoped_id   uuid;
  v_won         uuid;
begin
  select id, supplier_id, company_id
    into v_invoice_id, v_supplier_id, v_company_id
    from public.invoices
   where supplier_id is not null and company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice 'approval_rules self-check 4c skipped: no invoice with both a supplier and a company';
  else
    insert into public.approval_rules (company_id, supplier_id, step_1_approver, step_2_approver, min_amount, note)
    values (v_company_id, v_supplier_id, 'Approver A', 'Approver B', 0, 'self-check 4c, rolled back')
    returning id into v_scoped_id;

    update public.approval_rules set deleted_at = now() where id = v_scoped_id;

    select r.id into v_won from public.resolve_approval_rule(v_invoice_id) r;

    if v_won = v_scoped_id then
      raise exception 'approval_rules self-check 4c FAILED: soft-deleted rule % still resolved', v_scoped_id;
    end if;

    raise notice 'approval_rules self-check 4c ok: a soft-deleted rule no longer resolves';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0035 self-check 4c rollback';
exception
  when restrict_violation then
    null;
end $$;

commit;

-- Sanity (run manually after applying):
--   select * from public.resolve_approval_rule((select id from public.invoices limit 1));
--   select name, role, deputy_name from public.approvers;
