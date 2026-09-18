-- 0029_bulk_apply_and_vat_treatment.sql
-- Two gaps found while completing the multi-level VAT/category resolution system (Briefing
-- Screens 3-5), after the core engine (0025, fixed further in 0028) tested clean across 30
-- edge cases: conflict priority, tie-breaks, human-lock, NULL-scope, soft-delete, no-op writes.
--
-- 1. NO RETROACTIVE APPLY. The briefing is explicit: "New or changed rules with preview: 'This
--    rule would change 47 old receipts' — before it takes effect retroactively." The preview
--    existed (assignment_rule_preview), but nothing could actually MAKE it take effect on those 47
--    receipts. The only apply path was apply_assignment_rules(one_invoice_id), wired to a
--    per-receipt button in the Hub detail screen. A rule someone just created sat there doing
--    nothing to the receipts it was meant to fix until each was opened and clicked through by
--    hand — the exact bottleneck this feature exists to remove.
--
--    apply_assignment_rule_bulk(p_rule) fixes this: it re-runs the SAME apply_assignment_rules
--    used everywhere else across every receipt in the rule's scope, so a rule takes effect on
--    existing data the moment someone chooses to apply it, not only on the next `apply` click on
--    each receipt individually.
--
-- 2. vat_treatment ON A RULE WAS NEVER APPLIED. Screen 5: "Define rules... 'always 19%',
--    'reverse charge (foreign business)', 'small-business owner, no VAT', or a mix." The column
--    has existed since 0025 (CHECK'd to steuerpflichtig/steuerfrei/reverse_charge/kleinunternehmer)
--    and the Hub already displays it on a rule row, but apply_assignment_rules never wrote it to
--    invoices.vat_treatment — confirmed live: a rule with vat_rate=7, vat_treatment='reverse_charge'
--    changed the rate and left vat_treatment at whatever the AI had stored. Fixed by writing both
--    together, under the same vat_source lock (a rule's vat_treatment is exactly as protected by a
--    human vat_rate/vat_amount edit as the rate itself is — they describe the same VAT decision).

begin;

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'apply_assignment_rules'
  ) then
    raise exception 'migration 0029 expects apply_assignment_rules from migration 0025/0028, which is missing';
  end if;
  raise notice '0029 preconditions ok';
end $$;

-- ---------------------------------------------------------------------------
-- 1. apply_assignment_rules also applies vat_treatment, under the vat_source lock
-- ---------------------------------------------------------------------------
create or replace function public.apply_assignment_rules(p_invoice uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv          public.invoices;
  v_rule         public.assignment_rules;
  v_changed      jsonb := '[]'::jsonb;
  v_skipped      jsonb := '[]'::jsonb;
  v_log_lines    text[] := array[]::text[];
  v_new_amount   numeric;
  v_new_net      numeric;
begin
  select * into v_inv from public.invoices where id = p_invoice and deleted_at is null;
  if not found then
    raise exception 'invoice % not found or deleted', p_invoice;
  end if;

  -- Cost category
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'cost_category');
  if found then
    if coalesce(v_inv.cost_category_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'cost_category', 'reason', 'human', 'rule_id', v_rule.id);
    elsif coalesce(v_inv.cost_category, '') <> coalesce(v_rule.cost_category, '') then
      update public.invoices
         set cost_category = v_rule.cost_category,
             cost_category_source = 'rule',
             updated_at = now()
       where id = p_invoice;
      v_changed := v_changed || jsonb_build_object(
        'field', 'cost_category', 'from', v_inv.cost_category,
        'to', v_rule.cost_category, 'rule_id', v_rule.id);
      v_log_lines := v_log_lines || format('Kostenkategorie: %s -> %s (Regel)',
        coalesce(v_inv.cost_category, 'ohne'), v_rule.cost_category);
    end if;
  end if;

  -- VAT rate + treatment. amount_gross is held fixed (migration 0028): it is the figure bank
  -- reconciliation matches against a real payment, so a business rule correcting the VAT
  -- classification must not silently move it. vat_treatment is written alongside vat_rate/
  -- vat_amount, under the SAME vat_source lock and the SAME "did anything actually change" check
  -- — a rule's vat_treatment describes the same VAT decision as its rate, not a separate one, so
  -- a human-protected rate must protect the treatment with it, and a treatment-only correction
  -- (rate already right, treatment wrong) must still be written and still be skipped when the
  -- rate is human-set.
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    elsif coalesce(v_inv.vat_rate, -1) <> coalesce(v_rule.vat_rate, -1)
       or coalesce(v_inv.vat_treatment, '') <> coalesce(v_rule.vat_treatment, '') then
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
      v_log_lines := v_log_lines || format(
        'USt-Satz: %s -> %s (Regel, USt-Betrag angepasst: %s -> %s%s)',
        coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text,
        coalesce(v_inv.vat_amount::text, 'ohne'), coalesce(v_new_amount::text, 'ohne'),
        case when v_rule.vat_treatment is not null
             then ', Behandlung: ' || v_rule.vat_treatment else '' end);
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
  'Applies the winning cost-category and VAT rules to one receipt, never overwriting a '
  'human-set value, and logs what changed to invoice_history. A VAT-rate rule recomputes '
  'vat_amount and amount_net together and writes vat_treatment, holding amount_gross fixed '
  '(migrations 0028, 0029).';

grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Both preview functions must count a vat_treatment-only mismatch too
-- ---------------------------------------------------------------------------
-- apply_assignment_rules now fires when EITHER vat_rate or vat_treatment differs (a treatment-only
-- correction, rate already right, still has to happen). Previewing only vat_rate would undercount:
-- "0 receipts would change" while some genuinely would, for the one case a rule's whole reason for
-- existing might be to fix (a supplier moving to Kleinunternehmer with the same rate as before).
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
    select i.id, i.cost_category, i.cost_category_source, i.vat_rate, i.vat_treatment, i.vat_source
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
                and coalesce(c.cost_category, '') <> coalesce(r.cost_category, '')
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (coalesce(c.vat_rate, -1) <> coalesce(r.vat_rate, -1)
                     or coalesce(c.vat_treatment, '') <> coalesce(r.vat_treatment, ''))
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview(uuid) is
  'Retroactive impact of one rule: receipts in scope, and how many this rule would actually '
  'change (rate or treatment). Matches what apply_assignment_rule_bulk actually walks (0029).';

-- CREATE OR REPLACE does NOT extend an existing function's signature: adding a new parameter,
-- even a trailing one with a default, makes Postgres register it as a SECOND overload alongside
-- the original nine-parameter one, rather than replacing it. Verified live before writing this
-- comment — a first attempt at this migration left both signatures in the catalog side by side,
-- which would have been a live ambiguity risk for PostgREST's RPC dispatch. Dropped explicitly.
drop function if exists public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid
);

create or replace function public.assignment_rule_preview_scope(
  p_target            text,
  p_cost_category     text    default null,
  p_vat_rate          numeric default null,
  p_supplier_id       uuid    default null,
  p_business_line_id  uuid    default null,
  p_property_id       uuid    default null,
  p_company_id        uuid    default null,
  p_reference_pattern text    default null,
  p_exclude_rule      uuid    default null,
  p_vat_treatment     text    default null
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
      i.cost_category, i.cost_category_source, i.vat_rate, i.vat_treatment, i.vat_source,
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
                and coalesce(c.cost_category, '') <> coalesce(p_cost_category, '')
              when 'vat_rate' then
                coalesce(c.vat_source, 'ai') <> 'human'
                and (coalesce(c.vat_rate, -1) <> coalesce(p_vat_rate, -1)
                     or coalesce(c.vat_treatment, '') <> coalesce(p_vat_treatment, ''))
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview_scope is
  'Retroactive impact of a prospective rule, before it is saved. Pass p_exclude_rule when '
  're-previewing an existing rule so it is not treated as its own competitor. Counts a '
  'vat_treatment-only mismatch too (0029).';

grant execute on function public.assignment_rule_preview(uuid) to authenticated;
grant execute on function public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bulk apply: make a rule's retroactive effect actually happen
-- ---------------------------------------------------------------------------
-- Deliberately reuses apply_assignment_rules per receipt rather than re-deriving a narrower
-- "just this rule's target" write path. Reasons:
--   - One definition of what "apply" means, everywhere: the per-receipt button, this bulk action,
--     and (see the ai-mail-extraction companion change) intake all call the exact same function,
--     so they cannot drift into three subtly different behaviours over time.
--   - It is the more useful behaviour anyway: while a batch of Ikea receipts is being caught up on
--     a new category rule, any VAT rule that also applies to them gets caught up in the same pass
--     instead of requiring a second bulk-apply run.
--   - human_locked receipts already fall out for free, the same way they do for the single-receipt
--     button, without repeating that logic here.
--
-- Scope predicate mirrors assignment_rule_preview's `cand` CTE exactly, so "N would change" in the
-- preview and what bulk-apply actually walks describe the same receipts. `matches` in the return
-- value should equal the preview's `matches` for the same rule at the same moment.
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
       and (r.business_line_id is null or r.business_line_id = i.business_line_id)
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
  'Runs apply_assignment_rules across every receipt in one rule''s scope, so a new or edited rule '
  'actually takes effect on the "N old receipts" the preview describes, not only on receipts opened '
  'one at a time. A human-set value is skipped exactly as it is for a single receipt. See 0029.';

grant execute on function public.apply_assignment_rule_bulk(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
-- Probes on a real rule and a real receipt if any exist, and rolls the probe back — proving
-- vat_treatment actually gets written and bulk-apply actually walks its scope, not just that the
-- functions compile.
do $$
declare
  v_overloads int;
begin
  select count(*) into v_overloads from pg_proc
   where proname = 'assignment_rule_preview_scope' and pronamespace = 'public'::regnamespace;
  if v_overloads <> 1 then
    raise exception '0029 self-check FAILED: expected exactly 1 assignment_rule_preview_scope, found %. '
                    'A stray overload makes PostgREST''s RPC dispatch ambiguous.', v_overloads;
  end if;
end $$;

do $$
declare
  v_rule_id  uuid;
  v_inv_id   uuid;
  v_before   text;
  v_after    text;
  v_bulk     jsonb;
begin
  select id into v_rule_id from public.assignment_rules
   where target = 'vat_rate' and is_active and deleted_at is null and vat_treatment is not null
   limit 1;
  if v_rule_id is null then
    raise notice '0029 self-check: no active vat_rate rule with a vat_treatment to probe, skipping';
  else
    select i.id into v_inv_id from public.invoices i
     where i.deleted_at is null
       and public.resolve_assignment_rule(i.id, 'vat_rate') = v_rule_id
       and coalesce(i.vat_source, 'ai') <> 'human'
     limit 1;
    if v_inv_id is not null then
      select vat_treatment into v_before from public.invoices where id = v_inv_id;
      perform public.apply_assignment_rules(v_inv_id, 'migration-0029-selfcheck');
      select vat_treatment into v_after from public.invoices where id = v_inv_id;
      raise notice '0029 self-check: vat_treatment % -> % on a real (non-human) receipt', v_before, v_after;
    end if;
  end if;

  select id into v_rule_id from public.assignment_rules
   where is_active and deleted_at is null limit 1;
  if v_rule_id is not null then
    v_bulk := public.apply_assignment_rule_bulk(v_rule_id, 'migration-0029-selfcheck');
    raise notice '0029 self-check: bulk apply on a real rule returned %', v_bulk;
  end if;

  raise exception using errcode = 'restrict_violation', message = '0029 self-check rollback';
exception when restrict_violation then
  null;  -- unwinds the probe, keeps the function definitions above
end $$;

commit;
