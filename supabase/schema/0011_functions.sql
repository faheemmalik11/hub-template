-- The functions the screens call, and the helpers those call in turn.
--
-- Ported from the Hub this template came from, with every renamed table, column and stored value
-- carried across (see RENAMES.md). They sit in one file because most read across several tables,
-- and because a function is easier to find when they are all in one place.
--
-- Anything a person reads still comes from the locale file: these return values, never sentences.

begin;

-- These functions call each other, and they are written here in alphabetical order rather than in
-- dependency order, so a body would fail to validate against a function defined further down. The
-- bodies are checked when they run instead, which is what the screen walk exercises.
--
-- They come BEFORE the views for the same reason in reverse: a view that calls a function cannot be
-- created without it, while a function that reads a view can, as long as its body is not validated
-- yet. The two reference each other, so this is the only order that works.
set local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.acknowledge_datev_batch(p_batch_id uuid, p_actor text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'acknowledge_datev_batch: authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  select company_id into v_company
    from public.handover_batches
   where id = p_batch_id;

  if v_company is null then
    raise exception 'acknowledge_datev_batch: no batch %', p_batch_id;
  end if;

  if not public.has_company_access(v_company) then
    raise exception 'acknowledge_datev_batch: no access to this company'
      using errcode = 'insufficient_privilege';
  end if;

  update public.handover_batches
     set acknowledged_at = now(),
         acknowledged_by = nullif(btrim(coalesce(p_actor, '')), '')
   where id = p_batch_id
     and status = 'bounced'
     and acknowledged_at is null;
end;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_notification(p_event_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := public.current_app_user_id();
begin
  if v_user is null then
    raise exception 'acknowledge_notification: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;

  -- Scoped to the recipient in the WHERE clause rather than checked first: a security definer
  -- function that reads the row and then decides would let somebody else's id through a race.
  -- Already-acknowledged rows keep their original timestamp, so a double click does not rewrite
  -- when it was read.
  update public.notification_events
     set acknowledged_at = now()
   where id = p_event_id
     and recipient_user_id = v_user
     and acknowledged_at is null;
end $$;

CREATE OR REPLACE FUNCTION public.advance_workflow_on_datev_handover() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.handed_over_at is not null and old.handed_over_at is null
     and new.workflow_status = 'paid'
  then
    update public.documents
       set workflow_status = 'handed_over', updated_at = now()
     where id = new.id;

    insert into public.document_history (document_id, type, text, actor)
    values (new.id, 'handed_over', 'Workflow: handed over to the accountant', 'system');
  end if;
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.advance_workflow_on_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_text text;
  v_actor text;
begin
  if new.paid_at is not null and old.paid_at is null
     and new.workflow_status in (
       'received', 'in_review', 'query',
       'approved_first', 'approved_final'
     )
  then
    v_text := case new.paid_source
      when 'bank_match' then 'Workflow: paid, confirmed by the bank'
      when 'manual' then 'Workflow: Bezahlt (manuell markiert)'
      else 'Workflow: Bezahlt'
    end;

    -- nullif guards the empty-string case: a JWT with no email claim would otherwise be recorded
    -- as an actor of '', which reads as a blank line rather than as the system.
    v_actor := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');

    update public.documents
       set workflow_status = 'paid', updated_at = now()
     where id = new.id;

    insert into public.document_history (document_id, type, text, actor, data)
    values (
      new.id,
      'paid',
      v_text,
      v_actor,
      jsonb_build_object('nach', 'paid', 'paid_source', new.paid_source)
    );
  end if;
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.apply_assignment_rule_bulk(p_rule uuid, p_actor text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r          public.assignment_rules;
  v_row      record;
  v_res      jsonb;
  v_total    int := 0;
  v_changed  int := 0;
  v_skipped  int := 0;
  v_blocked  int := 0;
  v_ids      uuid[] := array[]::uuid[];
  -- Read once, not per row: it cannot change inside one statement, and has_company_access() is
  -- STABLE but not free.
  v_scoped   boolean := auth.uid() is not null;
begin
  select * into r from public.assignment_rules where id = p_rule and deleted_at is null;
  if not found then
    raise exception 'rule % not found or deleted', p_rule;
  end if;
  if not r.is_active then
    raise exception 'rule % is inactive; activate it before applying it retroactively', p_rule;
  end if;

  for v_row in
    select i.id as id,
           (not v_scoped or public.has_company_access(i.company_id)) as allowed
      from public.documents i
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
    -- Counted, then passed over. `matches` stays the number of receipts this caller could have
    -- seen, so it keeps agreeing with what assignment_rule_preview() showed them.
    if not v_row.allowed then
      v_blocked := v_blocked + 1;
      continue;
    end if;

    v_total := v_total + 1;
    v_res := public.apply_assignment_rules(v_row.id, p_actor);
    if jsonb_array_length(v_res->'changed') > 0 then
      v_changed := v_changed + 1;
      v_ids := v_ids || v_row.id;
    elsif jsonb_array_length(v_res->'skipped') > 0 then
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rule_id', p_rule, 'matches', v_total, 'changed', v_changed, 'skipped', v_skipped,
    'blocked_no_access', v_blocked,
    'changed_ids', to_jsonb(v_ids)
  );
end $$;

CREATE OR REPLACE FUNCTION public.apply_assignment_rules(p_invoice uuid, p_actor text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_inv                 public.documents;
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
  select * into v_inv from public.documents where id = p_invoice and deleted_at is null;
  if not found then
    raise exception 'invoice % not found or deleted', p_invoice;
  end if;

  -- Company scope. A caller with no session at all (the ingestion pipeline's service role, a
  -- trigger firing on insert) is not company restricted and must keep working, so the check is
  -- gated on there being a logged-in person to check.
  if auth.uid() is not null and not public.has_company_access(v_inv.company_id) then
    raise exception 'no access to the company of invoice %', p_invoice
      using errcode = '42501';
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
        select name into v_new_cat_name from public.categories where id = v_rule.category_id;
        v_cat_changed := v_inv.category_id is distinct from v_rule.category_id;
      else
        v_new_cat_name := v_rule.cost_category;
        v_cat_changed := coalesce(v_inv.cost_category, '') <> coalesce(v_rule.cost_category, '');
      end if;

      if v_cat_changed then
        update public.documents
           set category_id = v_rule.category_id,
               cost_category = coalesce(v_new_cat_name, v_rule.cost_category),
               cost_category_source = 'rule',
               updated_at = now()
         where id = p_invoice;
        v_changed := v_changed || jsonb_build_object(
          'field', 'cost_category', 'from', v_inv.cost_category,
          'to', coalesce(v_new_cat_name, v_rule.cost_category), 'rule_id', v_rule.id);
        v_log_lines := v_log_lines || format('Cost category: %s -> %s (rule)',
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
        v_old_no_vat := coalesce(v_inv.vat_rate, 0) = 0 or v_inv.vat_treatment = 'small_business';
        v_new_no_vat := coalesce(v_rule.vat_rate, 0) = 0 or v_rule.vat_treatment = 'small_business';
        v_conflict := v_had_prior_vat and (v_old_no_vat is distinct from v_new_no_vat);

        if v_inv.amount_gross is not null and v_rule.vat_rate is not null then
          v_new_amount := round(v_inv.amount_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), 2);
          v_new_net    := v_inv.amount_gross - v_new_amount;
        else
          v_new_net    := v_inv.amount_net;
          v_new_amount := case when v_rule.vat_rate is null then null
                               else round(coalesce(v_inv.amount_net, 0) * v_rule.vat_rate / 100, 2) end;
        end if;

        update public.documents
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
                 'VAT treatment changed: %s -> %s (rule %s)',
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
          'VAT rate: %s -> %s (rule, VAT amount adjusted: %s -> %s%s)',
          coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text,
          coalesce(v_inv.vat_amount::text, 'ohne'), coalesce(v_new_amount::text, 'ohne'),
          case when v_rule.vat_treatment is not null
               then ', Behandlung: ' || v_rule.vat_treatment else '' end);
        if coalesce(v_inv.vat_deductible_pct, -1) <> coalesce(v_new_deductible_pct, -1) then
          v_log_lines := v_log_lines || format('Deductibility: %s%% -> %s%% (rule)',
            coalesce(v_inv.vat_deductible_pct::text, 'unbestimmt'),
            coalesce(v_new_deductible_pct::text, 'unbestimmt'));
        end if;
        if v_conflict then
          v_log_lines := v_log_lines || format(
            'Careful, the VAT treatment changed: %s -> %s',
            case when v_old_no_vat then 'keine USt' else 'USt-pflichtig' end,
            case when v_new_no_vat then 'keine USt' else 'USt-pflichtig' end);
        end if;
      end if;
    end if;
  end if;

  if array_length(v_log_lines, 1) > 0 then
    insert into public.document_history (document_id, type, text, data, actor)
    values (
      p_invoice,
      'rule',
      array_to_string(v_log_lines, ' · '),
      jsonb_build_object('changed', v_changed, 'skipped', v_skipped),
      p_actor
    );
  end if;

  return jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
end $$;

CREATE OR REPLACE FUNCTION public.apply_opos_whitelist() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_rule_id  uuid;
  v_category text;
begin
  -- OUTGOING ONLY. The briefing's OPOS question is "what is debited in which company, but the receipt
  -- is missing?", the Hub's "Fehlende Belege" tab filters direction='ausgehend', and the matcher only
  -- looks at amount < 0. Incoming credits therefore never appear in the open-items list, so hiding them
  -- would achieve nothing and would touch rows the other OPOS side (receipts without a transaction)
  -- still needs — a credit is what PAYS one of our outgoing documents.
  --
  -- Tested on amount, NOT on direction: `direction` is GENERATED ALWAYS AS (case when amount < 0 then
  -- 'ausgehend' else 'eingehend' end), and a generated column is computed AFTER before-row triggers, so
  -- new.direction is still NULL here. Reading it would make this guard fire on every insert and the
  -- whitelist would silently never apply. `amount < 0` is the same test, one step earlier.
  if new.amount is null or new.amount >= 0 then
    return new;
  end if;

  -- Never re-decide a transaction that is reconciled with a receipt.
  if new.matching_status = 'matched' then
    return new;
  end if;

  -- Never overwrite or release a HUMAN decision (hidden with no rule behind it).
  if new.matching_status = 'ignored' and new.whitelist_rule_id is null then
    return new;
  end if;

  select m.rule_id, m.category
    into v_rule_id, v_category
    from public.match_opos_whitelist(new.payment_reference, new.counterparty_holder,
                                     new.counterparty_iban, new.booking_text) m;

  if v_rule_id is not null then
    new.matching_status   := 'ignored';
    new.no_receipt_reason := v_category;
    new.whitelist_rule_id := v_rule_id;
    new.no_receipt_set_by := coalesce(new.no_receipt_set_by, 'system');
    new.no_receipt_set_at := coalesce(new.no_receipt_set_at, now());
  elsif new.whitelist_rule_id is not null then
    -- It was hidden BY A RULE and no longer matches (rule deactivated, or the text changed) — release
    -- it back into the open-items list. A human's decision never lands here (guarded above).
    new.matching_status   := 'open';
    new.no_receipt_reason := null;
    new.whitelist_rule_id := null;
    new.no_receipt_set_by := null;
    new.no_receipt_set_at := null;
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.approval_rule_specificity(p_supplier_id uuid, p_property_id uuid, p_company_id uuid) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
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

CREATE OR REPLACE FUNCTION public.assignment_rule_preview(p_rule uuid) RETURNS TABLE(matches bigint, would_change bigint)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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
      from public.documents i
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

CREATE OR REPLACE FUNCTION public.assignment_rule_preview_scope(p_target text, p_cost_category text DEFAULT NULL::text, p_vat_rate numeric DEFAULT NULL::numeric, p_supplier_id uuid DEFAULT NULL::uuid, p_property_id uuid DEFAULT NULL::uuid, p_company_id uuid DEFAULT NULL::uuid, p_reference_pattern text DEFAULT NULL::text, p_exclude_rule uuid DEFAULT NULL::uuid, p_vat_treatment text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_vat_deductible_pct numeric DEFAULT NULL::numeric, p_vat_special_case text DEFAULT NULL::text) RETURNS TABLE(matches bigint, would_change bigint)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
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
      from public.documents i
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

CREATE OR REPLACE FUNCTION public.assignment_rule_specificity(p_reference_pattern text, p_supplier_id uuid, p_property_id uuid, p_company_id uuid) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
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

CREATE OR REPLACE FUNCTION public.bank_sync_log_facets() RETURNS TABLE(events text[], levels text[])
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    coalesce(array_agg(distinct event) filter (where event is not null), '{}'::text[]),
    coalesce(array_agg(distinct level) filter (where level is not null), '{}'::text[])
  from public.bank_sync_logs;
$$;

CREATE OR REPLACE FUNCTION public.capture_supplier_iban_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.iban is distinct from old.iban then
    insert into public.supplier_iban_history (supplier_id, iban, bic, bank_name, changed_by)
    values (old.id, old.iban, old.bic, old.bank_name, coalesce(auth.uid()::text, 'pipeline'));
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.cascade_company_code_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Aliases are keyed by the code string, so they move with it. Scoped to 'company' so a
  -- property or supplier alias that happens to share the string is never touched.
  update public.entity_aliases
     set entity_code = new.code
   where entity_type = 'company'
     and entity_code = old.code;

  -- documents.company_code is a denormalised copy. Only rows that genuinely belong to THIS company
  -- are rewritten: those already linked by id, plus unassigned rows that referenced the old code
  -- (the code moved to this company, so the reference moves with it). A row whose company_id points
  -- at a different company is deliberately left alone -- that is pre-existing inconsistent data and
  -- guessing at it here would be the very cross-company mixing this migration exists to prevent.
  update public.documents
     set company_code = new.code
   where company_code = old.code
     and (company_id = new.id or company_id is null);

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.cascade_property_code_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Scoped to 'property' so a company or supplier alias that happens to share the string is untouched.
  update public.entity_aliases
     set entity_code = new.code
   where entity_type = 'property'
     and entity_code = old.code;

  -- documents.property_code is a denormalised copy of the code, with no foreign key behind it. Unlike
  -- the company cascade there is no id column on documents to disambiguate with, so every row holding
  -- the old code follows the rename. That is the correct reading: the code moved to this property,
  -- so references to it move too, and leaving them behind would point at a property that no longer
  -- exists under that name.
  update public.documents
     set property_code = new.code
   where property_code = old.code;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.chain_people() RETURNS TABLE(id uuid, name text, role_name text, is_active boolean, escalation_days integer, deputy_user_id uuid, area text, covers_all_areas boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select u.id,
         u.name,
         r.name as role_name,
         u.is_active,
         u.escalation_days,
         u.deputy_user_id,
         u.area,
         u.covers_all_areas
    from public.app_users u
    left join public.roles r on r.id = u.role_id
   order by u.name nulls last;
$$;

CREATE OR REPLACE FUNCTION public.channel_secret_name(p_channel text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select 'channel_secret:' || p_channel;
$$;

CREATE OR REPLACE FUNCTION public.channel_secret_present(p_channel text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then
    return false;
  end if;
  return exists (
    select 1 from vault.secrets where name = public.channel_secret_name(p_channel)
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.check_match_allocation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tx_total  numeric;
  v_tx_other  numeric;
  v_inv_gross numeric;
  v_inv_other numeric;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = new.transaction_id;
  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.document_transaction_matches
   where transaction_id = new.transaction_id and status = 'confirmed' and id <> new.id;

  if v_tx_total is not null and v_tx_other + new.amount_matched > v_tx_total + 0.01 then
    -- Message text is English like the other raises in this schema (persisted audit text stays
    -- German). RAISE uses % as its placeholder, not %s -- that is format()'s syntax.
    raise exception
      'match allocation: transaction total %, already allocated %, requested % -- would over-allocate',
      v_tx_total, v_tx_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  select abs(amount_gross) into v_inv_gross
    from public.documents where id = new.document_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.document_transaction_matches
   where document_id = new.document_id and status = 'confirmed' and id <> new.id;

  if v_inv_gross is not null and v_inv_gross > 0
     and v_inv_other + new.amount_matched > v_inv_gross + 0.01 then
    raise exception
      'match allocation: invoice gross %, already allocated %, requested % -- would over-allocate',
      v_inv_gross, v_inv_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.check_outgoing_match_allocation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tx_total  numeric;
  v_tx_other  numeric;
  v_inv_gross numeric;
  v_inv_other numeric;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = new.transaction_id;
  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.outgoing_invoice_transaction_matches
   where transaction_id = new.transaction_id and status = 'confirmed' and id <> new.id;

  if v_tx_total is not null and v_tx_other + new.amount_matched > v_tx_total + 0.01 then
    raise exception
      'outgoing match allocation: transaction total %, already allocated %, requested % -- would over-allocate',
      v_tx_total, v_tx_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  select abs(amount_gross) into v_inv_gross
    from public.outgoing_invoices where id = new.outgoing_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = new.outgoing_invoice_id and status = 'confirmed' and id <> new.id;

  if v_inv_gross is not null and v_inv_gross > 0
     and v_inv_other + new.amount_matched > v_inv_gross + 0.01 then
    raise exception
      'outgoing match allocation: invoice gross %, already allocated %, requested % -- would over-allocate',
      v_inv_gross, v_inv_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.clear_must_change_password() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    raise exception 'clear_must_change_password: no authenticated email' using errcode = 'insufficient_privilege';
  end if;

  update public.app_users
     set must_change_password = false,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'clear_must_change_password: no app_users row for %', v_email;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.clear_transaction_fully_used(p_transaction_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = p_transaction_id;
  v_alloc := public.transaction_allocated_sum(p_transaction_id)
           + public.outgoing_transaction_allocated_sum(p_transaction_id);

  update public.bank_transactions
     set fully_used_at   = null,
         fully_used_by   = null,
         fully_used_note = null,
         -- Back to what the amounts say, so undoing the stamp reopens the remainder.
         matching_status = case
           when matching_status = 'ignored' then matching_status
           when coalesce(v_alloc, 0) > 0 and v_alloc >= coalesce(v_total, 0) - 0.01 then 'matched'
           else 'open'
         end
   where id = p_transaction_id;
end $$;

CREATE OR REPLACE FUNCTION public.compact_supplier_iban() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    new.iban := upper(regexp_replace(coalesce(new.iban, ''), '[[:space:].-]', '', 'g'));
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_write_permissions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Columns governed by another permission, or written by triggers on every update. Anything NOT
  -- in here counts as receipt content and requires invoices.book -- so a column added later is
  -- protected by default, and a column that is governed elsewhere has to be named here.
  v_ignore constant text[] := array[
    'workflow_status', 'approved_by',
    'paid_at', 'paid_source',
    'assigned_to', 'assigned_user_id',
    'handed_over_at',
    -- Deletion has no permission of its own today, and inventing one here would narrow who may
    -- delete without that being asked for. Left exactly as it was; worth a key of its own later.
    'deleted_at', 'deleted_by', 'delete_reason',
    'updated_at', 'fts', 'embedding'
  ];
begin
  -- No caller identity: service role, a cron job or the pipeline. They authorize themselves.
  if v_email = '' then
    return new;
  end if;

  if new.paid_at is not null and old.paid_at is null
     and not public.has_permission('invoices.pay') then
    raise exception 'not permitted: marking an invoice paid requires the payment permission'
      using errcode = '42501';
  end if;

  -- Both columns, so a stray write to the frozen one cannot route around the permission.
  if (new.assigned_user_id is distinct from old.assigned_user_id
      or new.assigned_to is distinct from old.assigned_to)
     and not public.has_permission('invoices.assign') then
    raise exception 'not permitted: assigning an invoice requires the assign permission'
      using errcode = '42501';
  end if;

  if new.workflow_status is distinct from old.workflow_status then
    if not public.has_permission('invoices.override_workflow') then
      case new.workflow_status
        when 'approved_final', 'closed' then
          if not public.has_permission('invoices.approve_final') then
            raise exception 'not permitted: this status requires the final-approval permission'
              using errcode = '42501';
          end if;
        when 'in_review', 'query', 'approved_first', 'rejected', 'not_relevant' then
          if not public.has_permission('invoices.approve') then
            raise exception 'not permitted: this status requires the approval permission'
              using errcode = '42501';
          end if;
        when 'paid' then
          if new.paid_at is null then
            raise exception 'not permitted: bezahlt is derived from paid_at, set that instead'
              using errcode = '42501';
          end if;
        when 'handed_over' then
          if new.handed_over_at is null then
            raise exception 'not permitted: uebergeben_datev is derived from handed_over_at'
              using errcode = '42501';
          end if;
        else
          raise exception 'not permitted: setting this status requires the override permission'
            using errcode = '42501';
      end case;
    end if;
  end if;

  if (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore)
     and not public.has_permission('invoices.book') then
    raise exception 'not permitted: editing a receipt requires the booking permission'
      using errcode = '42501';
  end if;

  return new;
end
$$;

CREATE OR REPLACE FUNCTION public.enforce_match_payment_permission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email          text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_was_confirmed  boolean := tg_op <> 'INSERT' and old.status = 'confirmed';
  v_is_confirmed   boolean := tg_op <> 'DELETE' and new.status = 'confirmed';
  v_amount_changed boolean := tg_op = 'UPDATE'
                              and old.status = 'confirmed'
                              and new.amount_matched is distinct from old.amount_matched;
  v_touches_payment boolean;
begin
  -- No caller identity: pipeline, cron or an Edge Function. See the header.
  if v_email = '' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_touches_payment := (v_was_confirmed is distinct from v_is_confirmed) or v_amount_changed;

  if v_touches_payment and not public.has_permission('invoices.pay') then
    raise exception
      'not permitted: a confirmed bank match settles the invoice, which requires the payment permission'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

CREATE OR REPLACE FUNCTION public.escape_ilike_pattern(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

CREATE OR REPLACE FUNCTION public.get_channel_secret(p_channel text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.notification_channels where key = p_channel) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = public.channel_secret_name(p_channel)
   limit 1;
  return v_secret;
end;
$$;

CREATE OR REPLACE FUNCTION public.guard_permission_grants() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_role text := public.current_role_name();
  v_target uuid := coalesce(new.user_id, old.user_id);
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  -- No JWT means a service-role or server-side caller: the seeds, the pipeline and
  -- src/lib/api/*.functions.ts, which do their own authorisation.
  if v_actor is null then
    return coalesce(new, old);
  end if;

  if v_actor = v_target and v_actor_role is distinct from 'super_admin' then
    raise exception 'You cannot change your own rights.'
      using errcode = 'check_violation';
  end if;

  if tg_op <> 'DELETE' and new.granted and v_actor_role is distinct from 'super_admin' then
    if not exists (select 1 from public.current_permissions() k where k = v_key) then
      raise exception 'You cannot grant a right you do not hold yourself: %', v_key
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end
$$;

CREATE OR REPLACE FUNCTION public.guard_role_permission_grants() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_role text := public.current_role_name();
  v_key text := coalesce(new.permission_key, old.permission_key);
begin
  if v_actor is null or v_actor_role = 'super_admin' then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.current_permissions() k where k = v_key) then
      raise exception 'You cannot grant a right you do not hold yourself: %', v_key
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end
$$;

CREATE OR REPLACE FUNCTION public.invoice_iban_checksum_ok(candidate text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  with cleaned as (
    select upper(regexp_replace(btrim(coalesce(candidate, '')), '\s', '', 'g')) as s
  ),
  rearranged as (
    select substr(s, 5) || substr(s, 1, 4) as r, s from cleaned
  ),
  expanded as (
    select string_agg(
      case when ch ~ '[0-9]' then ch else (ascii(ch) - 55)::text end, '' order by ord
    ) as digits
    from rearranged, regexp_split_to_table(r, '') with ordinality as t(ch, ord)
  )
  select case
    when (select s from cleaned) !~ '^[A-Z0-9]{15,34}$' then false
    when (select s from cleaned) !~ '^[A-Z]{2}[0-9]{2}' then false
    else (select digits from expanded)::numeric % 97 = 1
  end;
$_$;

CREATE OR REPLACE FUNCTION public.invoice_is_fully_covered(p_gross numeric, p_matched numeric) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  -- isFullyCovered() in format.ts: no gross amount means never judged covered, and an OVERPAYMENT
  -- counts as covered because more money than owed arrived, so nothing is open. Compared in
  -- numeric, which is exact decimal; the front end rounds to whole cents to reach the same answer
  -- in IEEE754.
  select case
           when abs(coalesce(p_gross, 0)) <= 0 then false
           else round(coalesce(p_matched, 0), 2)
                  >= round(abs(p_gross) - public.payment_tolerance(p_gross), 2)
         end;
$$;

CREATE OR REPLACE FUNCTION public.invoice_matched_sum(p_invoice uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.document_transaction_matches
   where document_id = p_invoice and status = 'confirmed';
$$;

CREATE OR REPLACE FUNCTION public.invoice_queue_kpis(p_today date DEFAULT CURRENT_DATE) RETURNS TABLE(key text, count bigint, amount numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
      with base as (select * from public.documents where true and deleted_at is null and archived_at is null and not_relevant_at is null)
      select 'all'::text, count(*), coalesce(sum(amount_gross), 0) from base
      union all
      select 'needs_action'::text, count(*), coalesce(sum(amount_gross), 0) from base where status = 'needs_review'
      union all
      select 'missing_assignment'::text, count(*), coalesce(sum(amount_gross), 0) from base where company_id is null
      union all
      select 'ready_for_payment'::text, count(*), coalesce(sum(amount_gross), 0) from base  where workflow_status in ('approved_first', 'approved_final')    and paid_at is null
      union all
      select 'pay_now'::text, count(*), coalesce(sum(amount_gross), 0) from base where due_date <= p_today and paid_at is null and not public.is_direct_debit(payment_method)
      union all
      select 'completed'::text, count(*), coalesce(sum(amount_gross), 0) from base where paid_at is not null or workflow_status = 'closed';
    $$;

CREATE OR REPLACE FUNCTION public.invoice_review_state(p_validation_detail jsonb, p_extracted jsonb, p_validation jsonb, p_issuer text, p_invoice_number text, p_document_date date, p_amount_gross numeric, p_amount_net numeric, p_vat_amount numeric, p_vat_rate numeric, p_recipient_name text, p_company_code text, p_supplier_iban text) RETURNS TABLE(problem_count integer, unchecked boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $_$
  with raw_detail as (
    select coalesce(
      case when jsonb_typeof(p_validation_detail) = 'object' and p_validation_detail <> '{}'::jsonb
        then p_validation_detail end,
      case when jsonb_typeof(p_extracted -> 'validation_detail') = 'object'
            and (p_extracted -> 'validation_detail') <> '{}'::jsonb
        then p_extracted -> 'validation_detail' end,
      '{}'::jsonb
    ) as d
  ),
  halves as (
    select
      case
        when d ? 'bookkeeping_edits' then
          case when jsonb_typeof(d -> 'bookkeeping_edits') = 'object'
                and (d -> 'bookkeeping_edits') <> '{}'::jsonb
            then d -> 'bookkeeping_edits' else '{}'::jsonb end
        else d
      end as basis,
      case
        when d ? 'bookkeeping_edits' and jsonb_typeof(d -> 'user_edits') = 'object'
          then coalesce(d -> 'user_edits', '{}'::jsonb)
        else '{}'::jsonb
      end as stored_user
    from raw_detail
  ),
  iban_input as (
    select coalesce(
      nullif(btrim(coalesce(p_supplier_iban, '')), ''),
      case when jsonb_typeof(p_extracted -> 'iban') = 'string' then p_extracted ->> 'iban' end
    ) as src
  ),
  iban_candidates as (
    select coalesce(array_agg(part) filter (where part <> ''), '{}'::text[]) as arr
    from iban_input,
      lateral (
        select btrim(piece) as part
        from regexp_split_to_table(coalesce(src, ''), '(?i)([;,/|]|\s{2,}|\y(?:und)\y)') as piece
      ) parts
    where src is not null
  ),
  numbers as (
    select
      coalesce(
        case
          when jsonb_typeof(p_extracted -> 'subtotal_gross') = 'number'
            then (p_extracted ->> 'subtotal_gross')::numeric
          when jsonb_typeof(p_extracted -> 'subtotal_gross') = 'string'
                and (p_extracted ->> 'subtotal_gross') ~ '^\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$'
            then btrim(p_extracted ->> 'subtotal_gross')::numeric
        end,
        p_amount_gross
      ) as subtotal
  ),
  active_rates as (
    select array_agg(rate) as rates
    from halves,
      lateral (
        select case
          when jsonb_typeof(elem) = 'number' then (elem #>> '{}')::numeric
          when jsonb_typeof(elem) = 'string' and (elem #>> '{}') ~ '^\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$'
            then btrim(elem #>> '{}')::numeric
        end as rate
        from jsonb_array_elements(
          case when jsonb_typeof(basis -> 'vat_rate_valid' -> 'values' -> 'active_rates') = 'array'
            then basis -> 'vat_rate_valid' -> 'values' -> 'active_rates'
            else '[]'::jsonb end
        ) as elem
      ) parsed
    where parsed.rate is not null
  ),
  recheck as (
    select jsonb_build_object(
      'iban_checksum_valid', case when cardinality(iban_candidates.arr) = 0 then 'not_applicable'
          when (select bool_and(public.invoice_iban_checksum_ok(c)) from unnest(iban_candidates.arr) c)
            then 'ok' else 'failed' end,
      'payable_iban_present', case when lower(btrim(coalesce(halves.basis -> 'payable_iban_present' ->> 'status', ''))) = 'not_applicable'
          then 'not_applicable'
          else case when cardinality(iban_candidates.arr) > 0 then 'ok' else 'failed' end end,
      'iban_unambiguous', case when lower(btrim(coalesce(halves.basis -> 'iban_unambiguous' ->> 'status', ''))) = 'not_applicable'
          then 'not_applicable'
          else case when cardinality(iban_candidates.arr) = 0 then 'not_applicable'
          when cardinality(iban_candidates.arr) <= 1 then 'ok' else 'failed' end end,
      'gross_present', case when p_amount_gross is not null then 'ok' else 'failed' end,
      'issuer_present', case when btrim(coalesce(p_issuer, '')) <> '' then 'ok' else 'failed' end,
      'date_present', case when p_document_date is not null then 'ok' else 'failed' end,
      'invoice_number_present', case when btrim(coalesce(p_invoice_number, '')) <> '' then 'ok' else 'failed' end,
      'sum_matches', case when numbers.subtotal is null or p_amount_net is null or p_vat_amount is null
          then 'not_applicable'
          when abs((p_amount_net::float8 + p_vat_amount::float8) - numbers.subtotal::float8) <= 0.02 then 'ok'
          else 'failed' end,
      'vat_rate_valid', case when p_vat_rate is null or active_rates.rates is null then 'not_applicable'
          when floor(p_vat_rate + 0.5) = any(active_rates.rates) then 'ok' else 'failed' end,
      'date_not_future', case when p_document_date is null then 'not_applicable'
          when p_document_date <= current_date then 'ok' else 'failed' end,
      'recipient_present', case when lower(btrim(coalesce(halves.basis -> 'recipient_present' ->> 'status', ''))) = 'not_applicable'
          then 'not_applicable'
          else case when btrim(coalesce(p_recipient_name, '')) <> '' then 'ok' else 'failed' end end,
      'assignment_resolved', case when btrim(coalesce(p_company_code, '')) <> '' then 'ok' else 'failed' end
    ) as m
    from halves, iban_candidates, numbers, active_rates
  ),
  final_detail as (
    select case
      when halves.basis <> '{}'::jsonb then coalesce(
        (
          select jsonb_object_agg(
            entry.check_key,
            case when recheck.m ? entry.check_key and jsonb_typeof(entry.check_value) = 'object'
              then jsonb_set(entry.check_value, '{status}', recheck.m -> entry.check_key)
              else entry.check_value end
          )
          from jsonb_each(halves.basis) as entry(check_key, check_value)
        ), '{}'::jsonb)
      else halves.stored_user
    end as detail
    from halves, recheck
  ),
  checks_tier as (
    select case
      when jsonb_typeof(p_extracted -> 'review_checks') = 'array'
            and jsonb_array_length(p_extracted -> 'review_checks') > 0
        then p_extracted -> 'review_checks' end as arr
  ),
  flat_tier as (
    select coalesce(
      case when jsonb_typeof(p_extracted -> 'validation') = 'object'
        then p_extracted -> 'validation' end,
      p_validation, '{}'::jsonb) as fv
  )
  select
    (case
      when final_detail.detail <> '{}'::jsonb then (
        select count(*)::int from jsonb_each(final_detail.detail) as entry(check_key, check_value)
        where entry.check_key in ('gross_present','issuer_present','sum_matches','vat_rate_valid','iban_checksum_valid','date_not_future','invoice_number_present','date_present','payable_iban_present','recipient_present','iban_unambiguous','relevance_ok','assignment_resolved')
          and btrim(lower(coalesce(entry.check_value ->> 'status', ''))) not in ('', 'ok', 'not_applicable', 'skipped')
      )
      when checks_tier.arr is not null then (
        select count(*)::int from jsonb_array_elements(checks_tier.arr) as review_check(value)
        where btrim(lower(coalesce(review_check.value ->> 'severity', ''))) <> 'informational'
          and coalesce(review_check.value ->> 'field', '') in ('extraction_confidence','relevance','document_readable','exclusion','assignment','safety_invariant_1','safety_invariant_2','safety_invariant_3','safety_invariant_4a','safety_invariant_4b','safety_invariant_5','forced_review')
          and btrim(lower(coalesce(review_check.value ->> 'status', ''))) not in ('', 'ok', 'not_applicable', 'skipped')
      )
      else (
        select count(*)::int from jsonb_each_text(flat_tier.fv) as gate(gate_name, gate_value)
        where gate.gate_name in ('datum_vorhanden')
          and gate.gate_value = 'false'
          and (gate.gate_name not in ('datum_vorhanden')
               or coalesce(flat_tier.fv ->> 'kleinbetrag', '') <> 'true')
      )
    end) as problem_count,
    (case
      when final_detail.detail <> '{}'::jsonb then
        not exists (
          select 1 from jsonb_each(final_detail.detail) as entry(check_key, check_value)
          where entry.check_key not in ('kleinbetrag','is_small_amount')
            and btrim(lower(coalesce(entry.check_value ->> 'status', ''))) not in ('', 'not_applicable', 'skipped')
        )
      when checks_tier.arr is not null then
        not exists (
          select 1 from jsonb_array_elements(checks_tier.arr) as review_check(value)
          where btrim(lower(coalesce(review_check.value ->> 'severity', ''))) <> 'informational'
            and btrim(lower(coalesce(review_check.value ->> 'status', ''))) not in ('', 'not_applicable', 'skipped')
        )
      else
        not exists (
          select 1 from jsonb_each_text(flat_tier.fv) as gate(gate_name, gate_value)
          where gate.gate_name in ('datum_vorhanden')
            and (gate.gate_value = 'true'
                 or (gate.gate_value = 'false'
                     and (gate.gate_name not in ('datum_vorhanden')
                          or coalesce(flat_tier.fv ->> 'kleinbetrag', '') <> 'true')))
        )
    end) as unchecked
  from final_detail, checks_tier, flat_tier;
$_$;

CREATE OR REPLACE FUNCTION public.invoices_facets() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'objekt_codes', coalesce(
      jsonb_agg(distinct property_code order by property_code)
        filter (where property_code is not null), '[]'::jsonb),
    'belegarten', coalesce(
      jsonb_agg(distinct document_type order by document_type)
        filter (where document_type is not null), '[]'::jsonb),
    'months', coalesce(
      jsonb_agg(distinct to_char(document_date, 'YYYY-MM')
                order by to_char(document_date, 'YYYY-MM') desc)
        filter (where document_date is not null), '[]'::jsonb),
    'years', coalesce(
      jsonb_agg(distinct to_char(document_date, 'YYYY')
                order by to_char(document_date, 'YYYY') desc)
        filter (where document_date is not null), '[]'::jsonb)
  )
  from public.documents
  where deleted_at is null;
$$;

CREATE OR REPLACE FUNCTION public.invoices_filtered_aggregate(p_company_code text DEFAULT NULL::text, p_property_code text DEFAULT NULL::text, p_cost_category text DEFAULT NULL::text, p_issuer_like text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_payment_state text DEFAULT NULL::text, p_amount_min numeric DEFAULT NULL::numeric, p_amount_max numeric DEFAULT NULL::numeric) RETURNS TABLE(total_count bigint, total_gross numeric, total_net numeric, total_vat numeric, all_paid_count bigint, all_paid_gross numeric, all_paid_net numeric, all_paid_vat numeric, all_open_count bigint, all_open_gross numeric, all_open_net numeric, all_open_vat numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with scope as (
    select amount_gross, amount_net, vat_amount, paid_at,
      (
        p_payment_state is null
        or (p_payment_state = 'paid'    and paid_at is not null)
        or (p_payment_state = 'open'    and paid_at is null)
        or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
        or p_payment_state not in ('paid', 'open', 'overdue')
      ) as matches_payment_filter
    from public.v_documents_review
    where archived_at is null
      and not_relevant_at is null
      and (
        p_company_code is null
        or company_code = p_company_code
        or (p_company_code = 'NZO' and company_code is null)
      )
      and (p_property_code is null or property_code = p_property_code)
      and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
      and (p_issuer_like   is null
           or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
      and (p_date_from     is null or document_date >= p_date_from)
      and (p_date_to       is null or document_date <= p_date_to)
      and (p_status        is null or status = p_status)
      and (p_amount_min    is null or amount_gross >= p_amount_min)
      and (p_amount_max    is null or amount_gross <= p_amount_max)
  )
  select
    count(*)                   filter (where matches_payment_filter),
    coalesce(sum(amount_gross) filter (where matches_payment_filter), 0),
    coalesce(sum(amount_net)   filter (where matches_payment_filter), 0),
    coalesce(sum(vat_amount)   filter (where matches_payment_filter), 0),
    count(*)                   filter (where paid_at is not null),
    coalesce(sum(amount_gross) filter (where paid_at is not null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is not null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is not null), 0),
    count(*)                   filter (where paid_at is null),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is null), 0)
  from scope;
$$;

CREATE OR REPLACE FUNCTION public.invoices_filtered_search(p_query_embedding public.vector DEFAULT NULL::public.vector, p_company_code text DEFAULT NULL::text, p_property_code text DEFAULT NULL::text, p_cost_category text DEFAULT NULL::text, p_issuer_like text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 15, p_payment_state text DEFAULT NULL::text, p_amount_min numeric DEFAULT NULL::numeric, p_amount_max numeric DEFAULT NULL::numeric) RETURNS TABLE(id uuid, invoice_number text, issuer text, document_date date, amount_gross numeric, company_code text, property_code text, cost_category text, service_description text, paid_at timestamp with time zone, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    id, invoice_number, issuer, document_date, amount_gross, company_code, property_code,
    cost_category, service_description, paid_at,
    case when p_query_embedding is not null then 1 - (embedding <=> p_query_embedding) end as similarity
  from public.v_documents_review
  where archived_at is null
    and not_relevant_at is null
    and (
      p_company_code is null
      or company_code = p_company_code
      or (p_company_code = 'NZO' and company_code is null)
    )
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
    and (p_issuer_like   is null
         or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (p_amount_min    is null or amount_gross >= p_amount_min)
    and (p_amount_max    is null or amount_gross <= p_amount_max)
    and (p_query_embedding is null or embedding is not null)
    and (
      p_payment_state is null
      or (p_payment_state = 'paid'    and paid_at is not null)
      or (p_payment_state = 'open'    and paid_at is null)
      or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
      or p_payment_state not in ('paid', 'open', 'overdue')
    )
  order by
    (case when p_query_embedding is not null then embedding <=> p_query_embedding end) asc nulls last,
    document_date desc nulls last
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.invoices_kpis(p_q text DEFAULT NULL::text, p_gesellschaft text DEFAULT NULL::text, p_objekt text DEFAULT NULL::text, p_belegart text DEFAULT NULL::text, p_zahlung text DEFAULT NULL::text, p_von date DEFAULT NULL::date, p_bis date DEFAULT NULL::date, p_datev text DEFAULT NULL::text, p_workflow text DEFAULT NULL::text, p_bank_match text DEFAULT NULL::text, p_ampel text DEFAULT NULL::text, p_archiv text DEFAULT NULL::text, p_ids uuid[] DEFAULT NULL::uuid[], p_faellig_von date DEFAULT NULL::date, p_faellig_bis date DEFAULT NULL::date, p_faellig_unbekannt boolean DEFAULT false, p_direct_debit boolean DEFAULT NULL::boolean) RETURNS TABLE(total bigint, erkannt bigint, zu_pruefen bigint, volumen numeric, offen numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    count(*),
    count(*) filter (where status = 'recognised'),
    count(*) filter (where status = 'needs_review'),
    coalesce(sum(amount_gross), 0),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0)
  from public.v_documents_review
  where (p_q is null or search_text like all (
      select '%' || replace(replace(replace(word, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from regexp_split_to_table(lower(p_q), '\s+') as word
      where word <> ''
    ))
    and (
      p_gesellschaft is null
      or company_code = p_gesellschaft
      -- NZO ("Nicht zugeordnet") is the catch-all for unassigned, and the pipeline
      -- expresses unassigned as NULL rather than by writing the code, so it has to
      -- match both. Same rule as migration 20260813190000 set for the search RPCs.
      or (p_gesellschaft = 'NZO' and company_code is null)
    )
    and (
      p_objekt is null
      or property_code = p_objekt
      -- The list sends this sentinel for "no property assigned". Properties have no
      -- catch-all code the way companies have NZO, so the filter is expressed as a
      -- value the column can never hold.
      or (p_objekt = '__ohne' and property_code is null)
    )
    and (p_belegart is null or document_type = p_belegart)
    and (
      p_zahlung is null
      or (p_zahlung = 'paid' and paid_at is not null)
      or (p_zahlung = 'open'   and paid_at is null)
    )
    and (
      p_datev is null
      or (p_datev = 'uebergeben' and handed_over_at is not null)
      or (p_datev = 'open'      and handed_over_at is null)
    )
    and (
      p_bank_match is null
      or (p_bank_match = 'vorschlag'  and has_suggested_bank_match and not has_confirmed_bank_match)
      or (p_bank_match = 'matched' and has_confirmed_bank_match)
      or (p_bank_match = 'open' and not has_suggested_bank_match and not has_confirmed_bank_match)
    )
    and (p_workflow is null or workflow_status = p_workflow)
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis)
    and (case when p_archiv = 'nur' then archived_at is not null else archived_at is null end)
    and (p_ids is null or id = any(p_ids))
    and (
      p_ampel is null
      or (p_ampel =  'auffaellig' and traffic_light in ('yellow', 'red'))
      or (p_ampel <> 'auffaellig' and traffic_light = p_ampel)
    )
    and (case when p_faellig_unbekannt then due_date is null else true end)
    and (p_faellig_von is null or due_date >= p_faellig_von)
    and (p_faellig_bis is null or due_date <= p_faellig_bis)
    and (p_direct_debit is null or public.is_direct_debit(payment_method) = p_direct_debit)
    and not_relevant_at is null;
$$;

CREATE OR REPLACE FUNCTION public.invoices_search_ids(p_where text DEFAULT NULL::text, p_archived boolean DEFAULT false) RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    SET statement_timeout TO '8s'
    AS $$
declare
  v_scope text := case when p_archived then 'is not null' else 'is null' end;
begin
  if p_where is not null and (p_where ~ ';' or p_where like '%--%' or p_where like '%/*%') then
    raise exception 'invalid where clause';
  end if;
  return query execute
    'select id from public.v_documents_review where archived_at ' || v_scope ||
    ' and not_relevant_at is null' ||
    case
      when p_where is not null and btrim(p_where) <> '' then ' and (' || p_where || ')'
      else ''
    end;
end;
$$;

CREATE OR REPLACE FUNCTION public.is_direct_debit(p_payment_method text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select p_payment_method is not null
     and (
       lower(p_payment_method) like '%lastschrift%'
       or lower(p_payment_method) like '%einzug%'
       or lower(p_payment_method) like '%abbuch%'
     );
$$;

CREATE OR REPLACE FUNCTION public.is_invoice_reconciled(p_invoice_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when v.soll <= 0 then false
    else v.matched >= v.soll - least(greatest(v.soll * 0.03, 0.01), 150)
  end
  from (
    select
      abs(coalesce(i.amount_gross, 0)) as soll,
      coalesce((
        select sum(abs(m.amount_matched))
          from public.document_transaction_matches m
         where m.document_id = i.id and m.status = 'confirmed'
      ), 0) as matched
    from public.documents i
    where i.id = p_invoice_id
  ) v;
$$;

CREATE OR REPLACE FUNCTION public.learn_assignment_rule_from_match(p_match uuid, p_actor text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_match   public.document_transaction_matches;
  v_inv     public.documents;
  v_txn     public.bank_transactions;
  v_pattern text;
  v_existing uuid;
  v_rule_id  uuid;
begin
  select * into v_match from public.document_transaction_matches where id = p_match;
  if not found then
    return null;
  end if;

  select * into v_inv from public.documents where id = v_match.document_id and deleted_at is null;
  if not found or v_inv.supplier_id is null then
    return null;
  end if;

  if coalesce(v_inv.cost_category_source, 'ai') not in ('rule', 'human') then
    return null;
  end if;
  if v_inv.category_id is null and coalesce(v_inv.cost_category, '') = '' then
    return null;
  end if;

  select * into v_txn from public.bank_transactions where id = v_match.transaction_id;
  if found and v_txn.transaction_type = 'lastschrift' and coalesce(v_txn.payment_reference, '') <> '' then
    v_pattern := v_txn.payment_reference;
  else
    v_pattern := null;
  end if;

  select id into v_existing
    from public.assignment_rules
   where target = 'cost_category'
     and deleted_at is null
     and supplier_id = v_inv.supplier_id
     and business_line_id is null and property_id is null and company_id is null
     and coalesce(lower(btrim(reference_pattern)), '') = coalesce(lower(btrim(v_pattern)), '');

  if v_existing is not null then
    update public.assignment_rules
       set cost_category = v_inv.cost_category,
           category_id = v_inv.category_id,
           is_active = true,
           note = 'Learned from a confirmed bank match (last updated from document '
                  || v_inv.id || ').',
           updated_at = now()
     where id = v_existing
    returning id into v_rule_id;
    return v_rule_id;
  end if;

  insert into public.assignment_rules (
    target, cost_category, category_id, supplier_id, reference_pattern, created_by, note
  ) values (
    'cost_category', v_inv.cost_category, v_inv.category_id, v_inv.supplier_id, v_pattern, p_actor,
    'Learned from a confirmed bank match (document ' || v_inv.id || ').'
  )
  returning id into v_rule_id;
  return v_rule_id;
end $$;

CREATE OR REPLACE FUNCTION public.link_invoice_transaction(p_invoice_id uuid, p_transaction_id uuid, p_score numeric DEFAULT NULL::numeric, p_reasons jsonb DEFAULT NULL::jsonb, p_amount numeric DEFAULT NULL::numeric, p_difference_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor      text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_now        timestamptz := now();
  v_match_id   uuid;
  v_withdrawn  int := 0;
  v_batch      int;
  v_released   boolean := false;
  v_tx_total   numeric;
  v_tx_other   numeric;
  v_tx_rest    numeric;
  v_inv_gross  numeric;
  v_inv_other  numeric;
  v_inv_rest   numeric;
  v_amount     numeric;
begin
  if p_invoice_id is null or p_transaction_id is null then
    raise exception 'link_invoice_transaction: invoice and transaction are both required';
  end if;

  if not exists (select 1 from public.documents where id = p_invoice_id and deleted_at is null) then
    raise exception 'link_invoice_transaction: invoice % not found', p_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.documents where id = p_invoice_id and deleted_at is null;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_invoice_transaction: invoice % has no gross amount to allocate against',
      p_invoice_id;
  end if;

  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.document_transaction_matches
   where transaction_id = p_transaction_id and status = 'confirmed' and document_id <> p_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.document_transaction_matches
   where document_id = p_invoice_id and status = 'confirmed' and transaction_id <> p_invoice_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  v_amount := coalesce(p_amount, least(v_tx_rest, v_inv_rest));

  if v_amount is null or v_amount <= 0 then
    raise exception
      'link_invoice_transaction: nothing left to allocate (transaction free %, invoice open %)',
      v_tx_rest, v_inv_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_tx_rest + 0.01 then
    raise exception 'link_invoice_transaction: amount % exceeds the transaction remainder %',
      v_amount, v_tx_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_inv_rest + 0.01 then
    raise exception 'link_invoice_transaction: amount % exceeds the invoice remainder %',
      v_amount, v_inv_rest using errcode = 'check_violation';
  end if;

  update public.bank_transactions
     set matching_status   = 'open',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignored';
  v_released := found;

  insert into public.document_transaction_matches
         (document_id, transaction_id, status, score, match_reasons, amount_matched,
          difference_reason, matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_invoice_id, p_transaction_id, 'confirmed', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          p_difference_reason, v_actor, v_actor, v_now, v_now)
  on conflict (document_id, transaction_id) do update
     set status            = 'confirmed',
         amount_matched    = excluded.amount_matched,
         score             = coalesce(excluded.score, public.document_transaction_matches.score),
         match_reasons     = coalesce(excluded.match_reasons, public.document_transaction_matches.match_reasons),
         difference_reason = coalesce(excluded.difference_reason, public.document_transaction_matches.difference_reason),
         confirmed_by      = excluded.confirmed_by,
         confirmed_at      = excluded.confirmed_at,
         rejected_by       = null,
         rejected_at       = null,
         reject_reason     = null,
         updated_at        = v_now
  returning id into v_match_id;

  if public.transaction_allocated_sum(p_transaction_id) >= v_tx_total - 0.01 then
    update public.document_transaction_matches
       set status        = 'rejected',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: transaction fully allocated',
           updated_at    = v_now
     where transaction_id = p_transaction_id and status in ('candidate', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  if public.invoice_matched_sum(p_invoice_id)
     >= v_inv_gross - public.payment_tolerance(v_inv_gross) then
    update public.document_transaction_matches
       set status        = 'rejected',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: invoice fully allocated',
           updated_at    = v_now
     where document_id = p_invoice_id and status in ('candidate', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  insert into public.document_history (document_id, type, text, actor, data)
  values (p_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when v_amount < v_tx_total - 0.01
                    then format(' (%s EUR von %s EUR)',
                                to_char(v_amount, 'FM999G999G990D00'),
                                to_char(v_tx_total, 'FM999G999G990D00'))
                    else format(' (%s EUR)', to_char(v_amount, 'FM999G999G990D00')) end
            || case when p_difference_reason is not null then format(', Differenzgrund: %s', p_difference_reason) else '' end
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s suggestion(s) withdrawn', v_withdrawn) else '' end
            || case when v_released then ', the "no document expected" exception was lifted' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'difference_reason', p_difference_reason,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released));

  return v_match_id;
end $$;

CREATE OR REPLACE FUNCTION public.link_outgoing_invoice_transaction(p_outgoing_invoice_id uuid, p_transaction_id uuid, p_score numeric DEFAULT NULL::numeric, p_reasons jsonb DEFAULT NULL::jsonb, p_amount numeric DEFAULT NULL::numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor      text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_now        timestamptz := now();
  v_match_id   uuid;
  v_withdrawn  int := 0;
  v_batch      int;
  v_released   boolean := false;
  v_tx_total   numeric;
  v_tx_other   numeric;
  v_tx_rest    numeric;
  v_inv_gross  numeric;
  v_inv_other  numeric;
  v_inv_rest   numeric;
  v_amount     numeric;
begin
  if p_outgoing_invoice_id is null or p_transaction_id is null then
    raise exception 'link_outgoing_invoice_transaction: invoice and transaction are both required';
  end if;

  if not exists (select 1 from public.outgoing_invoices where id = p_outgoing_invoice_id) then
    raise exception 'link_outgoing_invoice_transaction: outgoing invoice % not found', p_outgoing_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_outgoing_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.outgoing_invoices where id = p_outgoing_invoice_id;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_outgoing_invoice_transaction: invoice % has no gross amount to allocate against',
      p_outgoing_invoice_id;
  end if;

  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.outgoing_invoice_transaction_matches
   where transaction_id = p_transaction_id and status = 'confirmed'
     and outgoing_invoice_id <> p_outgoing_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = p_outgoing_invoice_id and status = 'confirmed'
     and transaction_id <> p_transaction_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  v_amount := coalesce(p_amount, least(v_tx_rest, v_inv_rest));

  if v_amount is null or v_amount <= 0 then
    raise exception
      'link_outgoing_invoice_transaction: nothing left to allocate (transaction free %, invoice open %)',
      v_tx_rest, v_inv_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_tx_rest + 0.01 then
    raise exception 'link_outgoing_invoice_transaction: amount % exceeds the transaction remainder %',
      v_amount, v_tx_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_inv_rest + 0.01 then
    raise exception 'link_outgoing_invoice_transaction: amount % exceeds the invoice remainder %',
      v_amount, v_inv_rest using errcode = 'check_violation';
  end if;

  -- A credit is being linked, so "no receipt expected" was wrong -- release the hide first, same
  -- as the incoming side.
  update public.bank_transactions
     set matching_status   = 'open',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignored';
  v_released := found;

  insert into public.outgoing_invoice_transaction_matches
         (outgoing_invoice_id, transaction_id, status, score, match_reasons, amount_matched,
          matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_outgoing_invoice_id, p_transaction_id, 'confirmed', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          v_actor, v_actor, v_now, v_now)
  on conflict (outgoing_invoice_id, transaction_id) do update
     set status         = 'confirmed',
         amount_matched = excluded.amount_matched,
         score          = coalesce(excluded.score, public.outgoing_invoice_transaction_matches.score),
         match_reasons  = coalesce(excluded.match_reasons, public.outgoing_invoice_transaction_matches.match_reasons),
         confirmed_by   = excluded.confirmed_by,
         confirmed_at   = excluded.confirmed_at,
         rejected_by    = null,
         rejected_at    = null,
         reject_reason  = null,
         updated_at     = v_now
  returning id into v_match_id;

  if public.outgoing_transaction_allocated_sum(p_transaction_id) >= v_tx_total - 0.01 then
    update public.outgoing_invoice_transaction_matches
       set status        = 'rejected',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: transaction fully allocated',
           updated_at    = v_now
     where transaction_id = p_transaction_id and status in ('candidate', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  if public.outgoing_invoice_matched_sum(p_outgoing_invoice_id) >= v_inv_gross - 0.01 then
    update public.outgoing_invoice_transaction_matches
       set status        = 'rejected',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: invoice fully allocated',
           updated_at    = v_now
     where outgoing_invoice_id = p_outgoing_invoice_id and status in ('candidate', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values ('outgoing_invoices', p_outgoing_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when v_amount < v_tx_total - 0.01
                    then format(' (%s EUR von %s EUR)',
                                to_char(v_amount, 'FM999G999G990D00'),
                                to_char(v_tx_total, 'FM999G999G990D00'))
                    else format(' (%s EUR)', to_char(v_amount, 'FM999G999G990D00')) end
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s suggestion(s) withdrawn', v_withdrawn) else '' end
            || case when v_released then ', the "no document expected" exception was lifted' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released),
          v_now);

  return v_match_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.link_uploaded_invoice_when_extracted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_amount numeric;
begin
  if new.uploaded_for_transaction_id is null then
    return null;
  end if;
  -- Nothing to allocate against yet. Extraction has not run, or it ran and found no total.
  if new.amount_gross is null or new.amount_gross = 0 then
    return null;
  end if;
  -- `after update of amount_gross` also fires when the column is merely present in the SET list,
  -- so the transition itself has to be checked rather than assumed.
  if old.amount_gross is not distinct from new.amount_gross then
    return null;
  end if;
  -- Already linked. link_invoice_transaction would re-stamp it happily, but re-running it can also
  -- raise once the remainders have moved on, and there is nothing to gain by trying.
  if exists (
    select 1 from public.document_transaction_matches
     where document_id = new.id
       and transaction_id = new.uploaded_for_transaction_id
       and status = 'confirmed'
  ) then
    return null;
  end if;

  -- WRAPPED, because this runs inside the pipeline's own UPDATE. A raise here would roll that back
  -- and the extraction result would be lost, which is a far worse outcome than an unlinked invoice.
  -- The reason is written where somebody will see it rather than swallowed.
  begin
    perform public.link_invoice_transaction(
      p_invoice_id        => new.id,
      p_transaction_id    => new.uploaded_for_transaction_id,
      p_score             => null,
      p_reasons           => jsonb_build_object('uploaded_for_transaction', true),
      p_amount            => null,
      p_difference_reason => null
    );

    select amount_matched into v_amount
      from public.document_transaction_matches
     where document_id = new.id and transaction_id = new.uploaded_for_transaction_id;

    insert into public.document_history (document_id, type, text, actor)
    values (
      new.id, 'aenderung',
      -- Persisted audit text stays German.
      'Matched to the transaction the invoice was uploaded from ('
        || to_char(coalesce(v_amount, 0), 'FM999G999G990D00') || ' EUR).',
      'hub'
    );
  exception when others then
    insert into public.document_history (document_id, type, text, actor)
    values (
      new.id, 'aenderung',
      'Could not match it to the transaction automatically: ' || sqlerrm,
      'hub'
    );
  end;

  return null;
end $$;

CREATE OR REPLACE FUNCTION public.log_supplier_bank_account_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    akteur text := coalesce(auth.uid()::text, 'pipeline');
begin
    if tg_op = 'INSERT' then
        insert into public.supplier_iban_history
            (supplier_id, iban, bic, bank_name, changed_by, event)
        values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'account_added');
        -- A supplier's first account arrives as the default, so both events are true of it and
        -- both are recorded. The list then reads the same whether the default was set on the way
        -- in or picked later.
        if new.is_default then
            insert into public.supplier_iban_history
                (supplier_id, iban, bic, bank_name, changed_by, event)
            values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'default_set');
        end if;
    elsif new.is_default and not coalesce(old.is_default, false) then
        insert into public.supplier_iban_history
            (supplier_id, iban, bic, bank_name, changed_by, event)
        values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'default_set');
    end if;
    return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.manual_bookings_expanded(p_company uuid DEFAULT NULL::uuid, p_von date DEFAULT NULL::date, p_bis date DEFAULT NULL::date) RETURNS TABLE(source_id uuid, company_id uuid, property_id uuid, category_id uuid, period date, amount numeric, note text, is_recurring boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  -- Non-recurring: pass through unchanged when its period falls in range.
  select b.id as source_id, b.company_id, b.property_id, b.category_id, b.period, b.amount,
         b.note, b.is_recurring
    from public.manual_bookings b
   where b.deleted_at is null
     and (p_company is null or b.company_id = p_company)
     and not b.is_recurring
     and b.period between date_trunc('month', p_von)::date and date_trunc('month', p_bis)::date

  union all

  -- Recurring: one row per calendar month between its own start/end and the requested range.
  -- generate_series(start, stop, step) with start > stop returns zero rows (no separate guard
  -- needed for a template outside the requested range, or one whose recurrence_until precedes it).
  select b.id as source_id, b.company_id, b.property_id, b.category_id, m.month::date as period,
         b.amount, b.note, b.is_recurring
    from public.manual_bookings b
    cross join lateral generate_series(
      greatest(b.period, date_trunc('month', p_von)::date),
      least(coalesce(b.recurrence_until, p_bis), date_trunc('month', p_bis)::date),
      interval '1 month'
    ) as m(month)
   where b.deleted_at is null
     and (p_company is null or b.company_id = p_company)
     and b.is_recurring;
$$;

CREATE OR REPLACE FUNCTION public.mark_datev_batch_bounced(p_batch_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_status text;
  v_reset  int;
begin
  select status into v_status
    from public.handover_batches
   where id = p_batch_id
   for update;

  if v_status is null then
    raise exception 'mark_datev_batch_bounced: no batch %', p_batch_id;
  end if;

  -- Idempotent: a mailbox read that sees the same report twice must not undo an acknowledgement.
  if v_status = 'bounced' then
    return;
  end if;

  update public.handover_batches
     set status        = 'bounced',
         bounced_at    = now(),
         bounce_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_batch_id;

  -- Not handed over after all, so it goes back on the ready list. handover_batch_id stays, so the
  -- failed attempt is still traceable from the receipt.
  update public.documents
     set handed_over_at = null
   where handover_batch_id = p_batch_id
     and handed_over_at is not null;
  get diagnostics v_reset = row_count;

  raise notice 'batch % marked bounced, % invoice(s) returned to the ready list', p_batch_id, v_reset;
end;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_seen() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    return;
  end if;

  update public.app_users
     set notifications_seen_at = now(),
         updated_at = now()
   where lower(email) = lower(v_email);
end;
$$;

CREATE OR REPLACE FUNCTION public.match_opos_whitelist(p_reference text, p_counterparty text, p_iban text, p_booking_text text) RETURNS TABLE(rule_id uuid, category text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select r.id, r.category
    from public.open_item_whitelist_rules r
   where r.is_active
     and r.deleted_at is null
     and public.opos_norm(r.term) <> ''
     and position(
           public.opos_norm(r.term) in
           case r.scope
             when 'reference'    then public.opos_norm(p_reference)
             when 'counterparty' then public.opos_norm(p_counterparty)
             when 'iban'         then public.opos_norm(p_iban)
             when 'booking_text' then public.opos_norm(p_booking_text)
             else public.opos_norm(concat_ws(' ', p_reference, p_counterparty, p_iban, p_booking_text))
           end
         ) > 0
   order by r.created_at, r.term
   limit 1;
$$;

CREATE OR REPLACE FUNCTION public.merge_suppliers(p_keep_id uuid, p_merge_id uuid, p_merged_by text, p_reason text DEFAULT NULL::text) RETURNS public.suppliers
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_keep    public.suppliers;
  v_merge   public.suppliers;
  v_fk      record;
  v_result  public.suppliers;
begin
  if p_keep_id = p_merge_id then
    raise exception 'merge_suppliers: p_keep_id and p_merge_id must differ';
  end if;

  select * into v_keep from public.suppliers where id = p_keep_id;
  if not found then
    raise exception 'merge_suppliers: keep supplier % not found', p_keep_id;
  end if;
  if v_keep.deleted_at is not null then
    raise exception 'merge_suppliers: keep supplier % is already deleted', p_keep_id;
  end if;

  select * into v_merge from public.suppliers where id = p_merge_id;
  if not found then
    raise exception 'merge_suppliers: merge-away supplier % not found', p_merge_id;
  end if;
  if v_merge.deleted_at is not null then
    raise exception 'merge_suppliers: merge-away supplier % is already deleted', p_merge_id;
  end if;

  -- Reassign every FK column pointing at suppliers(id), across every table in `public`. Discovered
  -- dynamically rather than hardcoded: suppliers/documents predate this repo's tracked migration
  -- history (renamed from German outside any versioned migration), so a hardcoded table list could
  -- silently miss a real FK. This also future-proofs the function against tables added later.
  for v_fk in
    select kcu.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and ccu.table_name = 'suppliers'
       and ccu.column_name = 'id'
       and kcu.table_name not in ('supplier_iban_history', 'supplier_bank_accounts') -- reassigned explicitly below instead
  loop
    execute format(
      'update public.%I set %I = $1 where %I = $2',
      v_fk.table_name, v_fk.column_name, v_fk.column_name
    ) using p_keep_id, p_merge_id;
  end loop;

  -- Preserve the merged-away supplier's bank details if they differ from the survivor's, so
  -- nothing is silently lost even though only one IBAN can be "current" going forward.
  if v_merge.iban is not null and v_merge.iban is distinct from v_keep.iban then
    insert into public.supplier_iban_history (supplier_id, iban, bic, bank_name, changed_by)
    values (p_keep_id, v_merge.iban, v_merge.bic, v_merge.bank_name, p_merged_by);
  end if;

  -- Also carry the merged-away supplier's own history rows forward, so "IBAN-Verlauf" on the
  -- survivor stays complete.
  update public.supplier_iban_history set supplier_id = p_keep_id where supplier_id = p_merge_id;

  -- Move every account the merged-away supplier held onto the survivor. Where both already hold
  -- the same IBAN the survivor's own row wins and the duplicate is simply dropped afterwards, never
  -- overwritten, since a name or verification somebody already checked must not be replaced blind.
  insert into public.supplier_bank_accounts (supplier_id, iban, bic, bank_name, source, is_active, created_by)
  select p_keep_id, iban, bic, bank_name, source, is_active, created_by
    from public.supplier_bank_accounts
   where supplier_id = p_merge_id
  on conflict (supplier_id, iban) do nothing;

  delete from public.supplier_bank_accounts where supplier_id = p_merge_id;

  -- Carry the merged-away supplier's aliases across. A move changes entity_code and nothing else,
  -- and entity_aliases_one_owner_uniq is keyed on (entity_type, folded(alias)), so it is indifferent
  -- to the move: the only index a move can violate is entity_aliases_uniq, and the guard below is
  -- exactly its columns. It deliberately does not test is_active -- that index is partial on three
  -- of the four Hubs and plain on Immonetz, and ignoring is_active is the correct guard under both.
  update public.entity_aliases a
     set entity_code = p_keep_id::text,
         updated_at = now()
   where a.entity_type = 'supplier'
     and a.entity_code = p_merge_id::text
     and a.is_active
     and not exists (
       select 1 from public.entity_aliases k
        where k.entity_type = 'supplier'
          and k.entity_code = p_keep_id::text
          and k.alias = a.alias);

  -- Whatever could not move is a spelling the survivor already has. Deactivated rather than deleted,
  -- so the record survives (GoBD) and the one-owner slot the dead row would keep is released.
  update public.entity_aliases
     set is_active = false,
         updated_at = now(),
         note = coalesce(note || ' | ', '') || 'deactivated by merge into ' || p_keep_id::text
   where entity_type = 'supplier'
     and entity_code = p_merge_id::text
     and is_active;

  -- Remember the merged-away name as a known spelling of the survivor.
  --
  -- ON CONFLICT carries no target on purpose. A target has to repeat the predicate of the index it
  -- names, and entity_aliases_uniq is partial here but plain on Immonetz -- and naming either one
  -- leaves a clash on entity_aliases_one_owner_uniq unswallowed, which would roll back the entire
  -- merge to avoid losing a single alias. Untargeted, it takes DO NOTHING on any unique index.
  --
  -- The blank test is separate because ON CONFLICT does not swallow a CHECK violation, and
  -- entity_aliases_alias_not_blank refuses an empty alias.
  if btrim(coalesce(v_merge.name, '')) <> '' then
    insert into public.entity_aliases (entity_type, entity_code, alias, note)
    values ('supplier', p_keep_id::text, v_merge.name, 'merged from ' || p_merge_id::text)
    on conflict do nothing;
  end if;

  update public.suppliers
     set deleted_at = now(),
         deleted_by = p_merged_by,
         delete_reason = coalesce(p_reason, 'merged into ' || p_keep_id::text)
   where id = p_merge_id;

  select * into v_result from public.suppliers where id = p_keep_id;
  return v_result;
end;
$_$;

CREATE OR REPLACE FUNCTION public.my_profile() RETURNS TABLE(id uuid, name text, email text, picture_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    raise exception 'my_profile: no authenticated email' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id, u.name, u.email, u.picture_url
      from public.app_users u
     where lower(u.email) = lower(v_email);
end;
$$;

CREATE OR REPLACE FUNCTION public.notify_dispatch_now() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_key text;
  v_url text;
begin
  -- Missing key or host means the POST would be rejected at the gateway anyway, so skip quietly:
  -- the scheduled job still delivers this event on its next tick.
  v_key := public.deployment_secret('service_role_key');
  v_url := public.deployment_secret('project_url');
  if v_key is null or v_url is null then
    return null;
  end if;

  -- The id goes in the body so the dispatcher delivers THIS event rather than draining the whole
  -- undelivered batch. Two notifications written a second apart would otherwise start two runs
  -- that both read the same batch and both post it.
  --
  -- The host comes from the vault, never from a literal: a literal is how a clone ends up posting
  -- one client's notifications to another client's project.
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'event', 'id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end $$;

CREATE OR REPLACE FUNCTION public.notify_event_from_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name           text;
  v_recipient      uuid;
  v_actor_user     uuid;
  v_type           text;
  v_invoice_number text;
begin
  if new.type not in ('query', 'ablehnung', 'zuweisung') then
    return null;
  end if;

  v_type := case new.type
              when 'query' then 'query'
              when 'ablehnung'  then 'rejected'
              else 'zuweisung'
            end;

  -- The name, for the payload and for the legacy fallback below. 'returned_to' for the two return
  -- types, 'assigned_to' for an assignment.
  v_name := nullif(btrim(coalesce(
              new.data ->> 'returned_to',
              new.data ->> 'assigned_to',
              '')), '');

  -- The id the app writes. Guarded rather than cast bare: a malformed value must degrade to the
  -- name fallback, not raise.
  begin
    v_recipient := nullif(btrim(coalesce(new.data ->> 'recipient_user_id', '')), '')::uuid;
  exception when others then
    v_recipient := null;
  end;

  -- Rows written before this migration carry only a name. Matched against app_users directly:
  -- the approvers table this used to go through is frozen and gains no new people.
  if v_recipient is null and v_name is not null then
    select u.id into v_recipient
      from public.app_users u
     where u.name is not null and lower(u.name) = lower(v_name)
     limit 1;
  end if;

  -- An un-assignment ("Zuweisung entfernt") has nobody to tell.
  if v_type = 'zuweisung' and v_recipient is null then
    return null;
  end if;

  -- Do not ring your own bell.
  if v_recipient is not null and new.actor is not null then
    select u.id into v_actor_user
      from public.app_users u
     where lower(u.email) = lower(new.actor)
        or (u.name is not null and lower(u.name) = lower(new.actor))
     limit 1;
    if v_actor_user = v_recipient then
      return null;
    end if;
  end if;

  select i.invoice_number into v_invoice_number
    from public.documents i where i.id = new.document_id;

  insert into public.notification_events (type, payload, recipient_user_id)
  values (
    v_type,
    jsonb_strip_nulls(jsonb_build_object(
      'document_id', new.document_id,
      'invoice_number', v_invoice_number,
      -- Kept under its original key for the two return types so existing consumers and stored
      -- payloads keep their vocabulary; an assignment says assigned_to.
      'returned_to', case when v_type <> 'zuweisung' then v_name end,
      'assigned_to', case when v_type =  'zuweisung' then v_name end,
      'note', nullif(btrim(coalesce(new.text, '')), ''),
      'actor', new.actor
    )),
    v_recipient
  );
  return null;
exception when others then
  -- A notification must never block the workflow write it observes.
  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.opos_clear_no_receipt(p_transaction_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.bank_transactions
     set matching_status   = 'open',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignored';
end;
$$;

CREATE OR REPLACE FUNCTION public.opos_norm(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.opos_reapply_whitelist(p_rule_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_changed integer := 0;
begin
  -- Same gate as the policies above: this rewrites matching_status across every company.
  if not coalesce(
       public.current_role_name() = any (array['admin', 'super_admin', 'supervisor']), false) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  with kandidaten as (
    select t.id, t.payment_reference, t.counterparty_holder, t.counterparty_iban, t.booking_text,
           t.no_receipt_set_by, t.no_receipt_set_at, t.whitelist_rule_id
      from public.bank_transactions t
     where t.matching_status = 'ignored'
       -- A non-null whitelist_rule_id is exactly what separates "a rule hid this" from "a person
       -- did" -- opos_set_no_receipt leaves the column null. A human decision must never be undone
       -- here, which is the same guard apply_opos_whitelist() applies for the same reason.
       -- 'matched' rows are excluded by the status filter, so a reconciled payment is untouched.
       and t.whitelist_rule_id is not null
       and (p_rule_id is null or t.whitelist_rule_id = p_rule_id)
  ),
  neu as (
    select k.*, m.rule_id as neue_regel, m.category as neue_kategorie
      from kandidaten k
      left join lateral public.match_opos_whitelist(
        k.payment_reference, k.counterparty_holder, k.counterparty_iban, k.booking_text) m on true
  )
  update public.bank_transactions t
     set matching_status   = case when n.neue_regel is null then 'open' else 'ignored' end,
         no_receipt_reason = n.neue_kategorie,
         whitelist_rule_id = n.neue_regel,
         no_receipt_set_by = case when n.neue_regel is null
                                  then null else coalesce(n.no_receipt_set_by, 'system') end,
         no_receipt_set_at = case when n.neue_regel is null
                                  then null else coalesce(n.no_receipt_set_at, now()) end
    from neu n
   where t.id = n.id
     and n.neue_regel is distinct from n.whitelist_rule_id;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

CREATE OR REPLACE FUNCTION public.opos_set_category(p_transaction_id uuid, p_category_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.bank_transactions
     set category_id     = p_category_id,
         category_source = case when p_category_id is null then null else 'human' end
   where id = p_transaction_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.opos_set_no_receipt(p_transaction_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_reason is null or p_reason not in ('salary', 'tax_prepayment', 'private_withdrawal',
        'rebooking', 'loan_installment', 'fee_interest', 'atm_withdrawal', 'other') then
    raise exception 'opos_set_no_receipt: invalid reason %', p_reason;
  end if;

  update public.bank_transactions
     set matching_status   = 'ignored',
         no_receipt_reason = p_reason,
         whitelist_rule_id = null,           -- NULL = a human decided this
         no_receipt_set_by = coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub'),
         no_receipt_set_at = now()
   where id = p_transaction_id
     and matching_status <> 'matched';    -- never un-reconcile a matched payment
end;
$$;

CREATE OR REPLACE FUNCTION public.outgoing_invoice_matched_sum(p_outgoing_invoice uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = p_outgoing_invoice and status = 'confirmed';
$$;

CREATE OR REPLACE FUNCTION public.outgoing_transaction_allocated_sum(p_transaction uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.outgoing_invoice_transaction_matches
   where transaction_id = p_transaction and status = 'confirmed';
$$;

CREATE OR REPLACE FUNCTION public.payment_tolerance(p_gross numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  -- How far BELOW the gross a payment may land and still close the invoice. German Skonto is
  -- typically 2% and occasionally 3%, so 3% covers the real cases. The absolute cap stops the
  -- percentage from silently writing off a large sum: 3% of a 50.000 invoice would be 1.500,
  -- which no one should auto-close. The 0.01 floor keeps plain rounding working on tiny documents.
  select least(greatest(abs(coalesce(p_gross, 0)) * 0.03, 0.01), 150.00);
$$;

CREATE OR REPLACE FUNCTION public.pending_receipt_count() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)
    from public.bank_transactions b
    cross join lateral jsonb_array_elements(b.raw_data->'receipts') as r
   where b.source = 'pleo'
     and jsonb_typeof(b.raw_data->'receipts') = 'array'
     and r->>'id' is not null
     and not exists (
       select 1 from public.document_files f
        where f.transaction_id = b.id
          and f.external_id = r->>'id'
          and f.deleted_at is null
     );
$$;

CREATE OR REPLACE FUNCTION public.pending_receipt_downloads(p_limit integer DEFAULT 50) RETURNS TABLE(id uuid, external_id text, booking_date date, missing_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select b.id,
         b.external_id,
         b.booking_date,
         count(*)::int as missing_count
    from public.bank_transactions b
    cross join lateral jsonb_array_elements(b.raw_data->'receipts') as r
   where b.source = 'pleo'
     and jsonb_typeof(b.raw_data->'receipts') = 'array'
     and r->>'id' is not null
     -- the anti-join: this receipt has no stored file
     and not exists (
       select 1 from public.document_files f
        where f.transaction_id = b.id
          and f.external_id = r->>'id'
          and f.deleted_at is null
     )
   group by b.id, b.external_id, b.booking_date
   order by b.booking_date nulls last, b.id
   limit greatest(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.promote_first_bank_account_to_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
begin
    -- Being demoted right now, so not a candidate. Without this the single-default trigger's own
    -- cascade is undone row by row and the statement fails on the unique index.
    if tg_op = 'UPDATE' and old.is_default and not new.is_default then
        return new;
    end if;

    -- Already the default, or not a live account: nothing to promote.
    if new.is_default or new.deleted_at is not null or not coalesce(new.is_active, true) then
        return new;
    end if;

    -- A masked IBAN cannot be the default: supplier_bank_accounts_default_is_payable forbids it,
    -- and money cannot be sent to it. Tested against the value rather than the generated
    -- is_payable column, which a BEFORE trigger cannot yet see.
    if new.iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
        return new;
    end if;

    if exists (select 1
                 from public.supplier_bank_accounts
                where supplier_id = new.supplier_id
                  and id <> new.id
                  and is_default
                  and deleted_at is null) then
        return new;
    end if;

    new.is_default := true;
    return new;
end;
$_$;

CREATE OR REPLACE FUNCTION public.propagate_account_company() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.company_id is distinct from old.company_id then
    update public.bank_transactions
       set company_id = new.company_id
     where account_id = new.id
       and company_id is distinct from new.company_id;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.purge_record(p_table text, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_actor    text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_snapshot jsonb;
begin
  if not (public.is_admin() or public.has_permission('page.papierkorb')) then
    raise exception 'purge_record: not permitted' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'purge_record: table and id are required';
  end if;
  if p_table = 'documents' then
    raise exception
      'purge_record: documents cannot be purged -- GoBD requires receipts to be deactivated and '
      'kept, never hard-deleted. Restore it or leave it in the trash.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_table = 'approvers' then
    raise exception
      'purge_record: approvers cannot be purged -- approval_rules and approvers.deputy_name '
      'reference approvers(name), and purging a deputy would silently blank that reference. '
      'Restore it or leave it in the trash.'
      using errcode = 'insufficient_privilege';
  end if;
  if not (p_table = any(public.trash_purge_eligible_tables())) then
    raise exception 'purge_record: table % is not trash-eligible', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 and deleted_at is not null', p_table)
    into v_snapshot using p_id;
  if v_snapshot is null then
    raise exception 'purge_record: % % is not currently deleted', p_table, p_id;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values (p_table, p_id, 'purged', 'Record permanently deleted', v_actor, v_snapshot, now());

  execute format('delete from public.%I where id = $1', p_table) using p_id;
end;
$_$;

CREATE OR REPLACE FUNCTION public.refuse_deleting_default_bank_account() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if old.is_default then
        raise exception 'cannot delete the default bank account of supplier %; set another account '
            'as the default first', old.supplier_id
            using errcode = 'restrict_violation';
    end if;
    return old;
end;
$$;

CREATE OR REPLACE FUNCTION public.request_approval_ping(p_recipient uuid, p_invoice_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_transaction_id is not null then
    perform public.send_notification(
      p_recipient, p_note, 'transaction', p_transaction_id::text,
      '/banktransaktionen/' || p_transaction_id::text
    );
  elsif p_invoice_id is not null then
    perform public.send_notification(
      p_recipient, p_note, 'invoice', p_invoice_id::text,
      '/eingangsrechnungen/' || p_invoice_id::text
    );
  else
    perform public.send_notification(p_recipient, p_note, null, null, null);
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.resolve_approval_rule(p_invoice_id uuid) RETURNS public.approval_rules
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_rule public.approval_rules;
  v_area text;
  v_area_user uuid;
begin
  select r.* into v_rule
    from public.approval_rules r
    join public.documents i on i.id = p_invoice_id
   where r.is_active
     and r.deleted_at is null
     and r.min_amount <= coalesce(i.amount_gross, 0)
     and (r.supplier_id is null or r.supplier_id = i.supplier_id)
     and (r.property_id is null or r.property_id = i.property_id)
     and (r.company_id  is null or r.company_id  = i.company_id)
   order by r.specificity desc, r.min_amount desc, r.created_at desc
   limit 1;

  if v_rule.id is null then
    return null;
  end if;

  if v_rule.step_2_user_id is null and not v_rule.skip_step_2 then
    select c.area into v_area
      from public.documents i
      join public.companies c on c.id = i.company_id
     where i.id = p_invoice_id;

    select ru.id into v_area_user from public.resolve_area_user(v_area) ru;

    v_rule.step_2_user_id := v_area_user;
  end if;

  return v_rule;
end;
$$;

CREATE OR REPLACE FUNCTION public.resolve_area_user(p_area text) RETURNS SETOF public.app_users
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select u.*
    from public.app_users u
   where p_area is not null
     and u.is_active
     and (
       u.area = p_area
       or (
         u.covers_all_areas
         and not exists (
           select 1 from public.app_users x
            where x.is_active and x.area = p_area
         )
       )
     )
   order by (u.area = p_area) desc, u.created_at asc
   limit 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_assignment_rule(p_invoice uuid, p_target text) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select r.id
    from public.assignment_rules r
    join public.documents i on i.id = p_invoice
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

CREATE OR REPLACE FUNCTION public.resolve_assignment_rule_candidates(p_invoice uuid, p_target text) RETURNS TABLE(rule_id uuid, specificity integer, is_winner boolean)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select r.id, r.specificity,
         row_number() over (order by r.specificity desc, r.created_at desc) = 1
    from public.assignment_rules r
    join public.documents i on i.id = p_invoice
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

CREATE OR REPLACE FUNCTION public.resolve_default_vat_deductible_pct(p_property uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select case p.vat_status
           when 'taxable' then 100
           when 'exempt'      then 0
           else null -- 'gemischt', or an unresolved property: genuinely ambiguous, needs a decision
         end
    from public.properties p
   where p.id = p_property;
$$;

CREATE OR REPLACE FUNCTION public.resolve_transaction_category(p_transaction uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select r.category_id
    from public.bank_transactions t
    join public.suppliers s
      on s.iban is not null
     and s.iban = t.counterparty_iban
     and s.deleted_at is null
    join public.assignment_rules r
      on r.target = 'cost_category'
     and r.is_active
     and r.deleted_at is null
     and r.supplier_id = s.id
     and r.category_id is not null
     and (
       r.reference_pattern is null
       or coalesce(t.payment_reference, '') ilike '%' || public.escape_ilike_pattern(r.reference_pattern) || '%'
     )
   where t.id = p_transaction
   order by r.specificity desc, r.created_at desc
   limit 1;
$$;

CREATE OR REPLACE FUNCTION public.restore_record(p_table text, p_id uuid, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_actor  text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_rows   int;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (public.is_admin() or public.has_permission('page.papierkorb')) then
    raise exception 'restore_record: not permitted' using errcode = 'insufficient_privilege';
  end if;
  if p_table is null or p_id is null then
    raise exception 'restore_record: table and id are required';
  end if;
  if not (p_table = any(public.trash_eligible_tables())) then
    raise exception 'restore_record: table % is not trash-eligible', p_table;
  end if;

  -- GET DIAGNOSTICS, not FOUND: unreliable after a dynamic EXECUTE ... USING UPDATE on this
  -- project, per migration 0046's own note.
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
  values (
    p_table,
    p_id,
    'restored',
    case
      when v_reason is null then 'Record restored from the trash'
      else 'Record restored from the trash: ' || v_reason
    end,
    v_actor,
    now()
  );
end;
$_$;

CREATE OR REPLACE FUNCTION public.run_bank_sync(p_mode text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_url  text;
  v_key  text;
  v_body jsonb;
  v_req  bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'bank_sync_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_sync_service_key';

  if v_url is null or v_key is null then
    raise exception 'run_bank_sync: Vault secrets bank_sync_url / bank_sync_service_key are missing. '
                    'Load them with: .venv/bin/python pipeline/set_bank_sync_secrets.py --apply';
  end if;

  v_body := case when p_mode is null then '{}'::jsonb else jsonb_build_object('mode', p_mode) end;

  select net.http_post(
           url                  := rtrim(v_url, '/') || '/functions/v1/bank-sync',
           body                 := v_body,
           headers              := jsonb_build_object(
                                     'Content-Type', 'application/json',
                                     'Authorization', 'Bearer ' || v_key,
                                     'apikey', v_key),
           timeout_milliseconds := 60000
         )
    into v_req;

  return v_req;
end;
$$;

CREATE OR REPLACE FUNCTION public.run_now_enabled() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select coalesce((select (config -> 'run' ->> 'run_now_enabled')::boolean
                       from public.tenant_settings where single_row), false)
$$;

CREATE OR REPLACE FUNCTION public.send_notification(p_recipient uuid, p_note text DEFAULT NULL::text, p_target_kind text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_target_path text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_sender      uuid := public.current_app_user_id();
  v_sender_name text;
  v_kind        public.notification_target_kinds%rowtype;
  v_exists      boolean;
  v_target      jsonb;
  v_id          bigint;
begin
  if v_sender is null then
    raise exception 'send_notification: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;
  if p_recipient is null then
    raise exception 'send_notification: recipient is required';
  end if;

  -- YOURSELF IS NOT A RECIPIENT. A notification is how you ask somebody else to look at something;
  -- sent to your own account it is a bell entry from you, to you, about what is already on your
  -- screen. The picker filters you out too, so reaching this means a stale page or a direct call.
  if p_recipient = v_sender then
    raise exception 'send_notification: cannot notify yourself'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.app_users where id = p_recipient and is_active) then
    raise exception 'send_notification: recipient % is not an active user', p_recipient;
  end if;

  if p_target_kind is not null then
    select * into v_kind
      from public.notification_target_kinds
     where kind = p_target_kind and is_active;
    if not found then
      raise exception 'send_notification: unknown target kind %', p_target_kind
        using errcode = 'check_violation';
    end if;

    -- The record has to be there. A notification pointing at something deleted sends the recipient
    -- to a broken page with no way to tell whether they misread it or it is gone.
    --
    -- format %I quotes the identifiers, and both of them come from this table rather than from the
    -- caller, so the dynamic statement cannot be steered from outside.
    if v_kind.source_table is not null and p_target_id is not null then
      execute format(
        'select exists (select 1 from public.%I where %I::text = $1)',
        v_kind.source_table, v_kind.id_column
      ) into v_exists using p_target_id;
      if not v_exists then
        raise exception 'send_notification: no % with id %', p_target_kind, p_target_id
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- A relative path only. An absolute URL here would let a notification carry somebody off to
  -- another host, which is not what "open the record" should be able to mean.
  if p_target_path is not null and p_target_path !~ '^/[^/]' then
    raise exception 'send_notification: target path must be a relative path starting with /'
      using errcode = 'check_violation';
  end if;

  select name into v_sender_name from public.app_users where id = v_sender;

  if p_target_kind is not null or p_target_path is not null then
    v_target := jsonb_strip_nulls(jsonb_build_object(
      'kind', p_target_kind,
      'id',   p_target_id,
      'path', p_target_path
    ));
  end if;

  insert into public.notification_events (type, payload, recipient_user_id, created_by)
  values (
    'ping',
    jsonb_strip_nulls(jsonb_build_object(
      'target',    v_target,
      'note',      nullif(btrim(coalesce(p_note, '')), ''),
      'from_name', v_sender_name,
      -- WRITTEN FOR THE OLD READERS TOO. Rows created before today carry document_id/transaction_id
      -- at the top level and several places still read them. Keeping both shapes on new rows means
      -- the front end and the dispatcher can be migrated after this ships rather than in the same
      -- breath, and nothing has to backfill the history.
      'document_id',     case when p_target_kind = 'invoice' then p_target_id end,
      'transaction_id', case when p_target_kind = 'transaction' then p_target_id end
    )),
    p_recipient,
    v_sender
  )
  returning id into v_id;

  return v_id;
end $_$;

CREATE OR REPLACE FUNCTION public.set_bank_account_connect_route() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.provider_id is null then
    new.connect_route := coalesce(new.connect_route, 'ebics_or_manual');
  else
    select case when p.is_supported then 'banksapi' else 'ebics_or_manual' end
      into new.connect_route
      from bank_providers p where p.id = new.provider_id;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.set_bank_transaction_company() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select ba.company_id into new.company_id
    from public.bank_accounts ba
   where ba.id = new.account_id;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_channel_secret(p_channel text, p_secret text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
  v_id uuid;
  v_old text;
  v_pattern text;
  v_secret text := nullif(regexp_replace(coalesce(p_secret, ''), '\s', '', 'g'), '');
begin
  if not public.is_admin() then
    raise exception 'set_channel_secret: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(config ->> 'secret_pattern', '') into v_pattern
    from public.notification_channels
   where key = p_channel;

  if not found then
    raise exception 'set_channel_secret: unknown channel %', p_channel;
  end if;

  if v_secret is not null and v_pattern <> '' and v_secret !~ v_pattern then
    raise exception 'set_channel_secret: value does not match the format % expects', p_channel;
  end if;

  v_name := public.channel_secret_name(p_channel);
  select id into v_id from vault.secrets where name = v_name limit 1;
  if v_id is not null then
    select decrypted_secret into v_old from vault.decrypted_secrets where id = v_id;
  end if;

  if v_secret is null then
    if v_id is not null then
      delete from vault.secrets where id = v_id;
    end if;
    update public.notification_channels
       set enabled = false, updated_at = now()
     where key = p_channel and enabled;
    return;
  end if;

  if v_id is null then
    begin
      perform vault.create_secret(v_secret, v_name, 'Credential for notification channel ' || p_channel);
    exception when unique_violation then
      select id into v_id from vault.secrets where name = v_name limit 1;
      perform vault.update_secret(v_id, v_secret);
    end;
  elsif v_old is distinct from v_secret then
    perform vault.update_secret(v_id, v_secret);
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_datev_route(p_company_id uuid, p_direction text, p_address text, p_is_enabled boolean, p_note text, p_updated_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Must come BEFORE has_company_access(): that function answers true for an anonymous caller.
  if auth.uid() is null then
    raise exception 'set_datev_route: authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_company_access(p_company_id) then
    raise exception 'set_datev_route: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  insert into public.handover_routes (company_id, direction, address, is_enabled, note, updated_by, updated_at)
  values (p_company_id, p_direction, p_address, p_is_enabled, p_note, p_updated_by, now())
  on conflict (company_id, direction) do update set
    address    = excluded.address,
    is_enabled = excluded.is_enabled,
    note       = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_my_name(p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if v_email = '' then
    raise exception 'set_my_name: no authenticated email' using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' then
    raise exception 'set_my_name: the name must not be empty' using errcode = 'check_violation';
  end if;
  if length(v_name) > 120 then
    raise exception 'set_my_name: the name is longer than 120 characters' using errcode = 'check_violation';
  end if;

  update public.app_users
     set name = v_name,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'set_my_name: no app_users row for %', v_email;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_my_picture_url(p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_email = '' then
    raise exception 'set_my_picture_url: no authenticated email' using errcode = 'insufficient_privilege';
  end if;
  -- Only a url inside our own bucket. Without this the column would accept any address on the
  -- internet, and every screen showing the picture would fetch it from there.
  if v_url is not null and position('/storage/v1/object/public/profile-pictures/' in v_url) = 0 then
    raise exception 'set_my_picture_url: the url does not point at the profile-pictures bucket'
      using errcode = 'check_violation';
  end if;

  update public.app_users
     set picture_url = v_url,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'set_my_picture_url: no app_users row for %', v_email;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_transaction_fully_used(p_transaction_id uuid, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_alloc numeric;
begin
  if p_transaction_id is null then
    raise exception 'set_transaction_fully_used: transaction is required';
  end if;

  v_alloc := public.transaction_allocated_sum(p_transaction_id)
           + public.outgoing_transaction_allocated_sum(p_transaction_id);
  if coalesce(v_alloc, 0) <= 0 then
    raise exception
      'set_transaction_fully_used: nothing is allocated to this transaction yet'
      using errcode = 'check_violation';
  end if;

  update public.bank_transactions
     set fully_used_at   = now(),
         fully_used_by   = v_actor,
         fully_used_note = p_note,
         matching_status = case when matching_status = 'ignored' then matching_status
                                else 'matched' end
   where id = p_transaction_id;
end $$;

CREATE OR REPLACE FUNCTION public.set_transaction_spender() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.spender_email := lower(nullif(trim(coalesce(new.spender_email, '')), ''));
  new.spender_name := nullif(trim(coalesce(new.spender_name, '')), '');
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.set_uploaded_outgoing_invoice_status(p_id uuid, p_status text, p_actor text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_source text;
begin
  if p_status not in ('draft', 'open', 'paidoff', 'voided') then
    raise exception 'set_uploaded_outgoing_invoice_status: invalid status %', p_status
      using errcode = 'check_violation';
  end if;

  select source into v_source from public.outgoing_invoices where id = p_id;
  if v_source is null then
    raise exception 'set_uploaded_outgoing_invoice_status: outgoing invoice % not found', p_id;
  end if;
  if v_source <> 'upload' then
    raise exception
      'set_uploaded_outgoing_invoice_status: invoice % is source=%, not upload -- LexOffice is the status authority for it, not this app',
      p_id, v_source using errcode = 'insufficient_privilege';
  end if;

  update public.outgoing_invoices
     set status = p_status, status_source = 'manual', updated_at = now()
   where id = p_id;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values ('outgoing_invoices', p_id, 'statuswechsel',
          format('Status manuell auf "%s" gesetzt', p_status), p_actor,
          jsonb_build_object('status', p_status), now());
end;
$$;

CREATE OR REPLACE FUNCTION public.set_user_slack_id(p_user uuid, p_slack_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_value text := btrim(coalesce(p_slack_id, ''));
begin
  if not public.is_admin() then
    raise exception 'set_user_slack_id: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  if p_slack_id is not null and v_value <> '' and v_value !~ '^[UW][A-Z0-9]+$' then
    raise exception 'set_user_slack_id: % is not a Slack member id', v_value;
  end if;

  update public.app_users
     set slack_user_id = case when p_slack_id is null then null else v_value end,
         updated_at = now()
   where id = p_user;

  if not found then
    raise exception 'set_user_slack_id: unknown user %', p_user;
  end if;
end;
$_$;

CREATE OR REPLACE FUNCTION public.suggest_assignment_rules() RETURNS TABLE(supplier_id uuid, category_id uuid, cost_category text, receipt_count bigint, total_receipts bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with base as (
    select i.id, i.supplier_id, i.category_id, i.cost_category
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and i.supplier_id is not null
       and (i.category_id is not null or coalesce(i.cost_category, '') <> '')
       and public.resolve_assignment_rule(i.id, 'cost_category') is null
  ),
  grouped as (
    select supplier_id, category_id, cost_category, count(*) as n
      from base
     group by supplier_id, category_id, cost_category
  ),
  ranked as (
    select *, row_number() over (partition by supplier_id order by n desc) as rnk
      from grouped
  ),
  totals as (
    select supplier_id, count(*) as total from base group by supplier_id
  )
  select r.supplier_id, r.category_id, r.cost_category, r.n, t.total
    from ranked r
    join totals t on t.supplier_id = r.supplier_id
   where r.rnk = 1
   order by t.total desc;
$$;

CREATE OR REPLACE FUNCTION public.supplier_bank_accounts_single_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if not new.is_default then
        return new;
    end if;

    -- A row ARRIVING from another supplier (merge_suppliers reassigns supplier_id) must not depose
    -- the keeper's own default. Without this the merge just fails on the unique index below.
    if tg_op = 'UPDATE'
       and new.supplier_id is distinct from old.supplier_id
       and exists (select 1 from public.supplier_bank_accounts
                    where supplier_id = new.supplier_id and id <> new.id and is_default) then
        new.is_default := false;
        return new;
    end if;

    -- Setting a default clears the previous one. No recursion: the inner update writes
    -- is_default = false, and this function returns early for those rows.
    update public.supplier_bank_accounts
       set is_default = false
     where supplier_id = new.supplier_id
       and id <> new.id
       and is_default;

    return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.supplier_default_account_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if not new.is_default then
        return null;
    end if;

    -- The IBAN is written ONLY when it actually differs compacted. Two reasons, and the second is
    -- the one that bites: many suppliers store their IBAN with spaces, so assigning the compacted
    -- form unconditionally would rewrite `suppliers.iban` on an edit that only touched the BIC.
    -- That is not a change of account, but supplier_iban_history would record it as one and the
    -- supplier list would show a bank-details warning for it.
    update public.suppliers s
       set iban = case
                    when upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
                         is distinct from new.iban
                    then new.iban
                    else s.iban
                  end,
           bic        = coalesce(new.bic, s.bic),
           bank_name  = coalesce(new.bank_name, s.bank_name),
           updated_at = now()
     where s.id = new.supplier_id
       and (
             upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
               is distinct from new.iban
             or (new.bic is not null and s.bic is distinct from new.bic)
             or (new.bank_name is not null and s.bank_name is distinct from new.bank_name)
           );

    return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.supplier_default_iban_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    compact text := upper(regexp_replace(coalesce(new.iban, ''), '[[:space:].-]', '', 'g'));
begin
    if compact = '' then
        update public.supplier_bank_accounts
           set is_default = false
         where supplier_id = new.id and is_default;
        return null;
    end if;

    update public.supplier_bank_accounts
       set is_default = false
     where supplier_id = new.id and is_default and iban <> compact;

    update public.supplier_bank_accounts
       set is_default = true, is_active = true
     where supplier_id = new.id and iban = compact and not is_default;

    return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_paid_from_matches() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_invoice   uuid := coalesce(new.document_id, old.document_id);
  v_gross     numeric;
  v_matched   numeric;
  v_paydate   date;
  v_paid_at   timestamptz;
  v_source    text;
  v_shortfall numeric;
  -- The person, when a person did it. Empty for the pipeline and for cron.
  v_actor     text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system');
begin
  select abs(amount_gross), paid_at, paid_source
    into v_gross, v_paid_at, v_source
    from public.documents where id = v_invoice;
  if not found then
    return null;
  end if;

  select coalesce(sum(m.amount_matched), 0), max(t.booking_date)
    into v_matched, v_paydate
    from public.document_transaction_matches m
    join public.bank_transactions t on t.id = m.transaction_id
   where m.document_id = v_invoice and m.status = 'confirmed';

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    if v_paid_at is null then
      update public.documents
         set paid_at     = coalesce(v_paydate::timestamptz, now()),
             paid_source = 'bank_match',
             updated_at  = now()
       where id = v_invoice;

      v_shortfall := v_gross - v_matched;
      insert into public.document_history (document_id, type, text, actor, data)
      values (
        v_invoice,
        'aenderung',
        -- Unchanged wording. Persisted audit text stays German.
        case when v_shortfall > 0.01
          then format('Marked as paid (confirmed bank match, %s EUR discount)',
                      to_char(v_shortfall, 'FM999G999G990D00'))
          else 'Marked as paid (confirmed bank match)'
        end,
        v_actor,
        jsonb_strip_nulls(jsonb_build_object(
          'event', 'paid_from_match',
          'skonto', case when v_shortfall > 0.01 then v_shortfall end
        ))
      );
    end if;
  else
    if v_paid_at is not null and v_source = 'bank_match' then
      update public.documents
         set paid_at     = null,
             paid_source = null,
             updated_at  = now()
       where id = v_invoice;

      insert into public.document_history (document_id, type, text, actor, data)
      values (
        v_invoice,
        'aenderung',
        format('Payment withdrawn: the bank match now covers only %s of %s EUR',
               to_char(v_matched, 'FM999G999G990D00'),
               to_char(v_gross, 'FM999G999G990D00')),
        v_actor,
        jsonb_build_object(
          'event', 'payment_withdrawn',
          'matched', v_matched,
          'gross', v_gross
        )
      );
    end if;
  end if;

  return null;
end $$;

CREATE OR REPLACE FUNCTION public.sync_transaction_matching_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tx    uuid := coalesce(new.transaction_id, old.transaction_id);
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = v_tx;
  if v_total is null then
    return null;
  end if;

  v_alloc := public.transaction_allocated_sum(v_tx) + public.outgoing_transaction_allocated_sum(v_tx);

  update public.bank_transactions t
     set matching_status = case
           -- A hand-closed transaction stays closed even with a remainder. It still has to carry
           -- at least one confirmed allocation: "fully used" describes what happened to a payment
           -- that paid something, not a way to file an untouched one away.
           when t.fully_used_at is not null and v_alloc > 0 then 'matched'
           when v_alloc > 0 and v_alloc >= v_total - 0.01 then 'matched'
           else 'open'
         end
   where t.id = v_tx
     and t.matching_status <> 'ignored';

  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.sync_uploaded_outgoing_invoice_status_from_matches() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_invoice_id    uuid := coalesce(new.outgoing_invoice_id, old.outgoing_invoice_id);
  v_source        text;
  v_gross         numeric;
  v_status        text;
  v_status_source text;
  v_matched       numeric;
begin
  select source, amount_gross, status, status_source
    into v_source, v_gross, v_status, v_status_source
    from public.outgoing_invoices where id = v_invoice_id;
  if not found or v_source <> 'upload' then
    return null;
  end if;

  select public.outgoing_invoice_matched_sum(v_invoice_id) into v_matched;

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    -- A manual override (status_source='manual') is never touched in EITHER direction -- e.g.
    -- someone deliberately holding an invoice 'open' despite a covering match must not have it
    -- silently flipped back to 'paidoff' the next time this trigger fires.
    if v_status_source is distinct from 'manual' and v_status not in ('paidoff', 'voided') then
      update public.outgoing_invoices
         set status = 'paidoff', status_source = 'auto', updated_at = now()
       where id = v_invoice_id;

      insert into public.change_history (table_name, record_id, type, text, actor, data, at)
      values ('outgoing_invoices', v_invoice_id, 'statuswechsel',
              'Marked as paid (confirmed bank match)', 'system',
              jsonb_build_object('status', 'paidoff', 'matched', v_matched, 'gross', v_gross),
              now());
    end if;
  else
    -- No longer covered (link removed or amount reduced). Only a status THIS trigger set is
    -- withdrawn -- a manual override is never touched.
    if v_status = 'paidoff' and v_status_source = 'auto' then
      update public.outgoing_invoices
         set status = 'open', status_source = null, updated_at = now()
       where id = v_invoice_id;

      insert into public.change_history (table_name, record_id, type, text, actor, data, at)
      values ('outgoing_invoices', v_invoice_id, 'statuswechsel',
              'Payment withdrawn: the bank match no longer covers the invoice in full',
              'system',
              jsonb_build_object('status', 'open', 'matched', v_matched, 'gross', v_gross),
              now());
    end if;
  end if;

  return null;
end;
$$;

CREATE OR REPLACE FUNCTION public.touch_tour_progress() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    new.updated_at := now();
    new.first_seen_at := old.first_seen_at;
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.transaction_allocated_sum(p_transaction uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(amount_matched), 0)
    from public.document_transaction_matches
   where transaction_id = p_transaction and status = 'confirmed';
$$;

CREATE OR REPLACE FUNCTION public.trash_eligible_tables() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select array[
    'documents', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'open_item_whitelist_rules',
    'categories', 'properties', 'companies', 'business_line', 'approvers',
    'supplier_bank_accounts'
  ];
$$;

CREATE OR REPLACE FUNCTION public.trash_purge_eligible_tables() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select array(
    select t from unnest(public.trash_eligible_tables()) as t
    where t not in ('documents', 'approvers')
  );
$$;

CREATE OR REPLACE FUNCTION public.trash_require_delete_reason() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if btrim(coalesce(new.delete_reason, '')) = '' then
    raise exception
      'A reason is required (%.%): delete_reason cannot be empty when deleting.',
      tg_table_schema, tg_table_name
      using errcode = 'check_violation',
            hint = 'Say why this record is being deleted.';
  end if;
  -- Store the trimmed value, so trailing whitespace cannot make a reason look present when it is
  -- one space long.
  new.delete_reason := btrim(new.delete_reason);
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_bank_transactions_categorize() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_category uuid;
begin
  v_category := public.resolve_transaction_category(new.id);
  if v_category is not null then
    update public.bank_transactions
       set category_id = v_category, category_source = 'rule'
     where id = new.id
       and coalesce(category_source, 'rule') <> 'human';
  end if;
  return null; -- ignored on an AFTER trigger
end $$;

CREATE OR REPLACE FUNCTION public.trg_fn_invoices_apply_rules_on_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.apply_assignment_rules(new.id, 'pipeline-intake');
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.trg_fn_invoices_vat_deductible_default() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(new.vat_deductibility_source, 'ai') = 'ai' then
    new.vat_deductible_pct := public.resolve_default_vat_deductible_pct(new.property_id);
    new.vat_deductibility_source := case when new.vat_deductible_pct is null then null else 'ai' end;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.update_datev_route_status(p_id uuid, p_is_enabled boolean, p_note text, p_updated_by text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'update_datev_route_status: authentication required' using errcode = 'insufficient_privilege';
  end if;

  select company_id into v_company from public.handover_routes where id = p_id;
  if v_company is null then
    raise exception 'update_datev_route_status: route % not found', p_id;
  end if;
  if not public.has_company_access(v_company) then
    raise exception 'update_datev_route_status: no access to this company' using errcode = 'insufficient_privilege';
  end if;

  update public.handover_routes
     set is_enabled = p_is_enabled, note = p_note, updated_by = p_updated_by, updated_at = now()
   where id = p_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.upsert_external_transactions(p_rows jsonb, p_account_id uuid DEFAULT NULL::uuid) RETURNS TABLE(inserted_count integer, updated_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_external_transactions: p_rows must be a JSON array';
  end if;

  with incoming as (
    select
      r->>'source'              as source,
      r->>'external_id'         as external_id,
      (r->>'amount')::numeric   as amount,
      r->>'currency'            as currency,
      nullif(r->>'booking_date','')::date as booking_date,
      nullif(r->>'value_date','')::date   as value_date,
      r->>'booking_text'        as booking_text,
      r->>'payment_reference'   as payment_reference,
      r->>'counterparty_holder' as counterparty_holder,
      r->>'counterparty_iban'   as counterparty_iban,
      r->>'counterparty_bic'    as counterparty_bic,
      nullif(trim(coalesce(r->>'spender_name','')),'')  as spender_name,
      nullif(trim(coalesce(r->>'spender_email','')),'') as spender_email,
      nullif(r->>'pleo_tag_id','')::uuid     as pleo_tag_id,
      nullif(r->>'pleo_account_id','')::uuid as pleo_account_id,
      coalesce((r->>'is_sandbox')::boolean, false) as is_sandbox,
      r->>'transaction_type'    as transaction_type,
      coalesce(r->>'transaction_type_source','auto') as transaction_type_source,
      coalesce(r->'raw_data','{}'::jsonb) as raw_data,
      p_account_id as account_id
    from jsonb_array_elements(p_rows) as r
  ),
  deduped as (
    select distinct on (source, external_id) *
      from incoming
     where external_id is not null and source is not null
     order by source, external_id
  ),
  upserted as (
    insert into public.bank_transactions as bt (
      source, external_id, amount, currency, booking_date, value_date,
      booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
      spender_name, spender_email, pleo_tag_id, pleo_account_id,
      is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
    )
    select source, external_id, amount, currency, booking_date, value_date,
           booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
           spender_name, spender_email, pleo_tag_id, pleo_account_id,
           is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
      from deduped
    on conflict (source, external_id) do update set
      amount              = excluded.amount,
      currency            = excluded.currency,
      booking_date        = excluded.booking_date,
      value_date          = excluded.value_date,
      booking_text        = excluded.booking_text,
      payment_reference   = excluded.payment_reference,
      counterparty_holder = excluded.counterparty_holder,
      counterparty_iban   = excluded.counterparty_iban,
      counterparty_bic    = excluded.counterparty_bic,
      spender_name        = coalesce(excluded.spender_name, bt.spender_name),
      spender_email       = coalesce(excluded.spender_email, bt.spender_email),
      -- coalesce, like spender: a manual import carries neither, and plain assignment would wipe
      -- what the Pleo sync had already established for that same transaction.
      pleo_tag_id         = coalesce(excluded.pleo_tag_id, bt.pleo_tag_id),
      pleo_account_id     = coalesce(excluded.pleo_account_id, bt.pleo_account_id),
      is_sandbox          = excluded.is_sandbox,
      transaction_type    = excluded.transaction_type,
      account_id          = coalesce(excluded.account_id, bt.account_id),
      raw_data            = coalesce(bt.raw_data, '{}'::jsonb) || excluded.raw_data
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return query select v_inserted, v_updated;
end $$;

CREATE OR REPLACE FUNCTION public.vat_reserve(p_company uuid, p_von date DEFAULT NULL::date, p_bis date DEFAULT NULL::date) RETURNS TABLE(company_id uuid, von date, bis date, input_vat_total numeric, input_vat_deductible numeric, input_vat_nondeductible numeric, input_vat_unresolved_count bigint, input_vat_unresolved_amount numeric, output_vat numeric, reserve numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with input as (
    select
      round(coalesce(sum(i.vat_amount), 0), 2)                                            as vat_total,
      round(coalesce(sum(i.vat_deductible_amount), 0), 2)                                 as vat_deductible,
      round(coalesce(sum(i.vat_nondeductible_amount), 0), 2)                              as vat_nondeductible,
      count(*) filter (where i.vat_amount is not null and i.vat_deductible_pct is null)    as unresolved_count,
      round(coalesce(sum(i.vat_amount) filter (where i.vat_deductible_pct is null), 0), 2) as unresolved_amount
      from public.documents i
     where i.deleted_at is null
       and i.archived_at is null
       and i.company_id = p_company
       and (p_von is null or i.document_date >= p_von)
       and (p_bis is null or i.document_date <= p_bis)
  ),
  output as (
    select
      round(coalesce(sum(o.amount_gross - o.amount_net), 0), 2) as vat_total
      from public.outgoing_invoices o
     where o.deleted_at is null
       and o.company_id = p_company
       and o.status not in ('draft', 'voided')
       and o.amount_gross is not null
       and o.amount_net is not null
       and (p_von is null or o.invoice_date >= p_von)
       and (p_bis is null or o.invoice_date <= p_bis)
  )
  select
    p_company,
    p_von,
    p_bis,
    input.vat_total,
    input.vat_deductible,
    input.vat_nondeductible,
    input.unresolved_count,
    input.unresolved_amount,
    output.vat_total,
    output.vat_total - input.vat_deductible
    from input, output;
$$;

commit;
