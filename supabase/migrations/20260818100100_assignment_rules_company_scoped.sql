-- 20260818100100_assignment_rules_company_scoped.sql
-- Close the same company hole on apply_assignment_rules(), the single-receipt writer that
-- apply_assignment_rule_bulk() calls in its loop and that the receipt detail screen calls directly.
--
-- Scoping only the bulk function would have been theatre. Both are SECURITY DEFINER, both are
-- granted to `authenticated`, and both write invoices. A person who cannot open a receipt can still
-- name its id in an RPC call, and this function would happily re-run the rule engine over it.
--
-- WHY THE BODY IS PATCHED IN PLACE RATHER THAN RESTATED. apply_assignment_rules() is ~180 lines of
-- category and VAT logic that has been amended by several migrations (0030, 0031, 0032 and the
-- per-repo ones after them) and is NOT identical across the three Hubs. Retyping it here to add
-- four lines would mean three hand-copied divergent bodies, and the first typo would be a silent
-- accounting bug rather than a compile error. So the migration reads the live definition, splices
-- the guard in after the existing not-found check, and re-executes it. Everything else stays
-- byte-for-byte what it already was.
--
-- It is idempotent (a body that already mentions has_company_access is left alone) and it fails
-- loudly rather than silently doing nothing if the anchor it expects is gone.

begin;

do $mig$
declare
  v_def text;
  v_new text;
  v_anchor constant text :=
    'raise exception ''invoice % not found or deleted'', p_invoice;' || E'\n  end if;';
  v_guard constant text :=
    'raise exception ''invoice % not found or deleted'', p_invoice;' || E'\n  end if;' || E'\n' ||
    E'\n' ||
    '  -- Company scope. A caller with no session at all (the ingestion pipeline''s service role, a' || E'\n' ||
    '  -- trigger firing on insert) is not company restricted and must keep working, so the check is' || E'\n' ||
    '  -- gated on there being a logged-in person to check.' || E'\n' ||
    '  if auth.uid() is not null and not public.has_company_access(v_inv.company_id) then' || E'\n' ||
    '    raise exception ''no access to the company of invoice %'', p_invoice' || E'\n' ||
    '      using errcode = ''42501'';' || E'\n' ||
    '  end if;';
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'apply_assignment_rules'
     and pg_get_function_identity_arguments(p.oid) = 'p_invoice uuid, p_actor text';

  if v_def is null then
    raise exception 'apply_assignment_rules(uuid, text) not found; nothing to guard';
  end if;

  if position('has_company_access' in v_def) > 0 then
    raise notice 'apply_assignment_rules already carries a company check, leaving it alone';
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception
      'apply_assignment_rules no longer contains the expected not-found check; refusing to patch a body I do not recognise';
  end if;

  v_new := replace(v_def, v_anchor, v_guard);
  execute v_new;
  raise notice 'apply_assignment_rules patched with a company check';
end $mig$;

commit;

-- Sanity (after applying):
--   select pg_get_functiondef(oid) ilike '%has_company_access%' as guarded
--     from pg_proc where proname = 'apply_assignment_rules';
--   -- expect t
--
-- And the pipeline path must still work: an insert into invoices fires
-- trg_invoices_apply_rules_on_insert with no auth.uid(), which skips the check entirely.
