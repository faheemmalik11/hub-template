-- The KPI tiles above the incoming-invoice list learn the bank-match filter.
--
-- The list gained a "Zahlung & Bank-Abgleich" filter (Nicht zugeordnet / Zuordnung offen /
-- Zugeordnet, migration 20260813170000), but invoices_kpis has no p_bank_match parameter at all,
-- so the tiles kept reporting unfiltered totals while the list beneath them narrowed. Two numbers
-- on the same screen disagreeing is worse than either being absent -- you cannot tell which one is
-- answering your question.
--
-- Two steps, because the tiles read a different view than the list:
--   1. v_invoices_review enumerates its columns explicitly from v_invoices_list, so the two new
--      flags have to be added there too or the function cannot reference them.
--   2. invoices_kpis gains p_bank_match with all three values.
--
-- 'offen' requires BOTH flags false, not just the absence of a confirmed match: an invoice with an
-- open suggestion also has no confirmed match, so testing only that would count exactly the rows
-- awaiting a decision as "nothing to do".

-- ---------------------------------------------------------------------------
-- 1. v_invoices_review passes the two flags through.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def    text;
  v_anchor text := E'    review_score\n   FROM v_invoices_list;';
  v_new    text := E'    review_score,\n    has_suggested_bank_match,\n    has_confirmed_bank_match\n   FROM v_invoices_list;';
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_review'
       and column_name = 'has_suggested_bank_match'
  ) then
    raise notice 'v_invoices_review already passes the bank-match flags through';
  else
    select pg_get_viewdef('public.v_invoices_review'::regclass, true) into v_def;
    if position(v_anchor in v_def) = 0 then
      raise exception 'v_invoices_review: expected tail not found, refusing to rebuild the view blind';
    end if;
    -- `with (security_invoker = true)` is NOT optional: CREATE OR REPLACE VIEW replaces reloptions
    -- wholesale, so omitting it silently clears what migration 0066 set and the view reverts to
    -- running as its owner -- an RLS bypass on every invoice.
    execute 'create or replace view public.v_invoices_review with (security_invoker = true) as ' ||
            rtrim(replace(v_def, v_anchor, v_new), ';');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. invoices_kpis gains p_bank_match.
-- ---------------------------------------------------------------------------
-- Adding a parameter changes the signature, so CREATE OR REPLACE would leave a second overload
-- behind and PostgREST would refuse the call ("could not choose the best candidate function").
-- The old one is dropped explicitly. Spliced from the live definition rather than restated: the
-- body carries a dozen other filter clauses the tiles must keep applying.
do $$
declare
  v_def      text;
  v_sig_from text := 'p_workflow text DEFAULT NULL::text)';
  v_sig_to   text := 'p_workflow text DEFAULT NULL::text, p_bank_match text DEFAULT NULL::text)';
  v_body_from text := '    and (p_workflow is null or workflow_status = p_workflow)';
  v_body_to  text := E'    and (\n      p_bank_match is null\n      or (p_bank_match = ''vorschlag''  and has_suggested_bank_match)\n      or (p_bank_match = ''zugeordnet'' and has_confirmed_bank_match)\n      or (p_bank_match = ''offen'' and not has_suggested_bank_match and not has_confirmed_bank_match)\n    )\n    and (p_workflow is null or workflow_status = p_workflow)';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';

  if v_def is null then
    raise exception 'invoices_kpis not found';
  end if;

  if position('p_bank_match' in v_def) > 0 then
    raise notice 'invoices_kpis already takes p_bank_match, nothing to do';
    return;
  end if;

  if position(v_sig_from in v_def) = 0 or position(v_body_from in v_def) = 0 then
    raise exception 'invoices_kpis: expected anchors not found, refusing to rewrite blind';
  end if;

  drop function if exists public.invoices_kpis(text, text, text, text, text, date, date, text, text);

  v_def := replace(v_def, v_sig_from, v_sig_to);
  v_def := replace(v_def, v_body_from, v_body_to);
  execute v_def;
end $$;
