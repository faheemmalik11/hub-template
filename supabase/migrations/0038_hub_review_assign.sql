-- 0025_review_assign.sql
-- Briefing Screen 3 ("Check & assign uncertain receipts") plus the rule parts of Screen 4
-- (categories & rules) and Screen 5 (VAT rules).
--
-- What this migration establishes:
--   1. Field provenance. Every resolved value records WHERE it came from: 'ai', 'rule' or
--      'human'. This is the only way to honour the briefing's hard rule "a human beats the AI:
--      what someone has assigned by hand may never be overwritten by an automatic rule".
--   2. Review lifecycle. "Not relevant" hands the receipt back to the mailbox and "archive"
--      parks a wrongly ingested one with a warning note. Neither hard-deletes anything (GoBD:
--      do not hard-delete receipts, only deactivate and keep history).
--   3. Multi-level assignment rules. One rule can pin any combination of supplier, business
--      line, property and company (plus a payment-reference pattern). The most specific match
--      wins, with a deterministic tie-break.
--   4. Mailbox settings, so the "Processed" folder is configurable instead of assumed.
--   5. Per-company access foundations, so the later users-and-permissions feature is a policy
--      swap rather than a rebuild.
--
-- IMPORTANT, live schema naming: an unversioned migration (somewhere in the 0017..0022 range,
-- whose files are not in this repo) renamed the tables from German to English. The live names
-- are `invoices`, `invoice_history`, `companies`, `properties`, `suppliers`, `business_line`
-- and `property_assignment`. `supabase/schema.sql` still shows the older German snapshot and is
-- stale. This migration targets the LIVE English names, verified by probing PostgREST.
--
-- Idempotent throughout: `if not exists`, `drop policy if exists`, and lookup-driven `do` blocks
-- so it is safe to run more than once.
--
-- This migration does NOT change any existing RLS policy and does NOT redefine
-- `v_invoices_list`. Both are deliberate: the access helpers below are foundations that today
-- resolve to "everyone sees everything", exactly as now, and archived receipts are filtered in
-- the query layer instead of by rebuilding a view whose live definition this repo does not hold.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
--
-- This migration builds on tables it does not own: the renamed core tables and two that were
-- created outside this repo (app_users, user_company_access). The first attempt at this migration
-- failed halfway through because it assumed a column name on one of them, and the error surfaced
-- as a bare 42703 pointing at a caret inside a function body.
--
-- Checking the assumptions up front turns that into one readable message naming the exact object,
-- before anything has been created. Everything runs inside the surrounding transaction, so a
-- failure here leaves the database untouched.
do $$
declare
  v_missing text[] := array[]::text[];
  v_name    text;
begin
  -- Relations this migration reads or references.
  foreach v_name in array array[
    'invoices', 'invoice_history', 'companies', 'properties', 'suppliers',
    'business_line', 'property_assignment', 'app_users', 'v_invoices_list'
  ]
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = v_name
    ) then
      v_missing := v_missing || ('relation public.' || v_name);
    end if;
  end loop;

  -- Columns this migration depends on by name.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='app_users' and column_name='is_active')
  then v_missing := v_missing || 'column app_users.is_active'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='app_users' and column_name='email')
  then v_missing := v_missing || 'column app_users.email'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoices' and column_name='assignment_source')
  then v_missing := v_missing || 'column invoices.assignment_source'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoices' and column_name='business_line_id')
  then v_missing := v_missing || 'column invoices.business_line_id'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoice_history' and column_name='invoice_id')
  then v_missing := v_missing || 'column invoice_history.invoice_id'; end if;

  -- user_company_access may legitimately not exist yet (this migration creates it). But if it does
  -- exist, it was created elsewhere and has to carry the columns has_company_access reads.
  if exists (select 1 from information_schema.tables
              where table_schema='public' and table_name='user_company_access')
  then
    foreach v_name in array array['user_id', 'company_id', 'can_view', 'deleted_at']
    loop
      if not exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'user_company_access'
           and column_name = v_name
      ) then
        v_missing := v_missing || ('column user_company_access.' || v_name);
      end if;
    end loop;
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'migration 0025 preconditions not met, missing: %. The live schema differs from what this '
      'migration expects, so it is stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;

  raise notice '0025 preconditions ok';
end $$;

-- ===========================================================================
-- 1. Field provenance on invoices
-- ===========================================================================

-- Where the applied VAT rate and cost category came from. NULL means "not recorded", which the
-- resolver treats as overwritable (the ingestion pipeline writes values without a source, so a
-- missing source must not lock a value against rules).
alter table public.invoices
  add column if not exists vat_source text,
  add column if not exists cost_category_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_vat_source_check'
  ) then
    alter table public.invoices add constraint invoices_vat_source_check
      check (vat_source is null or vat_source in ('ai', 'rule', 'human'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and conname = 'invoices_cost_category_source_check'
  ) then
    alter table public.invoices add constraint invoices_cost_category_source_check
      check (cost_category_source is null or cost_category_source in ('ai', 'rule', 'human'));
  end if;
end $$;

comment on column public.invoices.vat_source is
  'Provenance of vat_rate/vat_amount: ai | rule | human. A human value is never overwritten by a rule.';
comment on column public.invoices.cost_category_source is
  'Provenance of cost_category: ai | rule | human. A human value is never overwritten by a rule.';

-- `assignment_source` already exists in the live DB, added by one of the unversioned pipeline
-- migrations. Its vocabulary is unknown to this repo, so widen rather than replace.
--
-- The vocabulary is collected from BOTH sources, and the existing CHECK is the important one: a
-- value the pipeline is coded to write may legitimately not appear in any row yet, so reading
-- only the table's distinct values would quietly narrow the constraint and break that write later.
-- Reading the literals out of the constraint definition catches those too. The notice records the
-- resulting vocabulary in the `db push` output, so what happened is visible rather than assumed.
do $$
declare
  v_con  text;
  v_def  text;
  v_lit  text;
  v_vals text[] := array['ai', 'rule', 'human'];
begin
  for v_con, v_def in
    select conname, pg_get_constraintdef(oid)
      from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%assignment_source%'
  loop
    raise notice 'assignment_source: replacing check % (%)', v_con, v_def;
    -- Every single-quoted literal in the definition. A `::text` cast carries no quotes, so the
    -- cast type is not picked up as a value.
    for v_lit in select (regexp_matches(v_def, '''([^'']*)''', 'g'))[1] loop
      -- A constraint written as `= any ('{a,b,c}'::text[])` yields the whole array literal as ONE
      -- match, so it has to be split back out. Without this the values inside would be swallowed
      -- into a single nonsense entry and the real vocabulary would be silently narrowed.
      if v_lit like '{%}' then
        v_vals := array(
          select distinct x from unnest(v_vals || string_to_array(btrim(v_lit, '{}'), ',')) x
           where btrim(x) <> ''
        );
      elsif not (v_lit = any (v_vals)) then
        v_vals := v_vals || v_lit;
      end if;
    end loop;
    execute format('alter table public.invoices drop constraint %I', v_con);
  end loop;

  for v_lit in
    select distinct assignment_source from public.invoices where assignment_source is not null
  loop
    if not (v_lit = any (v_vals)) then
      v_vals := v_vals || v_lit;
    end if;
  end loop;

  raise notice 'assignment_source: allowed vocabulary is now %', v_vals;

  -- Emitted as an explicit `in (...)` list, NOT as `= any('{...}'::text[])`. Postgres stores the
  -- former as individually quoted literals, so re-running this migration parses its own output
  -- back correctly. The array form stores one blob literal that the parser above would have to
  -- take apart, and getting that wrong quietly drops values from the vocabulary.
  execute format(
    'alter table public.invoices add constraint invoices_assignment_source_check
       check (assignment_source is null or assignment_source in (%s))',
    (select string_agg(quote_literal(btrim(x)), ', ' order by btrim(x)) from unnest(v_vals) x)
  );
end $$;

comment on column public.invoices.assignment_source is
  'Provenance of the company/property/business-line assignment: ai | rule | human (plus any '
  'legacy pipeline values preserved by migration 0025).';

-- ===========================================================================
-- 2. Review lifecycle: not relevant, archived
-- ===========================================================================
--
-- Briefing Screen 3:
--   "Mark a receipt as 'not relevant': it drops out of processing and reappears in the mail
--    inbox, so that it does not get lost there."
--   "Archive a wrongly ingested receipt: with a warning note to the responsible person."
--
-- The Hub can only record the decision. Physically moving the mail back into the inbox (reset
-- the label / mark unread) is a write against the real mailbox and lives in the external Python
-- ingestion pipeline, not in this repo. `mailbox_reset_at` is the handshake: the pipeline picks
-- up rows where not_relevant_at is set and mailbox_reset_at is still null, performs the move,
-- and stamps mailbox_reset_at. Until it does, the UI reports the return as pending, so nobody is
-- told the mail is back in the inbox when it is not.
alter table public.invoices
  add column if not exists not_relevant_at   timestamptz,
  add column if not exists not_relevant_by   text,
  add column if not exists not_relevant_note text,
  add column if not exists mailbox_reset_at  timestamptz,
  add column if not exists archived_at       timestamptz,
  add column if not exists archived_by       text,
  add column if not exists archive_note      text;

comment on column public.invoices.mailbox_reset_at is
  'Set by the external ingestion pipeline once the mail has actually been moved back into the '
  'inbox. NULL while not_relevant_at is set means the return is still pending.';
comment on column public.invoices.archive_note is
  'The warning note shown to the responsible person: we are archiving this, take care of it '
  'elsewhere, nothing further happens in the system.';

-- Partial indexes: both states are rare, so the queue queries ("show me the archive",
-- "which returns are still pending") only need the small matching subset.
create index if not exists idx_invoices_not_relevant
  on public.invoices (not_relevant_at desc) where not_relevant_at is not null;

create index if not exists idx_invoices_archived
  on public.invoices (archived_at desc) where archived_at is not null;

create index if not exists idx_invoices_mailbox_return_pending
  on public.invoices (not_relevant_at) where not_relevant_at is not null and mailbox_reset_at is null;

-- Everyday lists exclude archived receipts, which means they filter on `archived_at is null`
-- alongside the existing `deleted_at is null`. Index that combination.
create index if not exists idx_invoices_active
  on public.invoices (created_at desc) where deleted_at is null and archived_at is null;

-- ---------------------------------------------------------------------------
-- Widen the workflow_status check with the two missing side paths (Appendix A6)
-- ---------------------------------------------------------------------------
-- A6 names three side paths off the main chain: Rückfrage (already present), Abgelehnt and
-- Nicht relevant. Both missing values are added here.
--
-- Deliberately NOT added: the payment-side statuses A6 also lists ('zur Zahlung freigegeben',
-- 'bezahlt'). This app models paid as a separate signal (paid_at + paid_source, see migration
-- 0024) rather than as a workflow value, and mixing the two would give a receipt two
-- contradictory sources of truth for whether it is paid. Revisit only together with the
-- approval-workflow screen (Screen 6).
do $$
declare
  v_con text;
begin
  for v_con in
    select conname
      from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%workflow_status%'
  loop
    raise notice 'replacing workflow_status check: %', v_con;
    execute format('alter table public.invoices drop constraint %I', v_con);
  end loop;

  alter table public.invoices add constraint invoices_workflow_status_check
    check (workflow_status in (
      'eingegangen',
      'in_pruefung',
      'rueckfrage',
      'freigegeben_assistenz',
      'freigegeben_vorgesetzter',
      'uebergeben_datev',
      'abgeschlossen',
      'abgelehnt',
      'nicht_relevant'
    ));
end $$;

-- ===========================================================================
-- 3. Multi-level assignment rules
-- ===========================================================================
--
-- Briefing Screen 4: "Supplier X -> always category Y", refinable, "a supplier can have several
-- categories, so a rule must be refinable, not just supplier = one category".
-- Briefing Screen 5: VAT rules per company, per project and per supplier, and "VAT hangs on the
-- business line, not only on the property".
--
-- One table serves both, because both need the same "most specific wins" ladder. A rule pins any
-- combination of the four dimensions; an unpinned dimension means "any".

-- The priority formula, as ONE definition. It is needed in two places (the stored column on the
-- table, and the preview for a rule that does not exist yet), and two hand-copied arithmetic
-- expressions would drift the moment anyone reweights a dimension.
--
-- Primary key is HOW MANY dimensions the rule pins, so a rule pinning supplier + property always
-- beats one pinning supplier alone. The weights only break ties between rules of equal width, in
-- the order the client named: supplier, business line, property, company, with the reference
-- pattern ranked highest because it is the narrowest possible qualifier. 32 exceeds the maximum
-- weight sum (16+8+4+2+1 = 31), so the dimension count can never be outvoted by the tie-break.
--
-- IMMUTABLE because a generated column may only call immutable functions. The consequence is that
-- changing this formula does NOT recompute already-stored values: a reweighting has to be followed
-- by a forced rewrite of assignment_rules.specificity in the same migration.
create or replace function public.assignment_rule_specificity(
  p_reference_pattern text,
  p_supplier_id       uuid,
  p_business_line_id  uuid,
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
      + (case when p_business_line_id  is not null then 1 else 0 end)
      + (case when p_property_id       is not null then 1 else 0 end)
      + (case when p_company_id        is not null then 1 else 0 end)
    )
    + (case when p_reference_pattern is not null then 16 else 0 end)
    + (case when p_supplier_id       is not null then  8 else 0 end)
    + (case when p_business_line_id  is not null then  4 else 0 end)
    + (case when p_property_id       is not null then  2 else 0 end)
    + (case when p_company_id        is not null then  1 else 0 end);
$$;

create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),

  -- What the rule decides. One target per rule so the resolution ladder stays independent per
  -- field: a supplier-level category rule must not drag its VAT rate along.
  target text not null check (target in ('cost_category', 'vat_rate')),

  -- The value applied when this rule wins. Exactly the one matching `target` is used.
  cost_category text,
  vat_rate      numeric,
  -- Optional qualifier carried alongside a VAT rate, for the cases the rate alone cannot express
  -- (reverse charge, small-business owner). Informational for now; surfaced on the receipt.
  vat_treatment text check (
    vat_treatment is null
    or vat_treatment in ('steuerpflichtig', 'steuerfrei', 'reverse_charge', 'kleinunternehmer')
  ),

  -- Scope. NULL on a dimension means "any".
  supplier_id      uuid references public.suppliers(id) on delete cascade,
  business_line_id uuid references public.business_line(id) on delete cascade,
  property_id      uuid references public.properties(id) on delete cascade,
  company_id       uuid references public.companies(id) on delete cascade,
  -- Briefing Screen 4: the "create as rule" button suggests "supplier (+ possibly payment
  -- reference) -> category". Matched case-insensitively as a substring of payment_reference.
  reference_pattern text,

  -- Generated and stored, so ordering by it is index-backed and cannot drift from the scope
  -- columns the way an application-maintained integer would. Formula lives in one place, see
  -- assignment_rule_specificity above.
  specificity int generated always as (
    public.assignment_rule_specificity(
      reference_pattern, supplier_id, business_line_id, property_id, company_id
    )
  ) stored,

  is_active boolean not null default true,
  note      text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Soft delete only. A rule that shaped past assignments has to stay auditable.
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text,

  -- A rule must pin at least one dimension. Without this a single all-NULL row would silently
  -- become a catch-all that overrides the AI on every receipt in the system.
  constraint assignment_rules_scope_not_empty check (
    supplier_id is not null
    or business_line_id is not null
    or property_id is not null
    or company_id is not null
    or reference_pattern is not null
  ),

  -- The value for the chosen target must actually be present, otherwise the rule "wins" and then
  -- applies nothing.
  constraint assignment_rules_value_present check (
    (target = 'cost_category' and cost_category is not null)
    or (target = 'vat_rate' and vat_rate is not null)
  )
);

-- Resolution reads by target and orders by specificity; the partial index matches that shape and
-- skips inactive and soft-deleted rules entirely.
create index if not exists idx_assignment_rules_resolve
  on public.assignment_rules (target, specificity desc)
  where is_active and deleted_at is null;

create index if not exists idx_assignment_rules_supplier
  on public.assignment_rules (supplier_id) where supplier_id is not null;

-- Same scope + same target twice would make the winner depend on row order. Deduplicate on the
-- full scope tuple, treating NULL as its own value (that is what `nulls not distinct` gives us).
create unique index if not exists assignment_rules_scope_unique
  on public.assignment_rules (
    target, supplier_id, business_line_id, property_id, company_id, lower(btrim(reference_pattern))
  ) nulls not distinct
  where deleted_at is null;

alter table public.assignment_rules enable row level security;

drop policy if exists "assignment_rules_read" on public.assignment_rules;
create policy "assignment_rules_read" on public.assignment_rules
  for select to authenticated using (true);

drop policy if exists "assignment_rules_insert" on public.assignment_rules;
create policy "assignment_rules_insert" on public.assignment_rules
  for insert to authenticated with check (true);

-- No delete policy: rules are soft-deleted (an UPDATE setting deleted_at), never removed.
drop policy if exists "assignment_rules_update" on public.assignment_rules;
create policy "assignment_rules_update" on public.assignment_rules
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Resolution: which rule wins for one receipt
-- ---------------------------------------------------------------------------
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
     -- Every pinned dimension must match. An unpinned one matches anything.
     and (r.supplier_id      is null or r.supplier_id      = i.supplier_id)
     and (r.business_line_id is null or r.business_line_id = i.business_line_id)
     and (r.property_id      is null or r.property_id      = i.property_id)
     and (r.company_id       is null or r.company_id       = i.company_id)
     and (
       r.reference_pattern is null
       or coalesce(i.payment_reference, '') ilike '%' || r.reference_pattern || '%'
     )
   -- created_at breaks a remaining tie in favour of the newer rule, so re-teaching the system
   -- works by adding a rule rather than by hunting down the old one.
   order by r.specificity desc, r.created_at desc
   limit 1;
$$;

comment on function public.resolve_assignment_rule(uuid, text) is
  'The winning rule for one receipt and one target, most specific first. NULL when no rule matches.';

-- ---------------------------------------------------------------------------
-- Apply the winning rules to one receipt
-- ---------------------------------------------------------------------------
-- Returns what it changed, so the caller can report it instead of guessing. A human-set value is
-- skipped, which is the briefing's non-negotiable rule. A NULL source counts as overwritable:
-- the ingestion pipeline writes extracted values without a source, and treating those as locked
-- would stop rules from ever taking effect on the existing data set.
create or replace function public.apply_assignment_rules(p_invoice uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv       public.invoices;
  v_rule      public.assignment_rules;
  v_changed   jsonb := '[]'::jsonb;
  v_skipped   jsonb := '[]'::jsonb;
  v_log_lines text[] := array[]::text[];
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
      -- Persisted audit text is always German, matching the rest of invoice_history.
      v_log_lines := v_log_lines || format('Kostenkategorie: %s -> %s (Regel)',
        coalesce(v_inv.cost_category, 'ohne'), v_rule.cost_category);
    end if;
  end if;

  -- VAT rate
  select * into v_rule
    from public.assignment_rules
   where id = public.resolve_assignment_rule(p_invoice, 'vat_rate');
  if found then
    if coalesce(v_inv.vat_source, 'ai') = 'human' then
      v_skipped := v_skipped || jsonb_build_object(
        'field', 'vat_rate', 'reason', 'human', 'rule_id', v_rule.id);
    elsif coalesce(v_inv.vat_rate, -1) <> coalesce(v_rule.vat_rate, -1) then
      update public.invoices
         set vat_rate = v_rule.vat_rate,
             vat_source = 'rule',
             updated_at = now()
       where id = p_invoice;
      v_changed := v_changed || jsonb_build_object(
        'field', 'vat_rate', 'from', v_inv.vat_rate,
        'to', v_rule.vat_rate, 'rule_id', v_rule.id);
      v_log_lines := v_log_lines || format('USt-Satz: %s -> %s (Regel)',
        coalesce(v_inv.vat_rate::text, 'ohne'), v_rule.vat_rate::text);
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
  'human-set value, and logs what changed to invoice_history.';

-- ---------------------------------------------------------------------------
-- Preview: how many receipts a rule would change
-- ---------------------------------------------------------------------------
-- Briefing Screen 4: "New or changed rules with preview: 'This rule would change 47 old
-- receipts' before it takes effect retroactively."
--
-- `matches` counts every receipt in the rule's scope; `would_change` counts only those where
-- this rule actually wins, the value differs, and no human has set it. The difference between
-- the two numbers is itself informative: it shows how much of the scope is already correct or
-- already decided by a person.
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
         or coalesce(i.payment_reference, '') ilike '%' || r.reference_pattern || '%'
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
  'Retroactive impact of one rule: receipts in scope, and how many this rule would actually change.';

-- Same preview, but for a rule that does not exist yet. The briefing wants the impact shown
-- BEFORE a rule takes effect retroactively, and the id-based function above cannot do that
-- because there is no row to point at while the user is still filling in the dialog.
--
-- `p_exclude_rule` covers the edit case: when re-previewing an existing rule, that rule must be
-- left out of the "who currently wins" comparison, or it would count as its own competitor and
-- report zero changes.
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
      -- Specificity of the rule that wins for this receipt today. Compared against the
      -- prospective rule's own specificity, which is how "would this one take over" is decided
      -- without inserting anything.
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
             or coalesce(i.payment_reference, '') ilike '%' || r.reference_pattern || '%'
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
         or coalesce(i.payment_reference, '') ilike '%' || p_reference_pattern || '%'
       )
  )
  select
    count(*)::bigint,
    count(*) filter (
      -- Equal specificity means the identical scope shape, which the unique index only permits
      -- when it is the same rule being edited and therefore already excluded above. So <= is
      -- correct here and matches resolve_assignment_rule preferring the newer row on a tie.
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
  're-previewing an existing rule so it is not treated as its own competitor.';

grant execute on function public.assignment_rule_specificity(text, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.resolve_assignment_rule(uuid, text) to authenticated;
grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;
grant execute on function public.assignment_rule_preview(uuid) to authenticated;
grant execute on function public.assignment_rule_preview_scope(
  text, text, numeric, uuid, uuid, uuid, uuid, text, uuid
) to authenticated;

-- ===========================================================================
-- 3b. List view that actually exposes the current columns
-- ===========================================================================
--
-- `v_invoices_list` is defined as `select b.*, ...`, and Postgres freezes that column list at
-- creation time. Verified against the live database: the view exposes neither the columns this
-- migration adds nor several that already existed on the table, namely
--   archived_at, not_relevant_at, mailbox_reset_at  (this migration)
--   business_line_id, business_line_code, assignment_source  (unversioned pipeline migration)
--   paid_source  (migration 0024)
--   source_document_id, page_range  (pipeline split migration)
-- So filtering the list on `archived_at` would fail with 42703 and take the whole invoice list
-- screen down with it.
--
-- Wrapping rather than rebuilding is deliberate. The live definition of v_invoices_list is NOT in
-- this repo (it was last recreated by one of the unversioned 0017..0022 migrations), so dropping
-- and recreating it means reconstructing computed columns like issuer_sort and review_score from
-- guesswork, and silently losing anything those migrations added. A wrapper leaves the existing
-- view untouched, so nothing that already reads it can break.
--
-- The added columns are computed by DIFFERENCE against the inner view rather than hardcoded.
-- Hardcoding them would fail with "column specified more than once" the moment someone recreates
-- v_invoices_list (which has already happened at least twice in this project's history, once
-- without leaving a migration file behind). This way the wrapper adds exactly what is missing,
-- whatever that turns out to be.
--
-- Dropped and recreated rather than CREATE OR REPLACE, because replace cannot change a view's
-- column list and the whole point here is that the column list depends on the inner view.
-- security_invoker keeps RLS evaluated as the calling user, matching the inner view.
drop view if exists public.v_invoices_review;

do $$
declare
  v_extra text;
begin
  select string_agg(format('i.%I', want.c), ', ' order by want.c) into v_extra
    from (values
      ('archived_at'), ('not_relevant_at'), ('not_relevant_by'), ('not_relevant_note'),
      ('mailbox_reset_at'), ('business_line_id'), ('business_line_code'),
      ('assignment_source'), ('vat_source'), ('cost_category_source'),
      ('paid_source'), ('source_document_id'), ('page_range')
    ) as want(c)
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'v_invoices_list'
        and column_name = want.c
   );

  raise notice 'v_invoices_review adds the columns v_invoices_list is frozen without: %',
    coalesce(v_extra, '(none, the inner view is already current)');

  -- Inner join on the primary key, so this can neither fan rows out nor drop any: every inner-view
  -- row comes from exactly one invoices row.
  execute format(
    'create view public.v_invoices_review with (security_invoker = on) as
     select v.*%s
       from public.v_invoices_list v
       join public.invoices i on i.id = v.id',
    case when v_extra is null then '' else ', ' || v_extra end
  );
end $$;

comment on view public.v_invoices_review is
  'v_invoices_list plus the invoice columns that view is frozen without. Wraps rather than '
  'replaces it, because the live definition of v_invoices_list is not version-controlled here.';

grant select on public.v_invoices_review to authenticated;

-- ===========================================================================
-- 4. Mailbox settings (Briefing Screen 1, the part Screen 3 depends on)
-- ===========================================================================
--
-- Screen 3's "not relevant" action is only meaningful if the system knows which folder an email
-- is moved into after processing, and where "back to the inbox" points. Those two settings live
-- here so they are configurable instead of hard-wired.
--
-- Single row by construction: the boolean primary key with a `check (id)` admits exactly one
-- value, so a second row is a constraint violation rather than a silent ambiguity.
create table if not exists public.mail_settings (
  id boolean primary key default true check (id),

  -- 'google' or 'microsoft'. The briefing insists the Microsoft path is thought through from the
  -- start rather than retrofitted, so the column exists even while only Google is wired up.
  provider text not null default 'google' check (provider in ('google', 'microsoft')),
  mailbox_address text,

  -- Which labels/folders are read. Empty means the whole inbox.
  watched_labels text[] not null default array[]::text[],
  -- Where a processed email is moved to, so the inbox shows at a glance what is still open.
  processed_label text,
  -- Where a "not relevant" receipt is handed back to. Defaults to the inbox.
  return_label text not null default 'INBOX',
  -- Moving an email is a write on the real mailbox, so it stays off until switched on
  -- deliberately. Otherwise emails disappear from under the bookkeeper.
  move_processed_enabled boolean not null default false,
  -- Additional Drive folders searched as a receipt source.
  drive_folders text[] not null default array[]::text[],

  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mail_settings is
  'Mailbox and Drive intake configuration (Briefing Screen 1). Read by the external ingestion '
  'pipeline; the Hub only edits it.';
comment on column public.mail_settings.move_processed_enabled is
  'Moving mail into the processed folder is a write on the real mailbox. Off by default so it is '
  'switched on deliberately, never by accident.';

insert into public.mail_settings (id) values (true) on conflict (id) do nothing;

alter table public.mail_settings enable row level security;

drop policy if exists "mail_settings_read" on public.mail_settings;
create policy "mail_settings_read" on public.mail_settings
  for select to authenticated using (true);

drop policy if exists "mail_settings_update" on public.mail_settings;
create policy "mail_settings_update" on public.mail_settings
  for update to authenticated using (true) with check (true);

-- ===========================================================================
-- 5. Per-company access foundations (Briefing Screen 17 / Appendix A7)
-- ===========================================================================
--
-- A7: "Every person sees only their assigned companies. Visibility is enabled per company
-- (Philipp = all, Julia = only JPGB)."
--
-- Foundations only, on purpose. The client's own note is that this can land with the
-- users-and-permissions feature as long as the groundwork avoids a rebuild. So this section adds
-- the grant table and the two helper functions, and deliberately does NOT rewrite any existing
-- RLS policy. `has_company_access` is written so that a user with no grants sees everything,
-- which is exactly today's behaviour. Switching enforcement on later means inserting grant rows
-- and swapping `using (true)` for `using (has_company_access(company_id))`, with no change to
-- these definitions.
-- This table ALREADY EXISTS in the live database, created outside this repo, with the shape
-- mirrored below: user_id (FK to app_users), company_id, can_view, and a soft-delete column.
-- Verified by probing the live API, after a first attempt at this migration assumed `app_user_id`
-- and failed with 42703 because `create table if not exists` had quietly skipped the existing
-- table and left the helper below referencing a column that does not exist.
--
-- So the definition here deliberately reproduces the live shape rather than an idealised one. On a
-- fresh environment this creates the same table the live database already has; on the live database
-- it is a no-op. Getting these two to disagree is exactly the failure mode above.
create table if not exists public.user_company_access (
  id uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_users(id) on delete cascade,
  company_id uuid not null,
  -- Visibility is the only right this table carries. There is no can_edit column live, so this
  -- migration does not invent one: a made-up column that nothing writes would read as a
  -- permission model that exists when it does not.
  can_view boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

comment on table public.user_company_access is
  'Which companies a person may see. No grants for a user means full visibility, which keeps '
  'current behaviour until the permissions feature switches enforcement on.';

create index if not exists idx_user_company_access_company
  on public.user_company_access (company_id);

-- RLS is left alone when the table already governs itself. Enabling row security on a table this
-- migration did not create would change access for whatever else reads it, and the owner of an
-- existing table has already made that choice. Only a table created fresh by the block above gets
-- its policy from here.
do $$
begin
  if exists (
    select 1 from pg_class
     where oid = 'public.user_company_access'::regclass and relrowsecurity
  ) then
    raise notice 'user_company_access: row security already enabled, leaving its policies alone';
  else
    raise notice 'user_company_access: enabling row security and adding a read policy';
    alter table public.user_company_access enable row level security;
    drop policy if exists "user_company_access_read" on public.user_company_access;
    create policy "user_company_access_read" on public.user_company_access
      for select to authenticated using (true);
  end if;
end $$;

-- The app user row behind the current JWT. SECURITY DEFINER so the lookup works regardless of
-- the policies on app_users, and so an RLS policy can call it without recursing into itself.
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

comment on function public.has_company_access(uuid) is
  'Per-company visibility check. A deactivated app_user is denied outright; NULL company is '
  'visible to everyone else (watch-all for unassigned receipts); a user with no live grants sees '
  'everything, which is current behaviour. Not yet wired into any RLS policy.';

grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.has_company_access(uuid) to authenticated;

commit;
