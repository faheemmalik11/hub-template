-- split_assignment_decided_by.sql
--
-- Bug: assignment_decided_by is ONE provenance column shared by company_code and property_code.
-- The invoice detail screen renders it as the "Quelle" badge beside BOTH fields, and uses it to
-- decide whether to keep showing the AI confidence dot, so it cannot say which of the two a person
-- actually settled. Two visible consequences, both reachable from the "Needs your input" card:
--
--   * Choosing a COMPANY there wrote no stamp at all. It could not: the same column doubles as the
--     card's "has the property been settled?" flag, so stamping it would have made the property row
--     vanish from the card unanswered. The badge therefore went on saying "AI" after a person had
--     picked the company by hand.
--   * Choosing a PROPERTY there did stamp the column, which flipped the COMPANY badge to "manual"
--     as well, on a field nobody had touched.
--
-- Fix: one provenance column per field, following the vat_source / cost_category_source pattern
-- rather than the shared assignment_source / assignment_decided_by one. Ported from immonetz
-- migration 0061, without its business_line_assignment_source (this Hub has no business lines).
--
-- assignment_source (pipeline-owned, records HOW the value was resolved) is deliberately NOT part
-- of the split. It is never rendered per field, and a reviewer's edit must not erase it.
--
-- assignment_decided_by is left in place and deprecated, not dropped. Dropping it would mean
-- dropping and recreating v_invoices_list and v_invoices_review, reproducing their security_invoker
-- setting and their grants by hand, for a column that costs nothing to stop reading. The backfill
-- in step 2 copies its value into both new columns, so every existing invoice keeps showing exactly
-- the badge it shows today, and only the next edit teaches the row which field really changed.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices'
       and column_name = 'assignment_decided_by'
  ) then
    v_missing := v_missing || 'column invoices.assignment_decided_by';
  end if;
  if not exists (
    select 1 from information_schema.views
     where table_schema = 'public' and table_name = 'v_invoices_list'
  ) then
    v_missing := v_missing || 'view v_invoices_list';
  end if;
  if not exists (
    select 1 from information_schema.views
     where table_schema = 'public' and table_name = 'v_invoices_review'
  ) then
    v_missing := v_missing || 'view v_invoices_review';
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'split_assignment_decided_by preconditions failed, missing: %',
      array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. Per-field provenance columns
-- ===========================================================================
alter table public.invoices
  add column if not exists company_assignment_source text,
  add column if not exists property_assignment_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and conname = 'invoices_company_assignment_source_check'
  ) then
    alter table public.invoices add constraint invoices_company_assignment_source_check
      check (company_assignment_source is null
             or company_assignment_source in ('ai', 'rule', 'human'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and conname = 'invoices_property_assignment_source_check'
  ) then
    alter table public.invoices add constraint invoices_property_assignment_source_check
      check (property_assignment_source is null
             or property_assignment_source in ('ai', 'rule', 'human'));
  end if;
end $$;

comment on column public.invoices.company_assignment_source is
  'Provenance of company_code/company_id: ai | rule | human. Split out of assignment_decided_by so '
  'that settling the company no longer marks the property human-decided too, and so that a company '
  'chosen by hand can be shown as such. A human value is never overwritten by a rule.';
comment on column public.invoices.property_assignment_source is
  'Provenance of property_code/property_id: ai | rule | human. See company_assignment_source.';

-- ===========================================================================
-- 2. Backfill: every existing invoice keeps the badge it shows today (both fields agreeing) until
--    the next edit says which one actually changed.
-- ===========================================================================
update public.invoices
   set company_assignment_source = assignment_decided_by,
       property_assignment_source = assignment_decided_by
 where assignment_decided_by is not null
   and company_assignment_source is null
   and property_assignment_source is null;

comment on column public.invoices.assignment_decided_by is
  'DEPRECATED: superseded by company_assignment_source / property_assignment_source, one column per '
  'field instead of one shared between them. Kept so historical rows and queries that still '
  'reference it keep working. Do not read it for new UI.';

-- ===========================================================================
-- 3. Views — both are append-only (CREATE OR REPLACE VIEW can add trailing columns but cannot
--    reorder or drop existing ones).
--
--    Each view is WRAPPED in its own current definition rather than having the new columns spliced
--    into it. `sub.*` reproduces the existing column list and its order exactly, which is what
--    CREATE OR REPLACE demands, without this migration restating several thousand characters of a
--    definition that has already drifted from its tracked form once, and without an anchor string
--    that has to match that drifted text.
--
--    `with (security_invoker = true)` is NOT optional: CREATE OR REPLACE VIEW replaces a view's
--    reloptions wholesale, so leaving it out silently clears it and the view reverts to running as
--    its owner, which is an RLS bypass on every invoice.
--
--    The join is LEFT and on the primary key: it can add the two columns but can never add, drop
--    or duplicate a row.
-- ===========================================================================
do $$
declare
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_list'
       and column_name = 'company_assignment_source'
  ) then
    raise notice 'v_invoices_list already exposes the per-field provenance columns';
  else
    select pg_get_viewdef('public.v_invoices_list'::regclass, true) into v_def;
    execute format(
      'create or replace view public.v_invoices_list with (security_invoker = true) as '
      'select sub.*, i.company_assignment_source, i.property_assignment_source '
      '  from (%s) sub '
      '  left join public.invoices i on i.id = sub.id',
      rtrim(btrim(v_def), ';'));
  end if;
end $$;

do $$
declare
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_review'
       and column_name = 'company_assignment_source'
  ) then
    raise notice 'v_invoices_review already exposes the per-field provenance columns';
  else
    select pg_get_viewdef('public.v_invoices_review'::regclass, true) into v_def;
    execute format(
      'create or replace view public.v_invoices_review with (security_invoker = true) as '
      'select sub.*, i.company_assignment_source, i.property_assignment_source '
      '  from (%s) sub '
      '  left join public.invoices i on i.id = sub.id',
      rtrim(btrim(v_def), ';'));
  end if;
end $$;

commit;

-- ===========================================================================
-- 4. Self-checks — probe real data, always roll back (restrict_violation idiom)
-- ===========================================================================

-- 4a. Backfill: a row that had assignment_decided_by set now shows the same value on both new
--     columns, i.e. the badge state every reviewer sees today is preserved.
do $$
declare
  v_row record;
begin
  select id, assignment_decided_by, company_assignment_source, property_assignment_source
    into v_row
    from public.invoices
   where assignment_decided_by is not null
   limit 1;

  if v_row.id is null then
    raise notice 'self-check 4a skipped: no invoice with assignment_decided_by set to probe';
  else
    if v_row.company_assignment_source is distinct from v_row.assignment_decided_by
       or v_row.property_assignment_source is distinct from v_row.assignment_decided_by then
      raise exception 'self-check 4a FAILED: backfill does not match assignment_decided_by on %',
        v_row.id;
    end if;
    raise notice 'self-check 4a ok: backfill matches assignment_decided_by';
  end if;
end $$;

-- 4b. Both views hand the new columns through, and they agree with the base table. Without this a
--     silently truncated wrap would only show up as every badge reading "AI" again.
do $$
declare
  v_row record;
begin
  select r.id, r.company_assignment_source as r_company, r.property_assignment_source as r_property,
         l.company_assignment_source as l_company, i.company_assignment_source as i_company
    into v_row
    from public.v_invoices_review r
    join public.v_invoices_list l on l.id = r.id
    join public.invoices i on i.id = r.id
   limit 1;

  if v_row.id is null then
    raise notice 'self-check 4b skipped: no invoice visible through the views to probe';
  else
    if v_row.r_company is distinct from v_row.i_company
       or v_row.l_company is distinct from v_row.i_company then
      raise exception 'self-check 4b FAILED: the views disagree with invoices on %', v_row.id;
    end if;
    raise notice 'self-check 4b ok: both views pass the provenance columns through';
  end if;
end $$;

-- 4c. The new columns take the same three values assignment_decided_by does, and nothing else.
do $$
declare
  v_inv_id uuid;
begin
  select id into v_inv_id from public.invoices where deleted_at is null limit 1;
  if v_inv_id is null then
    raise notice 'self-check 4c skipped: no invoice to probe';
  else
    begin
      update public.invoices set company_assignment_source = 'unsinn' where id = v_inv_id;
      raise exception 'self-check 4c FAILED: company_assignment_source accepted an invalid value';
    exception
      when check_violation then
        raise notice 'self-check 4c ok: invalid company_assignment_source rejected';
    end;
  end if;

  raise exception using errcode = 'restrict_violation', message = 'self-check 4c rollback';
exception
  when restrict_violation then
    null;
end $$;

-- Sanity (run manually after applying):
--   select id, assignment_decided_by, company_assignment_source, property_assignment_source
--     from public.v_invoices_review
--    where assignment_decided_by is not null
--    limit 20;
