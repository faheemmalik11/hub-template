-- 0089_fix_resolve_approval_rule_null.sql
-- Fixes a real bug in 0087's rewrite of resolve_approval_rule (caught by /code-review, verified
-- directly against the live DB before writing this fix):
--
-- 0087 rewrote resolve_approval_rule from `language sql` to `language plpgsql` so the resolved
-- row's step_2_approver could be patched in place. The rewrite used `select r.* into v_rule ...`
-- -- when zero rows match, PL/pgSQL's SELECT INTO leaves v_rule as a composite with every field
-- individually NULL, which is NOT the same thing as v_rule itself being a genuine SQL NULL from
-- an external caller's perspective. Confirmed empirically:
--   select resolve_approval_rule('00000000-...'::uuid) is null;       -- true  (raw SQL, row-is-null
--                                                                          rule: true iff all fields null)
--   select to_jsonb(resolve_approval_rule('00000000-...'::uuid));      -- {"id": null, "step_2_approver":
--                                                                          null, ...} -- NOT json null
-- PostgREST (the RPC layer supabase-js calls) serializes the composite the second way -- a JSON
-- OBJECT with every field null, not JSON null. src/lib/data/queries.ts's useResolveApprovalRule
-- does `(data as ApprovalRule | null) ?? null`, which only catches a true JSON null -- an
-- all-null-fields object is truthy in JS, so every caller that checks `approvalRuleQ.data &&`
-- (e.g. $nr.tsx's payment-handoff paragraph, migration 0087's own doc comment promising "NULL
-- row when no rule matches at all") would render as if a real chain had resolved.
--
-- Not currently triggering visibly in production only because `invoices` has zero rows in this
-- database right now -- still a live, real bug the moment real data flows in, not a theoretical
-- one.
--
-- Fix: explicit `if v_rule.id is null then return null; end if;` before the area-fallback logic,
-- forcing a genuine SQL NULL (which PostgREST correctly serializes as JSON null) instead of
-- letting the all-null composite fall through to `return v_rule`.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'resolve_approval_rule'
  ) then
    raise exception '0089 preconditions failed: function resolve_approval_rule is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. resolve_approval_rule -- explicit NULL return when no rule matches
-- ===========================================================================
create or replace function public.resolve_approval_rule(p_invoice_id uuid)
returns public.approval_rules
language plpgsql
stable
set search_path = public
as $$
declare
  v_rule public.approval_rules;
  v_area text;
  v_area_approver text;
begin
  select r.* into v_rule
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

  -- Force a genuine SQL NULL, not an all-null-fields composite (see header note) -- the two are
  -- indistinguishable to `IS NULL` but not to PostgREST's JSON serialization, which is what the
  -- frontend actually receives.
  if v_rule.id is null then
    return null;
  end if;

  if v_rule.step_2_approver is null and not v_rule.skip_step_2 then
    select c.area into v_area
      from public.invoices i
      join public.companies c on c.id = i.company_id
     where i.id = p_invoice_id;

    select ra.name into v_area_approver from public.resolve_area_approver(v_area) ra;

    v_rule.step_2_approver := v_area_approver;
  end if;

  return v_rule;
end;
$$;

comment on function public.resolve_approval_rule(uuid) is
  'The winning approval chain for one invoice: most specific scope first, then the highest '
  'min_amount still at or below the invoice amount. If the winning rule left step_2_approver '
  'empty and did not set skip_step_2, the resolved row''s step_2_approver falls back to the '
  'area-based department head (resolve_area_approver, migration 0087) for the invoice''s '
  'company -- an explicit step_2_approver on the rule always wins over this fallback. Returns a '
  'genuine NULL (not an all-null-fields row) when no rule matches at all -- fixed in 0089, see '
  'that migration''s header for why the naive plpgsql rewrite in 0087 got this wrong.';

grant execute on function public.resolve_approval_rule(uuid) to authenticated;

-- MIGRATION-HYGIENE NOTE: section 2a's self-check assertion below was rewritten in place after
-- this migration was first committed (the original wrongly expected to_jsonb(NULL) to equal
-- 'null'::jsonb; it never does -- to_jsonb is STRICT). Editing a migration file in place ONLY
-- fixes an environment where it has not yet successfully applied: `create or replace function`
-- is idempotent regardless, but the self-check DO block that follows raises on failure and rolls
-- back the whole begin;...commit; -- so on an environment where the old assertion text already
-- ran and failed, this function was NEVER actually patched there, and re-running the (now fixed)
-- file top-to-bottom is exactly what re-applies it. Confirmed via the actual `supabase db push`
-- transcript when this was fixed: the push failed here and nothing after it (0090, 0091)
-- committed either, so as of that push no environment had the old broken assertion committed.
-- If this were ever suspected otherwise, the fix is to re-run `supabase db push` -- CREATE OR
-- REPLACE FUNCTION always re-applies the current file's definition regardless of history, it is
-- only the self-check DO block that can roll the whole file back.

-- ===========================================================================
-- 2. Self-checks
-- ===========================================================================

-- 2a. No matching invoice/rule at all -> a genuine NULL, both as raw SQL and once run through
-- to_jsonb (what PostgREST's RPC layer effectively does to serialize the return value).
-- to_jsonb is STRICT: a NULL input -- scalar or composite -- always yields a NULL result, never
-- the JSON value `null` (that literal only ever appears for a NON-null value that itself contains
-- a JSON null, e.g. a jsonb column literally holding 'null'). Confirmed against the live DB while
-- fixing this self-check: a first version of this test wrongly expected 'null'::jsonb here and
-- failed on every push. Either way, PostgREST's HTTP response body renders a NULL return value as
-- the text `null`, which is what the frontend actually needs to see -- so the fix in section 1
-- above was always correct; only this test's expectation was wrong.
do $$
declare
  v_is_null boolean;
  v_json jsonb;
begin
  select resolve_approval_rule('00000000-0000-0000-0000-000000000000'::uuid) is null into v_is_null;
  select to_jsonb(resolve_approval_rule('00000000-0000-0000-0000-000000000000'::uuid)) into v_json;

  if not v_is_null then
    raise exception '0089 self-check 2a FAILED: resolve_approval_rule no-match case is not NULL';
  end if;
  if v_json is not null then
    raise exception '0089 self-check 2a FAILED: to_jsonb(no-match case) is not NULL, got %', v_json;
  end if;

  raise notice '0089 self-check 2a ok: no-match case is a genuine NULL, to_jsonb propagates it as NULL (PostgREST renders this as JSON null in the HTTP body)';
end $$;

-- 2b. A real winning rule (probed against real data, rolled back) still resolves correctly,
-- including the area auto-resolve fallback from 0087 -- confirms this fix didn't regress the
-- happy path.
do $$
declare
  v_invoice_id   uuid;
  v_supplier_id  uuid;
  v_company_id   uuid;
  v_company_code text;
  v_expected     text;
  v_resolved     text;
begin
  select i.id, i.supplier_id, i.company_id, c.code
    into v_invoice_id, v_supplier_id, v_company_id, v_company_code
    from public.invoices i
    join public.companies c on c.id = i.company_id
   where i.supplier_id is not null and i.company_id is not null
   limit 1;

  if v_invoice_id is null then
    raise notice '0089 self-check 2b skipped: no invoice with both a supplier and a company';
  else
    insert into public.approval_rules (company_id, supplier_id, step_1_approver, step_2_approver, skip_step_2, min_amount, note)
    values (v_company_id, v_supplier_id, 'Andreas Christ', null, false, 0, 'self-check 2b, rolled back');

    v_expected := case
      when v_company_code in ('STAY', 'STGR') then 'Alexis Gonzalez'
      when v_company_code in ('MYBA', 'IMPV', 'INFI') then 'Lukas Oldach'
      else null
    end;

    select r.step_2_approver into v_resolved from public.resolve_approval_rule(v_invoice_id) r;

    if v_expected is not null and v_resolved is distinct from v_expected then
      raise exception '0089 self-check 2b FAILED: expected area auto-resolve % for company %, got %',
        v_expected, v_company_code, v_resolved;
    end if;

    raise notice '0089 self-check 2b ok: a real matching rule still resolves correctly (%)', v_resolved;
  end if;

  raise exception using errcode = 'restrict_violation', message = '0089 self-check 2b rollback';
exception
  when restrict_violation then
    null;
end $$;

commit;

-- Sanity (run manually after applying):
--   select resolve_approval_rule('00000000-0000-0000-0000-000000000000'::uuid) is null;  -- expect true
--   select to_jsonb(resolve_approval_rule('00000000-0000-0000-0000-000000000000'::uuid)) is null; -- expect true
