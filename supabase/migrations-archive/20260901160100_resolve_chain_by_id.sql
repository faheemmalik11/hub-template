-- Area routing resolves an ACCOUNT, and resolve_approval_rule fills step_2_user_id.
--
-- Companion to 20260901160000, which moved the chain onto app_users. This repoints the two
-- resolution functions at it. resolve_approval_rule keeps its signature and its return type
-- (public.approval_rules), which now carries step_1_user_id/step_2_user_id -- so every caller that
-- reads the RESOLVED row rather than the raw table keeps working without a code change, exactly as
-- 0087 arranged.
--
-- resolve_area_approver is DROPPED rather than left in place. It reads `approvers`, which
-- 20260901160000 froze; a resolution function pointed at a table nobody maintains is a trap for
-- whoever finds it next.
--
-- WHAT IS NOT CHECKED HERE, DELIBERATELY. resolve_area_user does NOT filter on whether the person
-- holds invoices.approve_final. Both possible failures are dead ends -- filtering leaves step 2
-- empty so nobody can act, not filtering resolves somebody who sees no button -- but the second one
-- at least names a person the screen can explain, and Team & Rollen refuses to set an area on
-- somebody without the permission in the first place. See 20260901160000 §6, which reports any
-- account already in that state.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'area'
  ) then
    raise exception 'preconditions failed: app_users.area is missing, apply 20260901160000 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'approval_rules' and column_name = 'step_2_user_id'
  ) then
    raise exception 'preconditions failed: approval_rules.step_2_user_id is missing, apply 20260901160000 first';
  end if;
end $$;

-- ===========================================================================
-- 1. resolve_area_user -- exact area match, else an all-areas fallback
-- ===========================================================================
-- SETOF, not a single public.app_users, for the reason 0087 learned the hard way: a non-SETOF
-- function called in a FROM clause always produces exactly one row (all-NULL when nothing matched)
-- instead of zero rows, which makes "no head found" indistinguishable from "found one with a null
-- field". Section 2's `select ... into` depends on real zero-or-one-row semantics.
create or replace function public.resolve_area_user(p_area text)
returns setof public.app_users
language sql
stable
set search_path = public
as $$
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

comment on function public.resolve_area_user(text) is
  'The department head for one area: an exact area match if an active one exists, else any active '
  'covers_all_areas account (oldest first, deterministic tiebreak). No row if p_area is NULL or '
  'nothing matches -- an unassigned company never silently guesses an approver. Replaces '
  'resolve_area_approver(), which read the frozen approvers table.';

revoke execute on function public.resolve_area_user(text) from public, anon;
grant execute on function public.resolve_area_user(text) to authenticated;

-- ===========================================================================
-- 2. resolve_approval_rule -- unchanged shape, fills step_2_user_id
-- ===========================================================================
-- The explicit NULL return is 0089's fix and must survive verbatim: PL/pgSQL's SELECT INTO leaves
-- an all-null composite when nothing matched, which PostgREST serializes as a JSON OBJECT of nulls,
-- not JSON null -- and every caller checking `approvalRuleQ.data &&` would treat it as a real chain.
create or replace function public.resolve_approval_rule(p_invoice_id uuid)
returns public.approval_rules
language plpgsql
stable
set search_path = public
as $$
declare
  v_rule public.approval_rules;
  v_area text;
  v_area_user uuid;
begin
  select r.* into v_rule
    from public.approval_rules r
    join public.invoices i on i.id = p_invoice_id
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
      from public.invoices i
      join public.companies c on c.id = i.company_id
     where i.id = p_invoice_id;

    select ru.id into v_area_user from public.resolve_area_user(v_area) ru;

    v_rule.step_2_user_id := v_area_user;
  end if;

  return v_rule;
end;
$$;

comment on function public.resolve_approval_rule(uuid) is
  'The winning approval chain for one invoice: most specific scope first, then the highest '
  'min_amount still at or below the invoice amount. If the winning rule left step_2_user_id empty '
  'and did not set skip_step_2, the resolved row''s step_2_user_id falls back to the area-based '
  'department head (resolve_area_user) for the invoice''s company -- an explicit step_2_user_id on '
  'the rule always wins over this fallback. Returns a genuine NULL (not an all-null-fields row) '
  'when no rule matches at all: see 0089 for why the naive plpgsql rewrite got that wrong. The '
  'HISTORICAL step_1_approver/step_2_approver columns ride along on the returned row untouched; '
  'nothing reads them.';

grant execute on function public.resolve_approval_rule(uuid) to authenticated;

-- ===========================================================================
-- 3. Retire the approvers-based resolver
-- ===========================================================================
drop function if exists public.resolve_area_approver(text);

-- ===========================================================================
-- 4. Self-checks. Read-only: they assert against whatever data is live, and write nothing.
-- ===========================================================================
do $$
declare
  v_count int;
  v_area  text;
begin
  -- 4a. NULL input never guesses.
  select count(*) into v_count from public.resolve_area_user(null);
  if v_count <> 0 then
    raise exception 'self-check 4a failed: resolve_area_user(null) returned % row(s)', v_count;
  end if;

  -- 4b. An area nobody owns resolves ONLY to an all-areas account, never to the owner of some
  --     other area. It does NOT resolve to nothing: "covers all areas" means all of them, which is
  --     the fallback 0087 built and this keeps verbatim. In practice p_area is only ever
  --     'hospitality', 'stay_re' or NULL, since it comes from companies.area.
  select count(*) into v_count
    from public.resolve_area_user('__nonexistent_area__') r
   where not r.covers_all_areas;
  if v_count <> 0 then
    raise exception 'self-check 4b failed: an unowned area resolved to a specific-area account';
  end if;

  -- 4c. An exact owner always beats the all-areas fallback, for every area that has one.
  foreach v_area in array array['hospitality', 'stay_re'] loop
    if exists (select 1 from public.app_users u where u.is_active and u.area = v_area) then
      select count(*) into v_count
        from public.resolve_area_user(v_area) r
       where r.area is distinct from v_area;
      if v_count <> 0 then
        raise exception 'self-check 4c failed: % resolved past its own active owner', v_area;
      end if;
    end if;

    -- At most one row, ever. The SETOF/limit-1 shape is what section 2's SELECT INTO relies on.
    select count(*) into v_count from public.resolve_area_user(v_area);
    if v_count > 1 then
      raise exception 'self-check 4c failed: % resolved to % rows', v_area, v_count;
    end if;
  end loop;

  -- 4d. No rule matches -> a genuine NULL, not an all-null composite. Asserted through to_jsonb(),
  --     NOT `... is not null`: composite row-is-null semantics make an all-null row read as NULL
  --     too, so the naive check passes even when 0089's bug is present. to_jsonb is STRICT, so it
  --     returns SQL NULL for a real NULL row and a JSON object of nulls for the broken one.
  if to_jsonb(public.resolve_approval_rule('00000000-0000-0000-0000-000000000000'::uuid)) is not null then
    raise exception 'self-check 4d failed: resolve_approval_rule returned an all-null row, not NULL';
  end if;

  -- 4e. Every active rule resolves a step 1 account (20260901160000 §5 already refused otherwise;
  --     restated here so applying these two out of order is caught rather than silently accepted).
  select count(*) into v_count
    from public.approval_rules r
   where r.is_active and r.deleted_at is null and r.step_1_user_id is null;
  if v_count > 0 then
    raise exception 'self-check 4e failed: % active rule(s) have no step 1 account', v_count;
  end if;

  -- 4f. resolve_area_approver is gone.
  select count(*) into v_count
    from information_schema.routines
   where routine_schema = 'public' and routine_name = 'resolve_area_approver';
  if v_count <> 0 then
    raise exception 'self-check 4f failed: resolve_area_approver still exists';
  end if;

  raise notice 'self-checks 4a-4f passed';
end $$;

commit;
