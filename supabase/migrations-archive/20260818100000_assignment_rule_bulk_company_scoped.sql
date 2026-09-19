-- 20260818100000_assignment_rule_bulk_company_scoped.sql
-- Stop the retroactive "Anwenden" button writing invoices across companies the person clicking it
-- cannot see.
--
-- docs/audit/zuordnungsregeln/assignment-rules/ISSUES.md #1, and the same gap
-- docs/ROLES_AND_ACCESS.md section 3 item 3 recorded as deliberately deferred.
--
-- THE SHAPE OF THE HOLE. Three facts that were each fine alone:
--   * `invoices` RLS reads are scoped: policy invoices_select is `using (has_company_access(company_id))`.
--   * assignment_rule_preview() is SECURITY INVOKER, so the "would change N of M" number the screen
--     shows a restricted person is ALREADY only their own companies' receipts.
--   * apply_assignment_rule_bulk() is SECURITY DEFINER and had no access check at all, so the write
--     covered every company.
-- Preview and apply therefore disagreed for anyone company-restricted: the screen promised N and
-- the button wrote across the whole database. A rule with `company_id is null` -- the common case,
-- since most category rules are not scoped to one company -- matches every company's invoices, and
-- /zuordnungsregeln has no role gate of its own. Any authenticated employee could click it.
--
-- THE FIX. The loop now skips invoices whose company the caller cannot access, which makes the
-- write cover exactly what the preview counted. The count of skipped-for-access rows is returned
-- as `blocked_no_access` for the audit trail but is DELIBERATELY NOT SHOWN in the UI: the preview
-- never disclosed those receipts exist, and reporting "12 receipts in companies you cannot see
-- were skipped" would hand back the very fact the scoping is there to withhold.
--
-- WHY `auth.uid() is not null` GATES THE CHECK. A caller with no session at all -- the ingestion
-- pipeline's service role, a trigger firing on insert -- is not a company-restricted person and
-- must keep working. On this database has_company_access() already answers TRUE for a sessionless
-- caller (it falls through to the "no grants recorded" branch), so the gate is belt and braces
-- here; on Eiffler that same function answers FALSE, and without this gate the identical migration
-- there would silently switch rule application off for the pipeline. The three Hubs get the same
-- body on purpose.
--
-- BEHAVIOUR TODAY: this one actually changes something. Unlike the sibling Hubs, this database
-- HAS company grants recorded -- 10 rows in user_company_access covering 3 of the 6 active users.
-- Those three could, until this migration, click Anwenden on an unscoped rule and rewrite every
-- other company's receipts, including companies their own screens never show them. After it they
-- write exactly the set the preview counted for them. The other users have no grants and stay
-- unrestricted, so nothing changes for them.

begin;

create or replace function public.apply_assignment_rule_bulk(p_rule uuid, p_actor text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      from public.invoices i
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
end $function$;

comment on function public.apply_assignment_rule_bulk(uuid, text) is
  'Applies one assignment rule to every receipt in its scope that the CALLER may access. '
  'SECURITY DEFINER because it writes through apply_assignment_rules(), so the company check is '
  'explicit here rather than inherited from RLS. Returns matches/changed/skipped for the receipts '
  'it was allowed to touch, plus blocked_no_access for the ones it refused; the UI shows the '
  'former and not the latter. A sessionless caller (service role, trigger) is not scoped.';

commit;

-- Sanity (after applying):
--   select prosecdef, pg_get_functiondef(oid) ilike '%has_company_access%' as guarded
--     from pg_proc where proname = 'apply_assignment_rule_bulk';
--   -- expect t, t
--
-- And the numbers must still add up for an unrestricted caller: matches from this function and
-- `matches` from assignment_rule_preview(rule) are the same figure for the same rule.
