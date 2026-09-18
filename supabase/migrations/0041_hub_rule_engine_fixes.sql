-- 0028_rule_engine_fixes.sql
-- Two correctness fixes in the rule engine (migration 0025), found in code review:
--
-- 1. reference_pattern is concatenated straight into an ILIKE pattern in three functions
--    (resolve_assignment_rule, assignment_rule_preview, assignment_rule_preview_scope). ILIKE
--    treats '_' as "any one character" and '%' as "anything", and payment references routinely
--    contain underscores (e.g. "MIETE_JAN_2026"), so a rule pattern typed as ordinary text silently
--    matches more receipts than the user meant, and the preview count agrees with the wrong scope
--    because it runs the identical unescaped expression. There is no way for the user to notice
--    before committing.
--
-- 2. apply_assignment_rules writes vat_rate (and stamps vat_source='rule') without touching
--    vat_amount, so a rule that corrects a misread rate leaves the row internally contradictory:
--    the rate says one percentage, the amount still reflects the old one, and amount_net + vat_amount
--    no longer equals amount_gross. That inconsistent pair is what gets booked and exported.
--
--    The fix recomputes vat_amount AND amount_net together, holding amount_gross fixed rather than
--    recomputing it. amount_gross is the one figure bank reconciliation matches against a real
--    payment (migration 0024); a business rule correcting the VAT classification must not silently
--    move the amount a bank transaction is compared to. Standard VAT-inclusive back-calculation:
--    vat_amount = gross * rate / (100 + rate), net = gross - vat_amount.

begin;

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resolve_assignment_rule'
  ) then
    raise exception 'migration 0028 expects resolve_assignment_rule from migration 0025, which is missing';
  end if;
  raise notice '0028 preconditions ok';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Escape ILIKE metacharacters in a user-typed pattern
-- ---------------------------------------------------------------------------
-- Backslash is Postgres's default LIKE/ILIKE escape character, so escaping a literal backslash
-- first (before introducing new ones) keeps the result meaning exactly the input text, verbatim.
create or replace function public.escape_ilike_pattern(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

comment on function public.escape_ilike_pattern(text) is
  'Escapes \, % and _ so a user-typed reference_pattern is matched as literal text in an ILIKE '
  '''%...%'' expression, not as a wildcard pattern. See migration 0028.';

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
     and (r.business_line_id is null or r.business_line_id = i.business_line_id)
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
  'The winning rule for one receipt and one target, most specific first. NULL when no rule matches. '
  'reference_pattern is matched as literal text (migration 0028).';

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
    select i.id, i.cost_category, i.cost_category_source, i.vat_rate, i.vat_source
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
                and coalesce(c.vat_rate, -1) <> coalesce(r.vat_rate, -1)
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview(uuid) is
  'Retroactive impact of one rule: receipts in scope, and how many this rule would actually change. '
  'reference_pattern is matched as literal text (migration 0028).';

-- Defensive against being re-applied AFTER a later migration that changed this function's
-- signature (this repo's apply_migration.py runs whatever file it is given, in whatever order,
-- with no applied-migration tracking of its own — see its docstring). Without this, re-running
-- 0028 on a database where migration 0029 already added a 10th parameter would create a SECOND,
-- 9-parameter overload alongside the 10-parameter one, which is the exact ambiguous-RPC-dispatch
-- bug 0029 exists to prevent, just re-introduced from the other direction. A no-op when only
-- 0028's own 9-parameter version is present.
drop function if exists public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid, text
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
  p_exclude_rule      uuid    default null
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
      i.cost_category, i.cost_category_source, i.vat_rate, i.vat_source,
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
                and coalesce(c.vat_rate, -1) <> coalesce(p_vat_rate, -1)
              else false
            end
    )::bigint
    from cand c;
end $$;

comment on function public.assignment_rule_preview_scope is
  'Retroactive impact of a prospective rule, before it is saved. Pass p_exclude_rule when '
  're-previewing an existing rule so it is not treated as its own competitor. reference_pattern is '
  'matched as literal text (migration 0028).';

grant execute on function public.escape_ilike_pattern(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. apply_assignment_rules: keep vat_rate and vat_amount consistent
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

  -- VAT rate. amount_gross is held fixed: it is the figure bank reconciliation (migration 0024)
  -- matches against a real payment, and a business rule correcting the VAT classification must not
  -- silently move the number a bank transaction is compared to. vat_amount and amount_net are
  -- recomputed together so the row stays internally consistent: net + vat_amount = gross, and
  -- vat_amount = gross * rate / (100 + rate) is the standard VAT-inclusive back-calculation.
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    elsif coalesce(v_inv.vat_rate, -1) <> coalesce(v_rule.vat_rate, -1) then
      if v_inv.amount_gross is not null and v_rule.vat_rate is not null then
        v_new_amount := round(v_inv.amount_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), 2);
        v_new_net    := v_inv.amount_gross - v_new_amount;
      else
        -- No gross to back-calculate from (or the rule clears the rate to null): fall back to the
        -- old formula, forward from the current net. This is the pre-0028 behaviour, kept only for
        -- the case the new one cannot compute.
        v_new_net    := v_inv.amount_net;
        v_new_amount := case when v_rule.vat_rate is null then null
                             else round(coalesce(v_inv.amount_net, 0) * v_rule.vat_rate / 100, 2) end;
      end if;

      update public.invoices
         set vat_rate = v_rule.vat_rate,
             vat_amount = v_new_amount,
             amount_net = v_new_net,
             vat_source = 'rule',
             updated_at = now()
       where id = p_invoice;
      v_changed := v_changed || jsonb_build_object(
        'field', 'vat_rate', 'from', v_inv.vat_rate, 'to', v_rule.vat_rate, 'rule_id', v_rule.id)
        || jsonb_build_object(
        'field', 'vat_amount', 'from', v_inv.vat_amount, 'to', v_new_amount, 'rule_id', v_rule.id);
      v_log_lines := v_log_lines || format('USt-Satz: %s -> %s (Regel, USt-Betrag angepasst: %s -> %s)',
        coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text,
        coalesce(v_inv.vat_amount::text, 'ohne'), coalesce(v_new_amount::text, 'ohne'));
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
  'vat_amount and amount_net together, holding amount_gross fixed (migration 0028).';

grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check: the escape actually defeats the wildcards, and round-trips ordinary text
-- ---------------------------------------------------------------------------
do $$
begin
  if not ('MIETE_JAN' ilike '%' || public.escape_ilike_pattern('MIETE_JAN') || '%') then
    raise exception '0028 self-check FAILED: escaped pattern must still match its own literal text';
  end if;
  if 'MIETEXJAN' ilike '%' || public.escape_ilike_pattern('MIETE_JAN') || '%' then
    raise exception '0028 self-check FAILED: underscore still acts as a wildcard after escaping';
  end if;
  if 'anything at all' ilike '%' || public.escape_ilike_pattern('%') || '%' then
    raise exception '0028 self-check FAILED: percent still acts as a wildcard after escaping';
  end if;
  if public.escape_ilike_pattern('miete2026') <> 'miete2026' then
    raise exception '0028 self-check FAILED: plain text without metacharacters must round-trip unchanged';
  end if;
  raise notice '0028 self-check ok: reference_pattern is matched as literal text';
end $$;

do $$
declare
  v_overloads int;
begin
  select count(*) into v_overloads from pg_proc
   where proname = 'assignment_rule_preview_scope' and pronamespace = 'public'::regnamespace;
  if v_overloads <> 1 then
    raise exception '0028 self-check FAILED: expected exactly 1 assignment_rule_preview_scope, found %. '
                    'A stray overload makes PostgREST''s RPC dispatch ambiguous.', v_overloads;
  end if;
end $$;

commit;
