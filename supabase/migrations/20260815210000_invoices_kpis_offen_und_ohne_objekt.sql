-- Two things the invoice list could not ask invoices_kpis for.
--
-- 1. WHAT IS STILL PAYABLE. The tiles showed the gross volume of everything in view, paid and
--    unpaid together. On a screen about money going out, the number people actually need is what
--    is still owed, so the function now also returns `offen`: the gross sum of the rows with no
--    paid_at. The full volume stays, the two sit side by side.
--
-- 2. "NO PROPERTY ASSIGNED" AS A FILTER. The list can filter to invoices with no property
--    (p_objekt = '__ohne', the same idea as NZO for companies, except properties have no such
--    code). Without it here the tiles would count every property while the list showed only the
--    unassigned ones, and a 0 that looks like real data is worse than no number.
--
-- The return type changes, so this drops and recreates rather than CREATE OR REPLACE, which cannot
-- change a function's result type. Spliced from the live definition for the reasons spelled out in
-- 20260815160000: the body has grown filter clauses across several migrations and the database
-- holds the authoritative copy. Inside a migration this is one transaction, so a failure between
-- the drop and the create rolls back rather than leaving the function missing.
do $$
declare
  v_def   text;
  v_old   text;
  v_new   text;
  v_count int;
  v_vol   constant text := 'coalesce(sum(amount_gross), 0)';
  v_obj   constant text := 'and (p_objekt is null or property_code = p_objekt)';
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  if v_count <> 1 then
    raise exception 'invoices_kpis: expected exactly 1 overload, found %', v_count;
  end if;

  select pg_get_functiondef(p.oid), p.oid::regprocedure::text
    into v_def, v_old
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';

  if position('offen numeric' in v_def) > 0 then
    raise notice 'invoices_kpis already returns offen, nothing to do';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_vol, ''))) / length(v_vol) <> 1 then
    raise exception 'invoices_kpis: expected exactly one volume sum, refusing to rewrite blind';
  end if;
  if (length(v_def) - length(replace(v_def, v_obj, ''))) / length(v_obj) <> 1 then
    raise exception 'invoices_kpis: expected exactly one property clause, refusing to rewrite blind';
  end if;

  -- 1a. One more output column. The type list has no nested parens, so this stops at the right one.
  v_def := regexp_replace(v_def, 'RETURNS TABLE\(([^)]*)\)', 'RETURNS TABLE(\1, offen numeric)');
  -- 1b. ...and the value for it, right after the volume it belongs next to.
  v_def := replace(
    v_def,
    v_vol,
    v_vol || E',\n    coalesce(sum(amount_gross) filter (where paid_at is null), 0)'
  );

  -- 2. "No property assigned" as a filter value.
  v_def := replace(
    v_def,
    v_obj,
    E'and (\n      p_objekt is null\n'
      || '      or property_code = p_objekt' || E'\n'
      || '      -- The list sends this sentinel for "no property assigned". Properties have no'
      || E'\n      -- catch-all code the way companies have NZO, so the filter is expressed as a'
      || E'\n      -- value the column can never hold.'
      || E'\n      or (p_objekt = ''__ohne'' and property_code is null)\n    )'
  );

  execute format('drop function %s', v_old);
  execute v_def;

  select p.oid::regprocedure::text into v_new
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  execute format('grant execute on function %s to authenticated', v_new);
end $$;
