-- 0083_direct_property_company.sql
-- Replaces the business-line model (property x business_line -> company, migration 0002/0006)
-- with direct property<->company assignment for Stäy Hub.
--
-- WHY
--
-- The business-line model was ported from immonetz, where a property belongs to a company
-- THROUGH a business line (rental vs. sale), and the business line also decides VAT treatment.
-- That dimension does not exist for Stäy: the tax advisor's cost-centre workbook lists several
-- properties under two companies at once (Hinterstraße -> Infio/Stäy, Czernyring -> My Baufi/
-- Stäy) with nothing to disambiguate them via a business line. property_assignment has 0 rows
-- in the live DB by design (migration 0077 left it empty on purpose -- see
-- communication/work-log/2026-08-05-company-assignment-model.md).
--
-- The client's direction (communication/threads/2026-08-04-scope-clarification/04-inbound-
-- client.md): build direct property->company assignment (the ImmoNetz "no other choice"
-- pattern), always surface an unassigned property, and allow a property to genuinely belong to
-- more than one company -- but at least one is required. This migration is that resolution.
--
-- WHAT THIS MIGRATION DOES
--   1. New table property_companies: a plain property<->company many-to-many, no business-line
--      dimension. Mirrors property_assignment's RLS/soft-delete shape (migrations 0002/0059/0079).
--   2. VAT-deductibility default (migration 0044's resolve_default_vat_deductible_pct) is re-keyed
--      from business_line.vat_treatment to properties.vat_status -- the exact same three-value
--      vocabulary already lives there (set in the "Neues Objekt" dialog), so no new column.
--   3. assignment_rules and approval_rules keep working as rule engines, just with business_line_id
--      dropped as a scope dimension (their specificity formulas, resolve/preview/apply functions,
--      and "at least one dimension" CHECK constraints are all updated accordingly).
--   4. invoices.business_line_id's FK to business_line is dropped (its target is gone); the column
--      and business_line_code are left in place, inert -- v_invoices_list (select b.*, live
--      definition not version-controlled here) exposes every invoices column, so dropping either
--      would cascade into it. assignment_source's vocabulary (owned by the external pipeline,
--      migration 0027/0040) is renamed from property_assignment/property_assignment+name to
--      property_company/property_company+name to match -- flagged in docs/PIPELINE_STAEY.md as a
--      pipeline-side contract change.
--   5. business_line is removed from the generic trash system's table allow-list and v_trash.
--   6. property_assignment and business_line are dropped. property_assignment has 0 rows (safe);
--      business_line has 4 seed rows with FKs from invoices/assignment_rules/approval_rules, all
--      dropped by this migration before business_line itself is dropped.
--
-- NOT DONE HERE: the external Python ingestion pipeline's resolver (adapters/assignment/
-- resolver.py) currently reads property_assignment as its company-resolution key. That contract
-- changes to property -> company(ies) directly (ambiguous when a property has >1 company). This
-- is a separate repo and a separate coordination step -- see docs/PIPELINE_STAEY.md.
--
-- Idempotent throughout: `if not exists`, `drop ... if exists`, lookup-driven `do` blocks.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'business_line')
  then v_missing := v_missing || 'relation public.business_line'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'property_assignment')
  then v_missing := v_missing || 'relation public.property_assignment'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'business_line_id')
  then v_missing := v_missing || 'column invoices.business_line_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'assignment_rules'
                    and column_name = 'business_line_id')
  then v_missing := v_missing || 'column assignment_rules.business_line_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'approval_rules'
                    and column_name = 'business_line_id')
  then v_missing := v_missing || 'column approval_rules.business_line_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'properties'
                    and column_name = 'vat_status')
  then v_missing := v_missing || 'column properties.vat_status'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'is_admin')
  then v_missing := v_missing || 'function public.is_admin'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'has_company_access')
  then v_missing := v_missing || 'function public.has_company_access'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'trash_eligible_tables')
  then v_missing := v_missing || 'function public.trash_eligible_tables'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'migration 0083 preconditions not met, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;
  raise notice '0083 preconditions ok';
end $$;

-- ===========================================================================
-- 1. property_companies: the direct property<->company junction
-- ===========================================================================
-- No business-line dimension: a property may belong to more than one company (Hinterstraße is
-- genuinely Infio AND Stäy), so this is a plain many-to-many, not a per-dimension unique pairing
-- the way property_assignment was. Soft-delete only, same audit rationale as property_assignment
-- (migration 0079): a past link explains how earlier receipts were booked, so removing the row
-- outright would erase that explanation.
create table if not exists public.property_companies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  company_id  uuid not null references public.companies(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text,
  unique (property_id, company_id)
);

create index if not exists property_companies_property_idx
  on public.property_companies (property_id) where deleted_at is null;
create index if not exists property_companies_company_idx
  on public.property_companies (company_id) where deleted_at is null;

comment on table public.property_companies is
  'Direct property <-> company assignment, replacing the business-line model (migration 0083). A '
  'property may belong to more than one company (the client''s dual-ownership cases); the UI '
  'requires at least one before a property''s form can be saved, enforced client-side, same as '
  'property_assignment''s min-one convention was meant to be. Admin-writable from /objekte; '
  'soft-delete only -- a past link explains how earlier receipts were booked.';

alter table public.property_companies enable row level security;

drop policy if exists "property_companies_select" on public.property_companies;
create policy "property_companies_select" on public.property_companies
  for select to authenticated using (public.has_company_access(company_id));

drop policy if exists "property_companies_admin_insert" on public.property_companies;
create policy "property_companies_admin_insert" on public.property_companies
  for insert to authenticated with check (public.is_admin());

drop policy if exists "property_companies_admin_update" on public.property_companies;
create policy "property_companies_admin_update" on public.property_companies
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy on purpose, mirroring property_assignment (migration 0079).

-- ===========================================================================
-- 2. VAT-deductibility default: re-key from business_line.vat_treatment to properties.vat_status
-- ===========================================================================
-- Same signature (uuid -> numeric) as before, so every call site below keeps compiling; only the
-- argument passed at each call site changes (business_line_id -> property_id), done in step 4/6.
-- Dropped explicitly first: CREATE OR REPLACE FUNCTION cannot rename an input parameter
-- (p_business_line -> p_property) even though the type list is unchanged (SQLSTATE 42P13).
drop function if exists public.resolve_default_vat_deductible_pct(uuid);

create function public.resolve_default_vat_deductible_pct(p_property uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select case p.vat_status
           when 'steuerpflichtig' then 100
           when 'steuerfrei'      then 0
           else null -- 'gemischt', or an unresolved property: genuinely ambiguous, needs a decision
         end
    from public.properties p
   where p.id = p_property;
$$;

comment on function public.resolve_default_vat_deductible_pct(uuid) is
  'Default deductibility from the PROPERTY''s own vat_status (migration 0083; previously keyed on '
  'business_line.vat_treatment): steuerpflichtig -> 100%, steuerfrei -> 0%, gemischt or an '
  'unresolved property -> NULL (ambiguous, needs a rule or human decision). Only ever applied when '
  'nothing more specific already decided otherwise.';

-- ---------------------------------------------------------------------------
-- Trigger: keep the default in sync with the invoice's PROPERTY instead of its business line
-- ---------------------------------------------------------------------------
drop trigger if exists trg_invoices_vat_deductible_default on public.invoices;

create or replace function public.trg_fn_invoices_vat_deductible_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.vat_deductibility_source, 'ai') = 'ai' then
    new.vat_deductible_pct := public.resolve_default_vat_deductible_pct(new.property_id);
    new.vat_deductibility_source := case when new.vat_deductible_pct is null then null else 'ai' end;
  end if;
  return new;
end $$;

create trigger trg_invoices_vat_deductible_default
  before insert or update of property_id on public.invoices
  for each row execute function public.trg_fn_invoices_vat_deductible_default();

comment on trigger trg_invoices_vat_deductible_default on public.invoices is
  'Re-defaults vat_deductible_pct from the (new) property''s vat_status whenever property_id is set '
  'or changes, but only when the current source is NULL/ai -- a rule or human decision is never '
  'touched. Re-keyed from business_line_id by migration 0083.';

-- ===========================================================================
-- 3. assignment_rules: drop business_line_id as a scope dimension
-- ===========================================================================
-- The generated `specificity` column's stored expression references business_line_id, so it (and
-- its dependent index) has to go before the column itself can be dropped; both are rebuilt after.
alter table public.assignment_rules drop column if exists specificity;

drop function if exists public.assignment_rule_specificity(text, uuid, uuid, uuid, uuid);

create or replace function public.assignment_rule_specificity(
  p_reference_pattern text,
  p_supplier_id       uuid,
  p_property_id       uuid,
  p_company_id        uuid
)
returns int
language sql
immutable
as $$
  select
    32 * (
        (case when p_reference_pattern is not null then 1 else 0 end)
      + (case when p_supplier_id       is not null then 1 else 0 end)
      + (case when p_property_id       is not null then 1 else 0 end)
      + (case when p_company_id        is not null then 1 else 0 end)
    )
    + (case when p_reference_pattern is not null then 16 else 0 end)
    + (case when p_supplier_id       is not null then  8 else 0 end)
    + (case when p_property_id       is not null then  2 else 0 end)
    + (case when p_company_id        is not null then  1 else 0 end);
$$;

comment on function public.assignment_rule_specificity(text, uuid, uuid, uuid) is
  'Rule priority: dimension count first (x32), then reference_pattern(16) > supplier(8) > '
  'property(2) > company(1) as the tie-break. business_line_id dropped as a dimension (0083); the '
  'weights are otherwise unchanged from migration 0025/0038 so existing relative ordering holds.';

-- Dropping business_line_id auto-drops assignment_rules_scope_not_empty (references it) and
-- assignment_rules_scope_unique (indexes it) -- both are recreated below without that dimension.
alter table public.assignment_rules drop column if exists business_line_id;

alter table public.assignment_rules add column specificity int generated always as (
  public.assignment_rule_specificity(reference_pattern, supplier_id, property_id, company_id)
) stored;

create index if not exists idx_assignment_rules_resolve
  on public.assignment_rules (target, specificity desc)
  where is_active and deleted_at is null;

alter table public.assignment_rules add constraint assignment_rules_scope_not_empty check (
  supplier_id is not null
  or property_id is not null
  or company_id is not null
  or reference_pattern is not null
);

create unique index if not exists assignment_rules_scope_unique
  on public.assignment_rules (
    target, supplier_id, property_id, company_id, lower(btrim(reference_pattern))
  ) nulls not distinct
  where deleted_at is null;

create or replace function public.resolve_assignment_rule(p_invoice uuid, p_target text)
returns uuid
language sql
stable
set search_path = public
as $$
  select r.id
    from public.assignment_rules r
    join public.invoices i on i.id = p_invoice
   where r.is_active
     and r.deleted_at is null
     and r.target = p_target
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
     and (
       r.reference_pattern is null
       or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   order by r.specificity desc, r.created_at desc
   limit 1;
$$;

comment on function public.resolve_assignment_rule(uuid, text) is
  'The winning rule for one receipt and one target, most specific first. business_line_id dropped '
  'as a dimension (0083).';

create or replace function public.resolve_assignment_rule_candidates(p_invoice uuid, p_target text)
returns table (rule_id uuid, specificity int, is_winner boolean)
language sql
stable
set search_path = public
as $$
  select r.id, r.specificity,
         row_number() over (order by r.specificity desc, r.created_at desc) = 1
    from public.assignment_rules r
    join public.invoices i on i.id = p_invoice
   where r.is_active
     and r.deleted_at is null
     and r.target = p_target
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
     and (
       r.reference_pattern is null
       or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   order by r.specificity desc, r.created_at desc;
$$;

comment on function public.resolve_assignment_rule_candidates(uuid, text) is
  'Every rule matching one receipt + target, most specific first, is_winner flagging the same row '
  'resolve_assignment_rule would return alone. business_line_id dropped as a dimension (0083).';

create or replace function public.apply_assignment_rules(p_invoice uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv                 public.invoices;
  v_rule                 public.assignment_rules;
  v_changed              jsonb := '[]'::jsonb;
  v_skipped               jsonb := '[]'::jsonb;
  v_log_lines             text[] := array[]::text[];
  v_new_amount            numeric;
  v_new_net               numeric;
  v_new_cat_name          text;
  v_cat_changed           boolean;
  v_new_deductible_pct    numeric;
  v_new_deductible_source text;
  v_new_special_case      text;
  v_had_prior_vat         boolean;
  v_old_no_vat            boolean;
  v_new_no_vat            boolean;
  v_conflict              boolean;
begin
  select * into v_inv from public.invoices where id = p_invoice and deleted_at is null;
  if not found then
    raise exception 'invoice % not found or deleted', p_invoice;
  end if;

  -- Cost category (+ structured category_id).
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'cost_category');
  if found then
    if coalesce(v_inv.cost_category_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'cost_category', 'reason', 'human', 'rule_id', v_rule.id);
    else
      if v_rule.category_id is not null then
        select name_de into v_new_cat_name from public.bwa_categories where id = v_rule.category_id;
        v_cat_changed := v_inv.category_id is distinct from v_rule.category_id;
      else
        v_new_cat_name := v_rule.cost_category;
        v_cat_changed := coalesce(v_inv.cost_category, '') <> coalesce(v_rule.cost_category, '');
      end if;

      if v_cat_changed then
        update public.invoices
           set category_id = v_rule.category_id,
               cost_category = coalesce(v_new_cat_name, v_rule.cost_category),
               cost_category_source = 'rule',
               updated_at = now()
         where id = p_invoice;
        v_changed := v_changed || jsonb_build_object(
          'field', 'cost_category', 'from', v_inv.cost_category,
          'to', coalesce(v_new_cat_name, v_rule.cost_category), 'rule_id', v_rule.id);
        v_log_lines := v_log_lines || format('Kostenkategorie: %s -> %s (Regel)',
          coalesce(v_inv.cost_category, 'ohne'), coalesce(v_new_cat_name, v_rule.cost_category));
      end if;
    end if;
  end if;

  -- VAT rate + treatment + deductibility. Deductibility default now comes from the invoice's
  -- PROPERTY (properties.vat_status via resolve_default_vat_deductible_pct), not business_line
  -- (migration 0083).
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    else
      v_new_deductible_pct := coalesce(
        v_rule.vat_deductible_pct, public.resolve_default_vat_deductible_pct(v_inv.property_id)
      );
      v_new_deductible_source := case
        when v_rule.vat_deductible_pct is not null then 'rule'
        when v_new_deductible_pct is not null then 'ai'
        else null
      end;
      v_new_special_case := v_rule.vat_special_case;

      if coalesce(v_inv.vat_rate, -1) <> coalesce(v_rule.vat_rate, -1)
         or coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '')
         or coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1)
         or coalesce(v_inv.vat_special_case, '') <> coalesce(v_new_special_case, '')
      then
        v_had_prior_vat := v_inv.vat_rate is not null or v_inv.vat_treatment is not null;
        v_old_no_vat := coalesce(v_inv.vat_rate, 0) = 0 or v_inv.vat_treatment = 'kleinunternehmer';
        v_new_no_vat := coalesce(v_rule.vat_rate, 0) = 0 or v_rule.vat_treatment = 'kleinunternehmer';
        v_conflict := v_had_prior_vat and (v_old_no_vat is distinct from v_new_no_vat);

        if v_inv.amount_gross is not null and v_rule.vat_rate is not null then
          v_new_amount := round(v_inv.amount_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), 2);
          v_new_net    := v_inv.amount_gross - v_new_amount;
        else
          v_new_net    := v_inv.amount_net;
          v_new_amount := case when v_rule.vat_rate is null then null
                               else round(coalesce(v_inv.amount_net, 0) * v_rule.vat_rate / 100, 2) end;
        end if;

        update public.invoices
           set vat_rate = v_rule.vat_rate,
               vat_amount = v_new_amount,
               amount_net = v_new_net,
               vat_treatment = v_rule.vat_treatment,
               vat_source = 'rule',
               vat_deductible_pct = v_new_deductible_pct,
               vat_deductibility_source = v_new_deductible_source,
               vat_special_case = v_new_special_case,
               vat_conflict_at = case when v_conflict then now() else v_inv.vat_conflict_at end,
               vat_conflict_note = case when v_conflict then format(
                 'USt-Status geändert: %s -> %s (Regel %s)',
                 case when v_old_no_vat then 'keine USt' else 'USt-pflichtig' end,
                 case when v_new_no_vat then 'keine USt' else 'USt-pflichtig' end,
                 v_rule.id
               ) else v_inv.vat_conflict_note end,
               updated_at = now()
         where id = p_invoice;

        v_changed := v_changed || jsonb_build_object(
          'field', 'vat_rate', 'from', v_inv.vat_rate, 'to', v_rule.vat_rate, 'rule_id', v_rule.id)
          || jsonb_build_object(
          'field', 'vat_amount', 'from', v_inv.vat_amount, 'to', v_new_amount, 'rule_id', v_rule.id);
        if coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '') then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_treatment', 'from', v_inv.vat_treatment, 'to', v_rule.vat_treatment,
            'rule_id', v_rule.id);
        end if;
        if coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1) then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_deductible_pct', 'from', v_inv.vat_deductible_pct,
            'to', v_new_deductible_pct, 'rule_id', v_rule.id);
        end if;
        if coalesce(v_inv.vat_special_case, '') <> coalesce(v_new_special_case, '') then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_special_case', 'from', v_inv.vat_special_case,
            'to', v_new_special_case, 'rule_id', v_rule.id);
        end if;
        if v_conflict then
          v_changed := v_changed || jsonb_build_object(
            'field', 'vat_conflict', 'from', v_old_no_vat, 'to', v_new_no_vat, 'rule_id', v_rule.id);
        end if;

        v_log_lines := v_log_lines || format(
          'USt-Satz: %s -> %s (Regel, USt-Betrag angepasst: %s -> %s%s)',
          coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text,
          coalesce(v_inv.vat_amount::text, 'ohne'), coalesce(v_new_amount::text, 'ohne'),
          case when v_rule.vat_treatment is not null
               then ', Behandlung: ' || v_rule.vat_treatment else '' end);
        if coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1) then
          v_log_lines := v_log_lines || format('Abzugsfähigkeit: %s%% -> %s%% (Regel)',
            coalesce(v_inv.vat_deductible_pct::text, 'unbestimmt'),
            coalesce(v_new_deductible_pct::text, 'unbestimmt'));
        end if;
        if v_conflict then
          v_log_lines := v_log_lines || format(
            'Achtung, USt-Status-Wechsel: %s -> %s',
            case when v_old_no_vat then 'keine USt' else 'USt-pflichtig' end,
            case when v_new_no_vat then 'keine USt' else 'USt-pflichtig' end);
        end if;
      end if;
    end if;
  end if;

  if array_length(v_log_lines, 1) > 0 then
    insert into public.invoice_history (invoice_id, type, text, data, actor)
    values (
      p_invoice,
      'regel',
      array_to_string(v_log_lines, ' · '),
      jsonb_build_object('changed', v_changed, 'skipped', v_skipped),
      p_actor
    );
  end if;

  return jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
end $$;

comment on function public.apply_assignment_rules(uuid, text) is
  'Applies the winning cost-category and VAT rules to one receipt, never overwriting a human-set '
  'value, flags a liability-status flip, and logs what changed. Deductibility default now comes '
  'from the property''s vat_status, not business_line (migration 0083).';

create or replace function public.assignment_rule_preview(p_rule uuid)
returns table (matches bigint, would_change bigint)
language plpgsql
stable
set search_path = public
as $$
declare
  r public.assignment_rules;
begin
  select * into r from public.assignment_rules where id = p_rule;
  if not found then
    return query select 0::bigint, 0::bigint;
    return;
  end if;

  return query
  with cand as (
    select i.id, i.category_id, i.cost_category, i.cost_category_source,
           i.vat_rate, i.vat_treatment, i.vat_source,
           i.vat_deductible_pct, i.vat_special_case, i.property_id
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
       and (r.property_id      is null or r.property_id      = i.property_id)
       and (r.company_id       is null or r.company_id       = i.company_id)
       and (
         r.reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      where public.resolve_assignment_rule(c.id, r.target) = r.id
        and case r.target
              when 'cost_category' then
                coalesce(c.cost_category_source, 'ai') <> 'human'
                and (
                  (r.category_id is not null and c.category_id is distinct from r.category_id)
                  or (r.category_id is null and coalesce(c.cost_category, '') <> coalesce(r.cost_category, ''))
                )
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (
                  coalesce(c.vat_rate, -1) <> coalesce(r.vat_rate, -1)
                  or coalesce(c.vat_treatment, '') <> coalesce(r.vat_treatment, '')
                  or coalesce(c.vat_deductible_pct, -1) <> coalesce(
                       coalesce(r.vat_deductible_pct, public.resolve_default_vat_deductible_pct(c.property_id)), -1
                     )
                  or coalesce(c.vat_special_case, '') <> coalesce(r.vat_special_case, '')
                )
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview(uuid) is
  'Retroactive impact of one rule. business_line_id dropped as a dimension; deductibility default '
  'now comes from the property''s vat_status (migration 0083).';

-- Adding/removing parameters extends the signature, which Postgres registers as a SECOND overload
-- rather than replacing -- dropped explicitly first (same idiom this repo uses every time this
-- function's signature has changed, e.g. migrations 0028/0029/0038/0044).
drop function if exists public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text, uuid, numeric, text
);

create or replace function public.assignment_rule_preview_scope(
  p_target              text,
  p_cost_category       text    default null,
  p_vat_rate            numeric default null,
  p_supplier_id         uuid    default null,
  p_property_id         uuid    default null,
  p_company_id          uuid    default null,
  p_reference_pattern   text    default null,
  p_exclude_rule        uuid    default null,
  p_vat_treatment       text    default null,
  p_category_id         uuid    default null,
  p_vat_deductible_pct  numeric default null,
  p_vat_special_case    text    default null
)
returns table (matches bigint, would_change bigint)
language plpgsql
stable
set search_path = public
as $$
declare
  v_spec int := public.assignment_rule_specificity(
    p_reference_pattern, p_supplier_id, p_property_id, p_company_id
  );
begin
  return query
  with cand as (
    select
      i.category_id, i.cost_category, i.cost_category_source, i.vat_rate, i.vat_treatment,
      i.vat_source, i.vat_deductible_pct, i.vat_special_case, i.property_id,
      (
        select max(r.specificity)
          from public.assignment_rules r
         where r.is_active
           and r.deleted_at is null
           and r.target = p_target
           and (p_exclude_rule is null or r.id <> p_exclude_rule)
           and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
           and (r.property_id      is null or r.property_id      = i.property_id)
           and (r.company_id       is null or r.company_id       = i.company_id)
           and (
             r.reference_pattern is null
             or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
           )
      ) as best
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and (p_supplier_id      is null or p_supplier_id      = i.supplier_id)
       and (p_property_id      is null or p_property_id      = i.property_id)
       and (p_company_id       is null or p_company_id        = i.company_id)
       and (
         p_reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(p_reference_pattern) || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      where (c.best is null or c.best <= v_spec)
        and case p_target
              when 'cost_category' then
                coalesce(c.cost_category_source, 'ai') <> 'human'
                and (
                  (p_category_id is not null and c.category_id is distinct from p_category_id)
                  or (p_category_id is null and coalesce(c.cost_category, '') <> coalesce(p_cost_category, ''))
                )
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (
                  coalesce(c.vat_rate, -1) <> coalesce(p_vat_rate, -1)
                  or coalesce(c.vat_treatment, '') <> coalesce(p_vat_treatment, '')
                  or coalesce(c.vat_deductible_pct, -1) <> coalesce(
                       coalesce(p_vat_deductible_pct, public.resolve_default_vat_deductible_pct(c.property_id)), -1
                     )
                  or coalesce(c.vat_special_case, '') <> coalesce(p_vat_special_case, '')
                )
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview_scope is
  'Retroactive impact of a prospective rule, before it is saved. business_line_id dropped as a '
  'dimension (0083).';

create or replace function public.apply_assignment_rule_bulk(p_rule uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          public.assignment_rules;
  v_id       uuid;
  v_res      jsonb;
  v_total    int := 0;
  v_changed  int := 0;
  v_skipped  int := 0;
  v_ids      uuid[] := array[]::uuid[];
begin
  select * into r from public.assignment_rules where id = p_rule and deleted_at is null;
  if not found then
    raise exception 'rule % not found or deleted', p_rule;
  end if;
  if not r.is_active then
    raise exception 'rule % is inactive; activate it before applying it retroactively', p_rule;
  end if;

  for v_id in
    select i.id
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
       and (r.property_id      is null or r.property_id      = i.property_id)
       and (r.company_id       is null or r.company_id       = i.company_id)
       and (
         r.reference_pattern is null
         or coalesce(i.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
       )
     order by i.created_at
  loop
    v_total := v_total + 1;
    v_res := public.apply_assignment_rules(v_id, p_actor);
    if jsonb_array_length(v_res->'changed') > 0 then
      v_changed := v_changed + 1;
      v_ids := v_ids || v_id;
    elsif jsonb_array_length(v_res->'skipped') > 0 then
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rule_id', p_rule, 'matches', v_total, 'changed', v_changed, 'skipped', v_skipped,
    'changed_ids', to_jsonb(v_ids)
  );
end $$;

comment on function public.apply_assignment_rule_bulk(uuid, text) is
  'Runs apply_assignment_rules across every receipt in one rule''s scope. business_line_id dropped '
  'as a dimension (0083).';

grant execute on function public.assignment_rule_specificity(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.resolve_assignment_rule(uuid, text) to authenticated;
grant execute on function public.resolve_assignment_rule_candidates(uuid, text) to authenticated;
grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;
grant execute on function public.apply_assignment_rule_bulk(uuid, text) to authenticated;
grant execute on function public.assignment_rule_preview(uuid) to authenticated;
grant execute on function public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, text, uuid, text, uuid, numeric, text
) to authenticated;
grant execute on function public.resolve_default_vat_deductible_pct(uuid) to authenticated;

-- ===========================================================================
-- 4. approval_rules: drop business_line_id as a scope dimension
-- ===========================================================================
alter table public.approval_rules drop column if exists specificity;

drop function if exists public.approval_rule_specificity(uuid, uuid, uuid, uuid);

create or replace function public.approval_rule_specificity(
  p_supplier_id uuid,
  p_property_id uuid,
  p_company_id  uuid
)
returns int
language sql
immutable
as $$
  select
    16 * (
        (case when p_supplier_id is not null then 1 else 0 end)
      + (case when p_property_id is not null then 1 else 0 end)
      + (case when p_company_id  is not null then 1 else 0 end)
    )
    + (case when p_supplier_id is not null then 8 else 0 end)
    + (case when p_property_id is not null then 2 else 0 end)
    + (case when p_company_id  is not null then 1 else 0 end);
$$;

comment on function public.approval_rule_specificity(uuid, uuid, uuid) is
  'Approval-rule priority: dimension count first (x16), then supplier(8) > property(2) > '
  'company(1). business_line_id dropped as a dimension (0083).';

-- Dropping business_line_id auto-drops approval_rules_scope_not_empty and
-- approval_rules_scope_unique -- both recreated below without that dimension.
alter table public.approval_rules drop column if exists business_line_id;

alter table public.approval_rules add column specificity int generated always as (
  public.approval_rule_specificity(supplier_id, property_id, company_id)
) stored;

create index if not exists idx_approval_rules_resolve
  on public.approval_rules (specificity desc)
  where is_active and deleted_at is null;

alter table public.approval_rules add constraint approval_rules_scope_not_empty check (
  supplier_id is not null
  or property_id is not null
  or company_id is not null
);

create unique index if not exists approval_rules_scope_unique
  on public.approval_rules (supplier_id, property_id, company_id, min_amount)
  nulls not distinct
  where deleted_at is null;

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
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
   order by r.specificity desc, r.min_amount desc, r.created_at desc
   limit 1;
$$;

comment on function public.resolve_approval_rule(uuid) is
  'The winning approval chain for one invoice. business_line_id dropped as a dimension (0083).';

grant execute on function public.approval_rule_specificity(uuid, uuid, uuid) to authenticated;
grant execute on function public.resolve_approval_rule(uuid) to authenticated;

-- ===========================================================================
-- 5. invoices: retire business_line_id/business_line_code, rename assignment_source vocabulary
-- ===========================================================================
-- assignment_source is owned by the external pipeline (migration 0027/0040): it records HOW the
-- company was resolved. Renaming its property_assignment(+name) literals to property_company(+name)
-- to match the new table -- flagged in docs/PIPELINE_STAEY.md as the pipeline-side contract change.
-- Existing rows (expected to be none -- property_assignment has 0 rows, so the pipeline has never
-- actually written these values) are renamed rather than assumed absent.
update public.invoices
   set assignment_source = replace(assignment_source, 'property_assignment', 'property_company')
 where assignment_source in ('property_assignment', 'property_assignment+name');

do $$
declare
  v_con text;
begin
  for v_con in
    select conname from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%assignment_source%'
  loop
    execute format('alter table public.invoices drop constraint %I', v_con);
    raise notice '0083 dropped old assignment_source constraint %', v_con;
  end loop;

  alter table public.invoices add constraint invoices_assignment_source_check
    check (assignment_source is null or assignment_source in (
      'property_company', 'property_company+name', 'name', 'unresolved'
    ));
end $$;

comment on column public.invoices.assignment_source is
  'HOW the ingestion pipeline resolved the company: property_company | property_company+name | '
  'name | unresolved. Owned by the pipeline; the Hub reads it and must not write it. Renamed from '
  'property_assignment(+name) by migration 0083 to match property_companies.';

-- The columns themselves are NOT dropped: v_invoices_list (live definition not version-controlled
-- in this repo, per migrations 0038/0040's own notes) is `select b.*` and so exposes every invoices
-- column, including business_line_id -- dropping it cascades into that view and the v_invoices_review
-- wrapper on top of it. Rebuilding v_invoices_list from a guess at its live definition risks silently
-- losing computed columns (issuer_sort, review_score, ...) this repo does not hold the source for.
-- Safer to leave two now-inert, never-written, never-read columns behind than to touch a view this
-- repo doesn't own the definition of. Only the FK to the now-dropped business_line table and the
-- now-useless index need to go.
do $$
declare
  v_con text;
begin
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.invoices'::regclass
     and confrelid = 'public.business_line'::regclass
     and contype = 'f';
  if v_con is not null then
    execute format('alter table public.invoices drop constraint %I', v_con);
    raise notice '0083 dropped FK % on invoices.business_line_id (business_line is being dropped; '
      'column kept as an inert, vestigial column -- see the comment above)', v_con;
  end if;
end $$;

drop index if exists public.invoices_business_line_idx;

comment on column public.invoices.business_line_id is
  'Vestigial as of migration 0083 (business-line model removed) -- no longer written or read by '
  'the Hub. Kept, not dropped, because v_invoices_list (select b.*, live definition not '
  'version-controlled here) exposes every invoices column and dropping this would cascade into it.';
comment on column public.invoices.business_line_code is
  'Vestigial as of migration 0083 -- see the comment on business_line_id.';

-- ===========================================================================
-- 6. Trash system: business_line is no longer trash-eligible
-- ===========================================================================
-- restore_record()/purge_record()/trash_purge_eligible_tables() all read trash_eligible_tables()
-- (migration 0062), so updating this one array is enough for all three.
create or replace function public.trash_eligible_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'invoices', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'bwa_categories', 'properties', 'companies'
  ];
$$;

create or replace view public.v_trash
with (security_invoker = true) as
  select 'invoices' as table_name, id, coalesce(issuer, invoice_number, id::text) as label,
         deleted_at, deleted_by, delete_reason
    from public.invoices where deleted_at is not null
  union all
  select 'suppliers', id, name, deleted_at, deleted_by, delete_reason
    from public.suppliers where deleted_at is not null
  union all
  select 'customers', id, name, deleted_at, deleted_by, delete_reason
    from public.customers where deleted_at is not null
  union all
  select 'outgoing_invoices', id, coalesce(voucher_number, id::text), deleted_at, deleted_by, delete_reason
    from public.outgoing_invoices where deleted_at is not null
  union all
  select 'manual_bookings', id, coalesce(note, id::text), deleted_at, deleted_by, delete_reason
    from public.manual_bookings where deleted_at is not null
  union all
  select 'approval_rules', id, coalesce(note, id::text), deleted_at, deleted_by, delete_reason
    from public.approval_rules where deleted_at is not null
  union all
  select 'assignment_rules', id, coalesce(note, id::text), deleted_at, deleted_by, delete_reason
    from public.assignment_rules where deleted_at is not null
  union all
  select 'ingest_exclusions', id, term, deleted_at, deleted_by, delete_reason
    from public.ingest_exclusions where deleted_at is not null
  union all
  select 'opos_whitelist_rules', id, term, deleted_at, deleted_by, delete_reason
    from public.opos_whitelist_rules where deleted_at is not null
  union all
  select 'bwa_categories', id, code, deleted_at, deleted_by, delete_reason
    from public.bwa_categories where deleted_at is not null
  union all
  select 'properties', id, coalesce(name, code), deleted_at, deleted_by, delete_reason
    from public.properties where deleted_at is not null
  union all
  select 'companies', id, name, deleted_at, deleted_by, delete_reason
    from public.companies where deleted_at is not null;

comment on view public.v_trash is
  'Unified read model for the Papierkorb screen: every soft-deleted row across the tables '
  'restore_record()/purge_record() know how to handle. business_line branch removed, table '
  'dropped (migration 0083).';

grant select on public.v_trash to authenticated;

-- ===========================================================================
-- 7. Drop property_assignment and business_line
-- ===========================================================================
-- Safe: every FK column referencing either table (invoices.business_line_id, assignment_rules.
-- business_line_id, approval_rules.business_line_id) was dropped above. property_assignment has 0
-- rows by design (migration 0077); business_line's 4 seed rows are no longer referenced anywhere.
drop table if exists public.property_assignment;
drop table if exists public.business_line;

-- ===========================================================================
-- 8. Self-checks
-- ===========================================================================

-- 8a. business_line/property_assignment are gone; assignment_rules/approval_rules no longer carry
-- business_line_id; invoices.business_line_id/code are intentionally KEPT (vestigial, see the
-- comment in section 5) but must no longer have a live FK to business_line.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'business_line')
  then raise exception '0083 self-check FAILED: business_line still exists'; end if;
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'property_assignment')
  then raise exception '0083 self-check FAILED: property_assignment still exists'; end if;
  -- Named by pattern, not confrelid: business_line is already dropped by the time this runs
  -- (section 7), so 'public.business_line'::regclass would itself raise "does not exist".
  if exists (select 1 from pg_constraint
              where conrelid = 'public.invoices'::regclass and contype = 'f'
                and conname ilike '%business_line%')
  then raise exception '0083 self-check FAILED: invoices still has a FK named like business_line';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'assignment_rules'
                and column_name = 'business_line_id')
  then raise exception '0083 self-check FAILED: assignment_rules still has business_line_id'; end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'approval_rules'
                and column_name = 'business_line_id')
  then raise exception '0083 self-check FAILED: approval_rules still has business_line_id'; end if;
  raise notice '0083 self-check ok: business_line/property_assignment fully removed';
end $$;

-- 8b. Exactly one overload of each redefined-signature function (no ambiguous RPC dispatch).
do $$
declare
  v_n int;
begin
  select count(*) into v_n from pg_proc
   where proname = 'assignment_rule_preview_scope' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then
    raise exception '0083 self-check FAILED: expected exactly 1 assignment_rule_preview_scope, found %', v_n;
  end if;

  select count(*) into v_n from pg_proc
   where proname = 'assignment_rule_specificity' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then
    raise exception '0083 self-check FAILED: expected exactly 1 assignment_rule_specificity, found %', v_n;
  end if;

  select count(*) into v_n from pg_proc
   where proname = 'approval_rule_specificity' and pronamespace = 'public'::regnamespace;
  if v_n <> 1 then
    raise exception '0083 self-check FAILED: expected exactly 1 approval_rule_specificity, found %', v_n;
  end if;

  raise notice '0083 self-check ok: no stray function overloads';
end $$;

-- 8c. resolve_default_vat_deductible_pct matches steuerpflichtig/steuerfrei/gemischt for every
-- real property that has a vat_status set (read-only, no rollback needed).
do $$
declare
  v_pct numeric;
  v_row record;
  v_n   int := 0;
begin
  for v_row in select id, code, vat_status from public.properties where vat_status is not null loop
    v_n := v_n + 1;
    v_pct := public.resolve_default_vat_deductible_pct(v_row.id);
    if v_row.vat_status = 'steuerpflichtig' and v_pct is distinct from 100 then
      raise exception '0083 self-check FAILED: steuerpflichtig property % did not default to '
        '100%%, got %', v_row.code, v_pct;
    elsif v_row.vat_status = 'steuerfrei' and v_pct is distinct from 0 then
      raise exception '0083 self-check FAILED: steuerfrei property % did not default to 0%%, '
        'got %', v_row.code, v_pct;
    elsif v_row.vat_status = 'gemischt' and v_pct is not null then
      raise exception '0083 self-check FAILED: gemischt property % should default to NULL '
        '(ambiguous), got %', v_row.code, v_pct;
    end if;
  end loop;
  raise notice '0083 self-check ok: property-driven default deductibility correct for % '
    'propert(y/ies) with a vat_status', v_n;
end $$;

-- 8d. property_companies is queryable and its RLS/soft-delete columns are in place.
do $$
begin
  perform 1 from public.property_companies limit 1;
  if not exists (select 1 from pg_class
                  where oid = 'public.property_companies'::regclass and relrowsecurity)
  then raise exception '0083 self-check FAILED: property_companies RLS is not enabled'; end if;
  raise notice '0083 self-check ok: property_companies exists, is queryable, RLS enabled';
end $$;

-- 8e. assignment_source accepts the renamed vocabulary and rejects the old one, probed on a real
-- invoice if one exists, rolled back.
do $$
declare
  v_id uuid;
  v_v  text;
begin
  select id into v_id from public.invoices limit 1;
  if v_id is null then
    raise notice '0083 self-check skipped: no invoices to probe assignment_source against';
  else
    foreach v_v in array array['property_company', 'property_company+name', 'name', 'unresolved'] loop
      begin
        update public.invoices set assignment_source = v_v where id = v_id;
      exception when check_violation then
        raise exception '0083 self-check FAILED: assignment_source rejects %, which the pipeline '
          'writes', v_v;
      end;
    end loop;

    begin
      update public.invoices set assignment_source = 'property_assignment' where id = v_id;
      raise exception '0083 self-check FAILED: assignment_source still accepts the old '
        '''property_assignment'' value';
    exception when check_violation then
      null; -- expected
    end;

    raise notice '0083 self-check ok: assignment_source vocabulary renamed correctly';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0083 self-check rollback';
exception when restrict_violation then
  null; -- unwinds the probe updates, keeps the schema changes above
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Manual pre-flight (run BEFORE applying this migration against the live DB):
--
--   select count(*) from invoices        where business_line_id is not null;
--   select count(*) from assignment_rules where business_line_id is not null;
--   select count(*) from approval_rules   where business_line_id is not null;
--
-- All three are expected to be 0 (no invoices/rules exist yet per the 2026-08-05 work log). If
-- any is non-zero, decide what happens to those rows' business-line-derived data BEFORE running
-- this migration -- it is dropped, not migrated forward.
-- ---------------------------------------------------------------------------
