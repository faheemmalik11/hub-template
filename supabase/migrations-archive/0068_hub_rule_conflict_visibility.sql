-- 0056_rule_conflict_visibility.sql
-- Briefing Screen 4 ("What to watch out for"): "Rule conflict: if two rules match ('Supplier Ikea
-- -> office material' and 'Property KLMÜ4 -> building material'), a clear priority is needed."
--
-- That priority already exists and is already correct: resolve_assignment_rule (migration 0028)
-- picks the most-specific match via assignment_rules.specificity (migration 0025), tie-broken by
-- newest-first. What was missing is visibility — a reviewer looking at a receipt has no way to see
-- that more than one rule matched, or which one won and why. This migration adds a read-only
-- function returning EVERY matching rule for one receipt + target (not just the winner), each
-- flagged with whether it is the one that actually wins, so the Hub can show "2 rules matched —
-- X wins" instead of silently applying one of them.
--
-- Deliberately a NEW function, not a change to resolve_assignment_rule itself: that function runs
-- on the hot path (every field resolution, every preview, the apply-rules-on-insert trigger from
-- migration 0031) via a direct `limit 1` query, which the planner turns into an index-friendly top-N
-- scan. Wrapping it in a windowed/candidates query for that same call site risks losing that plan
-- shape for no benefit there. This function duplicates the identical WHERE clause instead (the same
-- pattern assignment_rule_preview/assignment_rule_preview_scope already use, migrations 0025/0031) —
-- keep it in sync with resolve_assignment_rule and escape_ilike_pattern if the predicate ever changes.

begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'resolve_assignment_rule'
  ) then
    raise exception 'migration 0056 expects resolve_assignment_rule from migration 0028, which is missing';
  end if;
end $$;

create or replace function public.resolve_assignment_rule_candidates(p_invoice uuid, p_target text)
returns table (rule_id uuid, specificity int, is_winner boolean)
language sql
stable
set search_path = public
as $$
  select r.id, r.specificity,
         row_number() over (order by r.specificity desc, r.created_at desc) = 1
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
   order by r.specificity desc, r.created_at desc;
$$;

comment on function public.resolve_assignment_rule_candidates(uuid, text) is
  'Every rule matching one receipt + target, most specific first, with is_winner flagging the same '
  'row resolve_assignment_rule(uuid, text) would return alone. Same WHERE clause and ORDER BY as '
  'that function by construction (copy, not a wrapper — see migration header) so "the winner" here '
  'is always identical to what actually gets applied. Read-only, for UI display only. See 0056.';

grant execute on function public.resolve_assignment_rule_candidates(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Self-check (run manually): the flagged winner must always agree with resolve_assignment_rule.
--
-- select i.id,
--        public.resolve_assignment_rule(i.id, 'cost_category') as winner_direct,
--        (select c.rule_id from public.resolve_assignment_rule_candidates(i.id, 'cost_category') c
--          where c.is_winner) as winner_via_candidates
--   from public.invoices i
--  where public.resolve_assignment_rule(i.id, 'cost_category') is not null
--  limit 20;
-- -- winner_direct must equal winner_via_candidates on every row.

commit;
