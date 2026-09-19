-- 0027_assignment_source_split.sql
-- Separate two different facts that migration 0025 collapsed into one column, and repair the CHECK
-- constraint that 0025 left too narrow.
--
-- WHAT WENT WRONG
--
-- `invoices.assignment_source` belongs to the ingestion pipeline and answers HOW the company was
-- resolved. Its vocabulary is set in the pipeline repo (pipeline/resolve_codes.py, docstring at
-- resolve_company_vat_from_felder):
--
--     'property_assignment' | 'property_assignment+name' | 'name' | 'unresolved'
--
-- Migration 0025 reused that same column to answer a completely different question, WHO decided the
-- assignment ('ai' | 'rule' | 'human'), so that a human assignment could be protected from the rule
-- engine. Two facts, one column. The consequences:
--
--   1. A reviewer editing the assignment overwrites 'name' with 'human', destroying the pipeline's
--      record of how the company was matched. Not recoverable afterwards.
--   2. The provenance badge misreports. The Hub reads anything that is not 'human'/'rule' as "KI",
--      so a company that came from a verified property assignment is displayed as an AI guess.
--
-- AND THE BREAKAGE
--
-- 0025 built the allowed vocabulary from 'ai'/'rule'/'human' plus the distinct values it found in
-- the table at that moment. Only 'name' and 'unresolved' were present, so the constraint landed as
-- ('ai','human','name','rule','unresolved') and rejects BOTH property_assignment values. That is
-- not hypothetical: public.property_assignment holds rows, and company_vat_assignment.load_resolver
-- feeds them to the resolver in every intake path (ingest_week, ingest_uploads, ingest_drive,
-- reextract). The next receipt whose company resolves through a property assignment fails its
-- insert with SQLSTATE 23514. It has not surfaced only because intake has not run since 0025.
--
-- THE FIX
--
-- `assignment_source` goes back to the pipeline, with the vocabulary the pipeline actually writes.
-- Who decided moves to its own column, matching vat_source and cost_category_source which were
-- always separate and always correct.

begin;

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='invoices'
                    and column_name='assignment_source')
  then v_missing := v_missing || 'column invoices.assignment_source'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'migration 0027 preconditions not met, missing: %',
      array_to_string(v_missing, ', ');
  end if;
  raise notice '0027 preconditions ok';
end $$;

-- ---------------------------------------------------------------------------
-- 1. A column for WHO decided the assignment
-- ---------------------------------------------------------------------------
-- Same three values and the same meaning as vat_source and cost_category_source, so all three
-- provenance columns read alike. NULL means "not recorded", which the rule engine treats as
-- overwritable: the pipeline writes assignments without one, and treating those as locked would
-- stop rules from ever taking effect on the existing data.
alter table public.invoices
  add column if not exists assignment_decided_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and conname = 'invoices_assignment_decided_by_check'
  ) then
    alter table public.invoices add constraint invoices_assignment_decided_by_check
      check (assignment_decided_by is null
             or assignment_decided_by in ('ai', 'rule', 'human'));
  end if;
end $$;

comment on column public.invoices.assignment_decided_by is
  'WHO decided the company/property/business-line assignment: ai | rule | human. A human value is '
  'never overwritten by a rule. Distinct from assignment_source, which records HOW the pipeline '
  'resolved the company. See migration 0027.';

-- ---------------------------------------------------------------------------
-- 2. Move any decided-by values that already landed in the wrong column
-- ---------------------------------------------------------------------------
-- Expected to be zero rows: the Hub screen that writes 'human' has not been used against production
-- yet. Written anyway, because "expected to be zero" is not the same as zero, and because the
-- migration has to be correct on a database where someone did use it. The original pipeline value
-- is genuinely gone in that case, so assignment_source is set back to NULL rather than guessed at.
do $$
declare v_moved int;
begin
  update public.invoices
     set assignment_decided_by = coalesce(assignment_decided_by, assignment_source),
         assignment_source = null
   where assignment_source in ('ai', 'rule', 'human');
  get diagnostics v_moved = row_count;
  raise notice '0027 moved % row(s) from assignment_source to assignment_decided_by', v_moved;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Give assignment_source back its real vocabulary
-- ---------------------------------------------------------------------------
-- The four values come from the pipeline source, NOT from the table contents. That is the mistake
-- 0025 made: a value the pipeline is coded to write may legitimately have no row yet, and reading
-- the table quietly narrows the constraint until the first write of that value fails.
--
-- Any other value still present in the table is carried along, so an unknown pipeline value that
-- predates this migration cannot make the ALTER fail. Whatever gets added is reported.
do $$
declare
  v_con   text;
  v_vals  text[] := array['property_assignment', 'property_assignment+name', 'name', 'unresolved'];
  v_extra text[];
begin
  select array_agg(distinct assignment_source) into v_extra
    from public.invoices
   where assignment_source is not null and not (assignment_source = any (v_vals));

  if v_extra is not null then
    raise notice '0027 keeping unrecognised assignment_source value(s) already in the table: %',
      v_extra;
    v_vals := v_vals || v_extra;
  end if;

  -- Drop by lookup, not by name: 0025 named it invoices_assignment_source_check, but an earlier
  -- unversioned pipeline migration may have used something else.
  for v_con in
    select conname from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%assignment_source%'
  loop
    execute format('alter table public.invoices drop constraint %I', v_con);
    raise notice '0027 dropped old constraint %', v_con;
  end loop;

  execute format(
    'alter table public.invoices add constraint invoices_assignment_source_check
       check (assignment_source is null or assignment_source in (%s))',
    (select string_agg(quote_literal(x), ', ' order by x) from unnest(v_vals) x));

  raise notice '0027 assignment_source vocabulary is now %', v_vals;
end $$;

comment on column public.invoices.assignment_source is
  'HOW the ingestion pipeline resolved the company: property_assignment | property_assignment+name '
  '| name | unresolved. Owned by the pipeline (resolve_codes.py); the Hub reads it and must not '
  'write it. Who decided lives in assignment_decided_by.';

-- ---------------------------------------------------------------------------
-- 4. Expose the new column on the review view
-- ---------------------------------------------------------------------------
-- Same wrapper-by-difference approach as 0025 section 3b, and for the same reason: v_invoices_list
-- is `select b.*`, its column list is frozen at creation time, and its live definition is not in
-- this repo. Recreated rather than replaced, because CREATE OR REPLACE cannot change a view's
-- column list and adding a column is exactly the point.
drop view if exists public.v_invoices_review;

do $$
declare
  v_extra text;
begin
  select string_agg(format('i.%I', want.c), ', ' order by want.c) into v_extra
    from (values
      ('archived_at'), ('not_relevant_at'), ('not_relevant_by'), ('not_relevant_note'),
      ('mailbox_reset_at'), ('business_line_id'), ('business_line_code'),
      ('assignment_source'), ('assignment_decided_by'), ('vat_source'), ('cost_category_source'),
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

-- ---------------------------------------------------------------------------
-- 5. Prove it
-- ---------------------------------------------------------------------------
-- The bug 0027 fixes was a constraint that rejected a value the pipeline writes, so the migration
-- checks that every value from both vocabularies is now storable, on a real row, and rolls the
-- probe back. A migration that silently leaves the same class of bug in place is worth little.
do $$
declare
  v_id uuid;
  v_v  text;
begin
  select id into v_id from public.invoices limit 1;
  if v_id is null then
    raise notice '0027 self-check skipped: no invoices to probe';
    return;
  end if;

  foreach v_v in array array['property_assignment', 'property_assignment+name',
                             'name', 'unresolved'] loop
    begin
      update public.invoices set assignment_source = v_v where id = v_id;
    exception when check_violation then
      raise exception '0027 self-check FAILED: assignment_source rejects %, which the pipeline writes', v_v;
    end;
  end loop;

  foreach v_v in array array['ai', 'rule', 'human'] loop
    begin
      update public.invoices set assignment_decided_by = v_v where id = v_id;
    exception when check_violation then
      raise exception '0027 self-check FAILED: assignment_decided_by rejects %', v_v;
    end;
  end loop;

  -- And the split has to actually hold: the pipeline column must refuse a decided-by value.
  begin
    update public.invoices set assignment_source = 'human' where id = v_id;
    raise exception '0027 self-check FAILED: assignment_source still accepts ''human'', '
                    'so the two vocabularies are not separated';
  exception when check_violation then
    null;  -- expected
  end;

  raise notice '0027 self-check ok: both vocabularies store, and they stay apart';
  raise exception using errcode = 'restrict_violation', message = '0027 self-check rollback';
exception when restrict_violation then
  null;  -- unwinds the probe updates, keeps the schema changes above
end $$;

commit;
