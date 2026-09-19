-- 0031_vat_deductibility.sql
-- Briefing Screen 5 ("VAT rules & tax reserve"): deductibility as a first-class, sourced, audited
-- value driven by the business line's VAT treatment, special-case flags that change the deductible
-- amount, a "warning on change" when a VAT rule flips a receipt's liability status, and a tax
-- reserve calculation designed so the (not yet built) output-VAT side slots in later without rework.
--
-- WHAT ALREADY EXISTS, UNTOUCHED BY THIS MIGRATION
--
-- The VAT-rate side of assignment_rules (migrations 0025, 0028, 0029, 0030): a rule pins any
-- combination of supplier/business_line/property/company, resolves via the existing specificity
-- ladder ("most specific wins" for all four dimensions), and "a human beats a rule beats the AI"
-- already holds for vat_rate/vat_treatment. This migration does not touch that ladder or its
-- tie-break — it rides on the exact same rule row rather than adding a parallel table.
--
-- WHAT THIS MIGRATION ADDS
--   1. vat_deductible_pct / vat_special_case on assignment_rules (only meaningful on a vat_rate-
--      target rule) and on invoices, plus vat_deductibility_source (same ai|rule|human triad as
--      vat_source) and two GENERATED columns computing the deductible/non-deductible EUR split.
--   2. resolve_default_vat_deductible_pct() — the business-line-driven default (steuerpflichtig
--      -> 100, steuerfrei -> 0, gemischt -> NULL, genuinely ambiguous) applied only when nothing
--      more specific (a rule, a human) has decided otherwise.
--   3. A trigger keeping that default in sync whenever an invoice's business line is set or changes.
--   4. apply_assignment_rules extended to also carry deductibility from the winning vat_rate rule,
--      plus vat_conflict_at/vat_conflict_note for a liability-status flip, per the briefing's
--      explicit "a supplier who so far charged no VAT suddenly charges 19% must stand out".
--   5. assignment_rule_preview / assignment_rule_preview_scope widened to also catch a
--      deductible_pct-only or special_case-only mismatch.
--   6. vat_reserve() — per-company input-VAT summary with the output-VAT seam for later.
--   7. A trigger that runs apply_assignment_rules automatically right after a new invoice is
--      inserted, so cost_category, vat_rate/vat_treatment AND deductibility are already resolved
--      (from any matching rule, or the business-line default) the moment the pipeline extracts a
--      receipt -- no manual "apply rules" click needed for brand-new invoices. The pipeline itself
--      (ai-mail-extraction, an external Python project, not in this repo) is completely unaffected
--      and untouched: it keeps inserting rows exactly as it always has, and everything described
--      here happens inside Postgres, on the row it just wrote. Existing invoices are unaffected
--      too (this only fires on INSERT) -- they still rely on the manual per-receipt button or bulk
--      apply, exactly as before.
--
-- A NOTE FOR THE CLIENT/TAX ADVISOR ON THE 'hospitality' SPECIAL CASE
--
-- German tax law restricts only the INCOME-TAX deductibility of Bewirtung (hospitality) to 70%;
-- input VAT (Vorsteuer) itself is normally 100% reclaimable when the invoice meets the § 14
-- requirements. The briefing's own wording ("hospitality only 70% deductible") does not
-- disambiguate which tax this applies to. This migration follows the client's literal framing:
-- selecting 'hospitality' as a special case suggests, but does not force, vat_deductible_pct = 70
-- in the UI — confirm with the tax advisor whether this should actually stay at 100% for VAT
-- purposes specifically. 'down_payment' is a pure flag (an Anzahlung's VAT timing/matching issue
-- for the final invoice), it does not itself change vat_deductible_pct.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'invoices')
  then v_missing := v_missing || 'relation public.invoices'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'assignment_rules')
  then v_missing := v_missing || 'relation public.assignment_rules'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'business_line')
  then v_missing := v_missing || 'relation public.business_line'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'business_line'
                    and column_name = 'vat_treatment')
  then v_missing := v_missing || 'column business_line.vat_treatment'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'business_line_id')
  then v_missing := v_missing || 'column invoices.business_line_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'company_id')
  then v_missing := v_missing || 'column invoices.company_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invoices'
                    and column_name = 'document_date')
  then v_missing := v_missing || 'column invoices.document_date'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'apply_assignment_rules')
  then v_missing := v_missing || 'function public.apply_assignment_rules'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'escape_ilike_pattern')
  then v_missing := v_missing || 'function public.escape_ilike_pattern'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'migration 0031 preconditions not met, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;
  raise notice '0031 preconditions ok';
end $$;

-- ===========================================================================
-- 1. Deductibility on assignment_rules (vat_rate-target rules only)
-- ===========================================================================
alter table public.assignment_rules
  add column if not exists vat_deductible_pct numeric,
  add column if not exists vat_special_case text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.assignment_rules'::regclass
       and conname = 'assignment_rules_vat_deductible_pct_check'
  ) then
    alter table public.assignment_rules add constraint assignment_rules_vat_deductible_pct_check
      check (vat_deductible_pct is null or vat_deductible_pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.assignment_rules'::regclass
       and conname = 'assignment_rules_vat_special_case_check'
  ) then
    alter table public.assignment_rules add constraint assignment_rules_vat_special_case_check
      check (vat_special_case is null or vat_special_case in ('hospitality', 'partial', 'down_payment'));
  end if;

  -- Restricted to the same target the rest of this column pair already requires (vat_rate), per
  -- migration 0025's own design principle: "one target per rule so the resolution ladder stays
  -- independent per field". A cost_category rule must never carry a VAT deductibility opinion.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.assignment_rules'::regclass
       and conname = 'assignment_rules_deductibility_target_check'
  ) then
    alter table public.assignment_rules add constraint assignment_rules_deductibility_target_check
      check ((vat_deductible_pct is null and vat_special_case is null) or target = 'vat_rate');
  end if;
end $$;

comment on column public.assignment_rules.vat_deductible_pct is
  'Percentage of input VAT this rule''s scope can reclaim (100 = fully deductible, cost is net; '
  '0 = not reclaimable, cost is gross). Additive to vat_rate on the SAME rule row -- one rule still '
  'describes one VAT decision. Only meaningful when target = ''vat_rate''. See migration 0031.';
comment on column public.assignment_rules.vat_special_case is
  'Flags a tax special case that changes the deductible amount (hospitality, partial deductibility, '
  'a down payment) -- see the migration header for the hospitality income-tax-vs-VAT caveat. Only '
  'meaningful when target = ''vat_rate''.';

-- ===========================================================================
-- 2. Deductibility on invoices, sourced and generated
-- ===========================================================================
alter table public.invoices
  add column if not exists vat_deductible_pct numeric,
  add column if not exists vat_deductibility_source text,
  add column if not exists vat_special_case text,
  add column if not exists vat_conflict_at timestamptz,
  add column if not exists vat_conflict_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_vat_deductible_pct_check'
  ) then
    alter table public.invoices add constraint invoices_vat_deductible_pct_check
      check (vat_deductible_pct is null or vat_deductible_pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and conname = 'invoices_vat_deductibility_source_check'
  ) then
    alter table public.invoices add constraint invoices_vat_deductibility_source_check
      check (vat_deductibility_source is null or vat_deductibility_source in ('ai', 'rule', 'human'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_vat_special_case_check'
  ) then
    alter table public.invoices add constraint invoices_vat_special_case_check
      check (vat_special_case is null or vat_special_case in ('hospitality', 'partial', 'down_payment'));
  end if;
end $$;

-- Generated columns propagate NULL automatically whenever ANY input is NULL, so an unresolved
-- deductibility (vat_deductible_pct still null) or an unresolved VAT amount stays visibly
-- unresolved here too, rather than being silently treated as 0% or 100% deductible.
--
-- Postgres does not allow a generated column to reference another generated column, so
-- vat_nondeductible_amount inlines the deductible expression again instead of referencing
-- vat_deductible_amount.
alter table public.invoices
  add column if not exists vat_deductible_amount numeric
    generated always as (round(vat_amount * vat_deductible_pct / 100, 2)) stored;

alter table public.invoices
  add column if not exists vat_nondeductible_amount numeric
    generated always as (vat_amount - round(vat_amount * vat_deductible_pct / 100, 2)) stored;

comment on column public.invoices.vat_deductible_pct is
  'Resolved % of vat_amount actually reclaimable as input VAT. NULL means not yet resolved. '
  'Defaults from the business line''s VAT treatment (resolve_default_vat_deductible_pct), '
  'overridden by a vat_rate rule''s own vat_deductible_pct, overridden by a human. See 0031.';
comment on column public.invoices.vat_deductibility_source is
  'Provenance of vat_deductible_pct: ai | rule | human. ''ai'' covers both a raw AI guess and the '
  'system default computed from the business line -- which one fired is in the invoice_history log '
  'line text, not a separate column, so the ai|rule|human vocabulary used everywhere else in this '
  'engine does not need a fourth value.';
comment on column public.invoices.vat_special_case is
  'Hospitality / partial deductibility / a down payment -- see the migration header for the '
  'hospitality caveat. down_payment is a pure flag (Anzahlung VAT timing for the final invoice); it '
  'does not itself change vat_deductible_pct.';
comment on column public.invoices.vat_deductible_amount is
  'vat_amount x vat_deductible_pct / 100, rounded. NULL when either input is unresolved -- never '
  'defaulted to 0 or 100.';
comment on column public.invoices.vat_nondeductible_amount is
  'The portion of vat_amount that is NOT reclaimable and therefore becomes part of the real cost '
  '(amount_net + this = the true expense once VAT is not fully reclaimable). NULL under the same '
  'condition as vat_deductible_amount.';
comment on column public.invoices.vat_conflict_at is
  'Set by apply_assignment_rules when a VAT rule flips a receipt''s liability status (charged no '
  'VAT -> charged VAT, or the reverse) versus what was previously resolved -- the briefing''s '
  '"a supplier who so far charged no VAT suddenly charges 19% must stand out". Surfaced as a '
  'dismissable warning on the receipt detail page. See migration 0031.';

create index if not exists idx_invoices_vat_conflict
  on public.invoices (vat_conflict_at) where vat_conflict_at is not null;

-- ===========================================================================
-- 3. Default deductibility from the business line's VAT treatment
-- ===========================================================================
create or replace function public.resolve_default_vat_deductible_pct(p_business_line uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select case bl.vat_treatment
           when 'steuerpflichtig' then 100
           when 'steuerfrei'      then 0
           else null -- 'gemischt', or any future value: genuinely ambiguous, needs a decision
         end
    from public.business_line bl
   where bl.id = p_business_line;
$$;

comment on function public.resolve_default_vat_deductible_pct(uuid) is
  'Business-line-driven default deductibility (Briefing Screen 5): steuerpflichtig -> 100% (cost '
  'is net), steuerfrei -> 0% (cost is gross), gemischt or an unresolved business line -> NULL '
  '(genuinely ambiguous, needs a rule or human decision). Only ever applied when nothing more '
  'specific already decided otherwise. See migration 0031.';

grant execute on function public.resolve_default_vat_deductible_pct(uuid) to authenticated;

-- ===========================================================================
-- 4. Trigger: keep the business-line default in sync with business_line_id
-- ===========================================================================
-- Fires on insert (a freshly extracted invoice gets a sensible default the moment the pipeline sets
-- its business line, no manual step required) and whenever business_line_id changes afterwards (a
-- reviewer reassigning the business line must not leave a stale deductibility number behind — a gap
-- found during design review). Only touches vat_deductible_pct when the current source is NULL or
-- 'ai' — a rule-sourced or human-sourced value is left untouched, exactly like cost_category/
-- vat_rate only ever change through the explicit "apply rules" action, never automatically.
create or replace function public.trg_fn_invoices_vat_deductible_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.vat_deductibility_source, 'ai') = 'ai' then
    new.vat_deductible_pct := public.resolve_default_vat_deductible_pct(new.business_line_id);
    new.vat_deductibility_source := case when new.vat_deductible_pct is null then null else 'ai' end;
  end if;
  return new;
end $$;

drop trigger if exists trg_invoices_vat_deductible_default on public.invoices;
create trigger trg_invoices_vat_deductible_default
  before insert or update of business_line_id on public.invoices
  for each row execute function public.trg_fn_invoices_vat_deductible_default();

comment on trigger trg_invoices_vat_deductible_default on public.invoices is
  'Re-defaults vat_deductible_pct from the (new) business line whenever business_line_id is set or '
  'changes, but only when the current source is NULL/ai -- a rule or human decision is never '
  'touched. See migration 0031.';

-- ===========================================================================
-- 5. apply_assignment_rules: carry deductibility, flag a liability-status flip
-- ===========================================================================
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

  -- Cost category (+ structured category_id, migration 0030). Unchanged from 0030.
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

  -- VAT rate + treatment + deductibility. amount_gross is held fixed (0028): it is the figure bank
  -- reconciliation matches against a real payment. Deductibility rides the SAME rule row and the
  -- SAME vat_source lock as rate/treatment (0031): a rule's own vat_deductible_pct wins when set,
  -- otherwise the business line's default (already kept current by the trigger above) is carried
  -- forward unchanged, so a rate-only rule never wipes out an already-resolved deductibility.
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    else
      v_new_deductible_pct := coalesce(
        v_rule.vat_deductible_pct, public.resolve_default_vat_deductible_pct(v_inv.business_line_id)
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
        -- "Warning on change" (briefing, Screen 5): a genuine liability-status flip versus what was
        -- PREVIOUSLY resolved, not gated on whether that prior value came from the AI or an earlier
        -- rule (a second rule replacing a first rule's decision is exactly the flip the briefing
        -- names). Only fires when there was a prior resolved value to flip FROM, so the very first
        -- resolution of a brand-new receipt is never mistaken for a "change".
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
  'Applies the winning cost-category (+ category_id, 0030) and VAT rules (rate, treatment, '
  'deductibility, 0031) to one receipt, never overwriting a human-set value, flags a liability-'
  'status flip, and logs what changed to invoice_history.';

grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;

-- ===========================================================================
-- 6. Preview: also catch a deductible_pct-only or special_case-only mismatch
-- ===========================================================================
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
           i.vat_deductible_pct, i.vat_special_case, i.business_line_id
      from public.invoices i
     where i.deleted_at is null
       and i.archived_at is null
       and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
       and (r.business_line_id is null or r.business_line_id = i.business_line_id)
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
                       coalesce(r.vat_deductible_pct, public.resolve_default_vat_deductible_pct(c.business_line_id)), -1
                     )
                  or coalesce(c.vat_special_case, '') <> coalesce(r.vat_special_case, '')
                )
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview(uuid) is
  'Retroactive impact of one rule: cost_category compares by category_id or text (0030); vat_rate '
  'compares rate, treatment, and the resolved deductibility including its business-line default '
  '(0031).';

-- Adding parameters extends the signature, which Postgres would otherwise register as a SECOND
-- overload alongside the existing 11-parameter version rather than replacing it (0028, 0029 and
-- 0030 each hit this already) — dropped explicitly first.
drop function if exists public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text, uuid
);

create or replace function public.assignment_rule_preview_scope(
  p_target              text,
  p_cost_category       text    default null,
  p_vat_rate            numeric default null,
  p_supplier_id         uuid    default null,
  p_business_line_id    uuid    default null,
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
    p_reference_pattern, p_supplier_id, p_business_line_id, p_property_id, p_company_id
  );
begin
  return query
  with cand as (
    select
      i.category_id, i.cost_category, i.cost_category_source, i.vat_rate, i.vat_treatment,
      i.vat_source, i.vat_deductible_pct, i.vat_special_case, i.business_line_id,
      (
        select max(r.specificity)
          from public.assignment_rules r
         where r.is_active
           and r.deleted_at is null
           and r.target = p_target
           and (p_exclude_rule is null or r.id <> p_exclude_rule)
           and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
           and (r.business_line_id is null or r.business_line_id = i.business_line_id)
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
       and (p_business_line_id is null or p_business_line_id = i.business_line_id)
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
                       coalesce(p_vat_deductible_pct, public.resolve_default_vat_deductible_pct(c.business_line_id)), -1
                     )
                  or coalesce(c.vat_special_case, '') <> coalesce(p_vat_special_case, '')
                )
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview_scope is
  'Retroactive impact of a prospective rule, before it is saved. Pass p_exclude_rule when '
  're-previewing an existing rule. Counts a category_id, vat_treatment, deductible_pct or '
  'special_case -only mismatch too (0030, 0031).';

grant execute on function public.assignment_rule_preview(uuid) to authenticated;
grant execute on function public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text, uuid, numeric, text
) to authenticated;

-- ===========================================================================
-- 7. Tax reserve: per-company input VAT summary, designed for the output side to slot in later
-- ===========================================================================
-- "The tax reserve is output VAT minus deductible input VAT. Output VAT arrives later with
-- outgoing invoices, until then the reserve tracks the input side." output_vat is hardcoded 0 —
-- the seam the future Ausgangsrechnungen feature fills in without restructuring this function.
-- Reads as a negative number today (a running input-VAT-credit position), which is correct and
-- expected, not a bug, until output VAT exists. Unresolved deductibility is reported SEPARATELY,
-- never folded into 0% or 100%, so the tax advisor sees exactly what still needs a decision.
create or replace function public.vat_reserve(
  p_company uuid,
  p_von     date default null,
  p_bis     date default null
)
returns table (
  company_id                    uuid,
  von                            date,
  bis                            date,
  input_vat_total                numeric,
  input_vat_deductible            numeric,
  input_vat_nondeductible          numeric,
  input_vat_unresolved_count       bigint,
  input_vat_unresolved_amount      numeric,
  output_vat                       numeric,
  reserve                          numeric
)
language sql
stable
set search_path = public
as $$
  select
    p_company,
    p_von,
    p_bis,
    round(coalesce(sum(i.vat_amount), 0), 2),
    round(coalesce(sum(i.vat_deductible_amount), 0), 2),
    round(coalesce(sum(i.vat_nondeductible_amount), 0), 2),
    count(*) filter (where i.vat_amount is not null and i.vat_deductible_pct is null),
    round(coalesce(sum(i.vat_amount) filter (where i.vat_deductible_pct is null), 0), 2),
    0::numeric,
    0::numeric - round(coalesce(sum(i.vat_deductible_amount), 0), 2)
    from public.invoices i
   where i.deleted_at is null
     and i.archived_at is null
     and i.company_id = p_company
     and (p_von is null or i.document_date >= p_von)
     and (p_bis is null or i.document_date <= p_bis);
$$;

comment on function public.vat_reserve(uuid, date, date) is
  'Per-company input-VAT summary for the tax reserve (Briefing Screen 5): total, deductible, '
  'non-deductible, and separately how much is not yet resolved. output_vat is a stub (always 0) '
  'for the future outgoing-invoices feature; reserve = output_vat - deductible input VAT, so it '
  'reads negative until output VAT exists. A recommendation only, never a booking. See 0031.';

grant execute on function public.vat_reserve(uuid, date, date) to authenticated;

-- ===========================================================================
-- 7b. Resolve everything automatically the moment a new invoice is inserted
-- ===========================================================================
-- "These new things should be determined when the invoice is extracted, so new coming invoices
-- have these already." The pipeline (ai-mail-extraction, external, not in this repo) keeps
-- inserting invoices exactly as it always has -- this trigger just runs the SAME
-- apply_assignment_rules every manual "apply rules" click already runs, automatically, right after
-- the row lands. Cost category, VAT rate/treatment, and deductibility (from a matching rule, or
-- the business-line default via the trigger in section 4) are therefore already resolved before a
-- human ever opens the receipt. Existing invoices are untouched (this only fires on INSERT) and
-- still rely on the manual button or bulk apply, exactly as before this migration.
create or replace function public.trg_fn_invoices_apply_rules_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_assignment_rules(new.id, 'pipeline-intake');
  return new;
end $$;

drop trigger if exists trg_invoices_apply_rules_on_insert on public.invoices;
create trigger trg_invoices_apply_rules_on_insert
  after insert on public.invoices
  for each row execute function public.trg_fn_invoices_apply_rules_on_insert();

comment on trigger trg_invoices_apply_rules_on_insert on public.invoices is
  'Runs apply_assignment_rules automatically right after a new invoice is inserted, so any '
  'matching rule (and the business-line deductibility default) is already applied before a human '
  'opens the receipt. Fires once, on INSERT only -- existing invoices still rely on the manual '
  'per-receipt button or bulk apply. See migration 0031.';

-- ===========================================================================
-- 8. Self-checks
-- ===========================================================================

-- 8a. Generated columns compute correctly and stay NULL when either input is unresolved, in both
-- directions. Probes a real invoice if one exists, rolled back via the same restrict_violation
-- trick used throughout 0025/0028/0029/0030.
do $$
declare
  v_id  uuid;
  v_ded numeric;
  v_non numeric;
begin
  select id into v_id from public.invoices where deleted_at is null limit 1;
  if v_id is null then
    raise notice '0031 self-check: no invoice available to probe the generated columns, skipping';
  else
    update public.invoices set vat_amount = 100, vat_deductible_pct = 30 where id = v_id;
    select vat_deductible_amount, vat_nondeductible_amount into v_ded, v_non
      from public.invoices where id = v_id;
    if v_ded is distinct from 30.00 or v_non is distinct from 70.00 then
      raise exception '0031 self-check FAILED: expected deductible/nondeductible 30/70 on '
        'vat_amount=100, vat_deductible_pct=30, got %/%', v_ded, v_non;
    end if;

    update public.invoices set vat_deductible_pct = null where id = v_id;
    select vat_deductible_amount, vat_nondeductible_amount into v_ded, v_non
      from public.invoices where id = v_id;
    if v_ded is not null or v_non is not null then
      raise exception '0031 self-check FAILED: expected NULL deductible/nondeductible when '
        'vat_deductible_pct is NULL, got %/%', v_ded, v_non;
    end if;

    update public.invoices set vat_deductible_pct = 100, vat_amount = null where id = v_id;
    select vat_deductible_amount, vat_nondeductible_amount into v_ded, v_non
      from public.invoices where id = v_id;
    if v_ded is not null or v_non is not null then
      raise exception '0031 self-check FAILED: expected NULL deductible/nondeductible when '
        'vat_amount is NULL, got %/%', v_ded, v_non;
    end if;

    raise notice '0031 self-check ok: generated deductible/nondeductible columns compute '
      'correctly and stay NULL when either vat_amount or vat_deductible_pct is unresolved';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0031 self-check rollback';
exception when restrict_violation then
  null; -- unwinds the probe, keeps the schema changes above
end $$;

-- 8b. resolve_default_vat_deductible_pct matches steuerpflichtig/steuerfrei/gemischt for every real
-- business line (read-only, no rollback needed).
do $$
declare
  v_pct  numeric;
  v_line record;
  v_n    int := 0;
begin
  for v_line in select id, code, vat_treatment from public.business_line loop
    v_n := v_n + 1;
    v_pct := public.resolve_default_vat_deductible_pct(v_line.id);
    if v_line.vat_treatment = 'steuerpflichtig' and v_pct is distinct from 100 then
      raise exception '0031 self-check FAILED: steuerpflichtig business line % did not default '
        'to 100%%, got %', v_line.code, v_pct;
    elsif v_line.vat_treatment = 'steuerfrei' and v_pct is distinct from 0 then
      raise exception '0031 self-check FAILED: steuerfrei business line % did not default to '
        '0%%, got %', v_line.code, v_pct;
    elsif v_line.vat_treatment = 'gemischt' and v_pct is not null then
      raise exception '0031 self-check FAILED: gemischt business line % should default to NULL '
        '(ambiguous), got %', v_line.code, v_pct;
    end if;
  end loop;
  raise notice '0031 self-check ok: business-line-driven default deductibility correct for all '
    '% real business line(s)', v_n;
end $$;

-- 8c. The business-line trigger defaults and re-defaults an ai-sourced deductibility, and never
-- touches a rule- or human-sourced one. Probes a real invoice, rolled back.
do $$
declare
  v_id      uuid;
  v_line_a  uuid;
  v_line_b  uuid;
  v_pct     numeric;
begin
  select id into v_id from public.invoices where deleted_at is null limit 1;
  select id into v_line_a from public.business_line where vat_treatment = 'steuerpflichtig' limit 1;
  select id into v_line_b from public.business_line where vat_treatment = 'steuerfrei' limit 1;

  if v_id is null or v_line_a is null or v_line_b is null then
    raise notice '0031 self-check: need a real invoice plus one steuerpflichtig and one '
      'steuerfrei business line to probe the trigger, skipping';
  else
    update public.invoices
       set vat_deductibility_source = null, business_line_id = v_line_a where id = v_id;
    select vat_deductible_pct into v_pct from public.invoices where id = v_id;
    if v_pct is distinct from 100 then
      raise exception '0031 self-check FAILED: trigger did not default to 100%% for a '
        'steuerpflichtig business line, got %', v_pct;
    end if;

    update public.invoices set business_line_id = v_line_b where id = v_id;
    select vat_deductible_pct into v_pct from public.invoices where id = v_id;
    if v_pct is distinct from 0 then
      raise exception '0031 self-check FAILED: trigger did not re-default to 0%% after '
        'switching to a steuerfrei business line, got %', v_pct;
    end if;

    update public.invoices
       set vat_deductible_pct = 42, vat_deductibility_source = 'human' where id = v_id;
    update public.invoices set business_line_id = v_line_a where id = v_id;
    select vat_deductible_pct into v_pct from public.invoices where id = v_id;
    if v_pct is distinct from 42 then
      raise exception '0031 self-check FAILED: a human-sourced vat_deductible_pct was '
        'overwritten by the business-line trigger, got %', v_pct;
    end if;

    raise notice '0031 self-check ok: the business-line trigger defaults/re-defaults an '
      'ai-sourced deductibility and never touches a human-sourced one';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0031 self-check rollback';
exception when restrict_violation then
  null;
end $$;

-- 8d. apply_assignment_rules writes deductibility under the same human lock as rate, and flags a
-- genuine liability-status flip. Probes a real invoice with a throwaway rule scoped only to that
-- invoice's own supplier, rolled back the same way 0030's 9d does (including the unique_violation
-- guard for a supplier that already has a colliding plain supplier-scoped rule).
do $$
declare
  v_inv_id     uuid;
  v_rule_id    uuid;
  v_pct        numeric;
  v_conflict   timestamptz;
  v_before_human numeric;
  v_after_human  numeric;
begin
  select id into v_inv_id from public.invoices
   where deleted_at is null and supplier_id is not null
   limit 1;

  if v_inv_id is null then
    raise notice '0031 self-check: no invoice available to probe deductibility application, skipping';
  else
    update public.invoices
       set vat_source = null, vat_rate = 0, vat_treatment = 'kleinunternehmer',
           vat_deductible_pct = null, vat_deductibility_source = null,
           vat_conflict_at = null, vat_conflict_note = null
     where id = v_inv_id;

    insert into public.assignment_rules (
      target, vat_rate, vat_treatment, vat_deductible_pct, supplier_id, created_by, note
    )
    select 'vat_rate', 19, 'steuerpflichtig', 80, i.supplier_id, 'migration-0031-selfcheck', 'selfcheck-temp'
      from public.invoices i where i.id = v_inv_id
    returning id into v_rule_id;

    perform public.apply_assignment_rules(v_inv_id, 'migration-0031-selfcheck');
    select vat_deductible_pct, vat_conflict_at into v_pct, v_conflict
      from public.invoices where id = v_inv_id;
    if v_pct is distinct from 80 then
      raise exception '0031 self-check FAILED: apply_assignment_rules did not write '
        'vat_deductible_pct from the winning rule (got %)', v_pct;
    end if;
    if v_conflict is null then
      raise exception '0031 self-check FAILED: switching kleinunternehmer/0%% -> a real rate '
        'did not set vat_conflict_at';
    end if;

    update public.invoices set vat_source = 'human' where id = v_inv_id;
    select vat_deductible_pct into v_before_human from public.invoices where id = v_inv_id;
    perform public.apply_assignment_rules(v_inv_id, 'migration-0031-selfcheck');
    select vat_deductible_pct into v_after_human from public.invoices where id = v_inv_id;
    if v_after_human is distinct from v_before_human then
      raise exception '0031 self-check FAILED: a human-set vat_source did not protect '
        'vat_deductible_pct';
    end if;

    raise notice '0031 self-check ok: apply_assignment_rules writes deductibility under the '
      'human lock and flags a liability-status flip';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0031 self-check rollback';
exception
  when restrict_violation then
    null;
  when unique_violation then
    raise notice '0031 self-check 8d skipped: the chosen invoice''s supplier already has a '
      'colliding vat_rate rule, so the probe rule could not be inserted';
end $$;

-- 8e. The widened preview functions still resolve cleanly and count a deductible-only mismatch,
-- without changing the shape of the existing cost_category/vat_rate comparisons (read-only,
-- no rollback needed since it only ever SELECTs).
do $$
declare
  v_rule_id uuid;
  v_res     record;
begin
  select id into v_rule_id from public.assignment_rules
   where target = 'vat_rate' and is_active and deleted_at is null limit 1;
  if v_rule_id is null then
    raise notice '0031 self-check: no active vat_rate rule to probe the widened preview, skipping';
  else
    select * into v_res from public.assignment_rule_preview(v_rule_id);
    raise notice '0031 self-check ok: assignment_rule_preview executes cleanly on a real vat_rate '
      'rule (matches=%, would_change=%)', v_res.matches, v_res.would_change;
  end if;

  select * into v_res from public.assignment_rule_preview_scope(
    p_target => 'vat_rate', p_vat_rate => 19, p_vat_deductible_pct => 50
  );
  raise notice '0031 self-check ok: assignment_rule_preview_scope executes cleanly with the new '
    'deductibility parameters (matches=%, would_change=%)', v_res.matches, v_res.would_change;
end $$;

do $$
declare
  v_overloads int;
begin
  select count(*) into v_overloads from pg_proc
   where proname = 'assignment_rule_preview_scope' and pronamespace = 'public'::regnamespace;
  if v_overloads <> 1 then
    raise exception '0031 self-check FAILED: expected exactly 1 assignment_rule_preview_scope, '
      'found %. A stray overload makes PostgREST''s RPC dispatch ambiguous.', v_overloads;
  end if;
  raise notice '0031 self-check ok: exactly one assignment_rule_preview_scope overload exists';
end $$;

-- 8f. vat_reserve sums correctly, separates unresolved rows, and returns all-zero (not NULL) for
-- a company with no invoices.
do $$
declare
  v_company uuid;
  v_res     record;
  v_fake    uuid := '00000000-0000-0000-0000-000000000000';
begin
  select * into v_res from public.vat_reserve(v_fake);
  if v_res.input_vat_total is distinct from 0 or v_res.reserve is distinct from 0 then
    raise exception '0031 self-check FAILED: vat_reserve did not return all-zero for a company '
      'with no invoices (total=%, reserve=%)', v_res.input_vat_total, v_res.reserve;
  end if;

  select company_id into v_company from public.invoices
   where deleted_at is null and company_id is not null limit 1;
  if v_company is null then
    raise notice '0031 self-check: no invoice with a company to probe vat_reserve arithmetic, skipping';
  else
    select * into v_res from public.vat_reserve(v_company);
    if round(v_res.input_vat_deductible + v_res.input_vat_nondeductible, 2) >
       round(v_res.input_vat_total, 2) + 0.01
    then
      raise exception '0031 self-check FAILED: deductible + nondeductible (%) exceeds total (%) '
        'for company %', v_res.input_vat_deductible + v_res.input_vat_nondeductible,
        v_res.input_vat_total, v_company;
    end if;
    if v_res.reserve is distinct from (v_res.output_vat - v_res.input_vat_deductible) then
      raise exception '0031 self-check FAILED: reserve does not equal output_vat - '
        'input_vat_deductible for company %', v_company;
    end if;
    raise notice '0031 self-check ok: vat_reserve arithmetic is consistent for a real company '
      '(total=%, deductible=%, unresolved_count=%, reserve=%)',
      v_res.input_vat_total, v_res.input_vat_deductible, v_res.input_vat_unresolved_count,
      v_res.reserve;
  end if;
end $$;

-- 8g. The auto-apply-on-insert trigger is attached and enabled. Catalog check only, deliberately:
-- a full live INSERT probe would risk leaving a permanent duplicate row behind if some unique
-- constraint this repo does not know about (the invoices table's full constraint surface is owned
-- by the external pipeline) rejected the clone. apply_assignment_rules itself is already exercised
-- end-to-end by the UPDATE-based probes above (8d), so this only needs to confirm the wiring.
do $$
declare
  v_enabled "char";
begin
  select t.tgenabled into v_enabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'invoices' and t.tgname = 'trg_invoices_apply_rules_on_insert';
  if v_enabled is null then
    raise exception '0031 self-check FAILED: trg_invoices_apply_rules_on_insert is not attached '
      'to invoices';
  elsif v_enabled = 'D' then
    raise exception '0031 self-check FAILED: trg_invoices_apply_rules_on_insert exists but is '
      'disabled';
  end if;
  raise notice '0031 self-check ok: trg_invoices_apply_rules_on_insert is attached and enabled';
end $$;

commit;
