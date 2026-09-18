-- 0032_vat_conflict_tri_state_fix.sql
-- Fixes a bug found in code review of migration 0031 (already live at the time this was found, so
-- fixed forward as a new migration rather than editing 0031 in place — same convention 0028 used
-- to fix bugs found in 0025).
--
-- THE BUG
--
-- apply_assignment_rules' liability-flip conflict check built v_old_no_vat/v_new_no_vat as
-- `coalesce(rate, 0) = 0 or treatment = 'kleinunternehmer'`. A bare `treatment = 'kleinunternehmer'`
-- evaluates to SQL NULL (not false) whenever vat_treatment is NULL — which is the common case,
-- since treatment is optional. `false or null` is NULL, not false, in three-valued logic. So an
-- invoice with vat_rate=7, vat_treatment=NULL being moved by a rule to vat_rate=19,
-- vat_treatment='reverse_charge' computed v_old_no_vat = NULL and v_new_no_vat = false, and
-- `NULL IS DISTINCT FROM false` is TRUE — firing a false "USt-Status geändert" warning on an
-- ordinary rate change where the receipt was VAT-liable both before and after.
--
-- THE FIX
--
-- Coalesce the treatment comparison to '' before the OR, exactly like every other vat_treatment
-- comparison in this file already does (`coalesce(v_inv.vat_treatment, '') <> ...`). This is the
-- ONLY change from the 0031 version of this function.

begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'apply_assignment_rules'
  ) then
    raise exception 'migration 0032 expects apply_assignment_rules from migration 0031, which is missing';
  end if;
  raise notice '0032 preconditions ok';
end $$;

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

  -- Cost category (+ structured category_id, migration 0030). Unchanged from 0030/0031.
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
        --
        -- FIX (0032): coalesce the treatment comparison to '' before the OR. A bare
        -- `x.vat_treatment = 'kleinunternehmer'` evaluates to NULL (not false) whenever
        -- vat_treatment is NULL — the common case — which made `false or null` collapse to NULL
        -- instead of false and fire IS DISTINCT FROM against a definite boolean on the other side:
        -- a false liability-flip warning on an ordinary rate change whenever treatment is unset.
        v_had_prior_vat := v_inv.vat_rate is not null or v_inv.vat_treatment is not null;
        v_old_no_vat :=
          coalesce(v_inv.vat_rate, 0) = 0 or coalesce(v_inv.vat_treatment, '') = 'kleinunternehmer';
        v_new_no_vat :=
          coalesce(v_rule.vat_rate, 0) = 0 or coalesce(v_rule.vat_treatment, '') = 'kleinunternehmer';
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
  'status flip (fixed for a NULL-treatment tri-state bug in 0032), and logs to invoice_history.';

grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;

-- Self-check: the exact scenario the bug report described. Probes a real invoice, rolled back.
do $$
declare
  v_inv_id  uuid;
  v_rule_id uuid;
  v_conflict timestamptz;
begin
  select id into v_inv_id from public.invoices
   where deleted_at is null and supplier_id is not null
   limit 1;

  if v_inv_id is null then
    raise notice '0032 self-check: no invoice available to probe, skipping';
  else
    -- Both liable, just no treatment set beforehand and a different qualifier afterward — must
    -- NOT be flagged as a liability flip.
    update public.invoices
       set vat_source = null, vat_rate = 7, vat_treatment = null,
           vat_conflict_at = null, vat_conflict_note = null
     where id = v_inv_id;

    insert into public.assignment_rules (target, vat_rate, vat_treatment, supplier_id, created_by, note)
    select 'vat_rate', 19, 'reverse_charge', i.supplier_id, 'migration-0032-selfcheck', 'selfcheck-temp'
      from public.invoices i where i.id = v_inv_id
    returning id into v_rule_id;

    perform public.apply_assignment_rules(v_inv_id, 'migration-0032-selfcheck');
    select vat_conflict_at into v_conflict from public.invoices where id = v_inv_id;
    if v_conflict is not null then
      raise exception '0032 self-check FAILED: a NULL-treatment rate change (both VAT-liable) was '
        'wrongly flagged as a liability-status flip';
    end if;

    raise notice '0032 self-check ok: a rate/treatment change between two VAT-liable states, one '
      'with a NULL treatment, no longer raises a false liability-flip warning';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0032 self-check rollback';
exception
  when restrict_violation then
    null;
  when unique_violation then
    raise notice '0032 self-check skipped: the chosen invoice''s supplier already has a colliding '
      'vat_rate rule, so the probe rule could not be inserted';
end $$;

commit;
