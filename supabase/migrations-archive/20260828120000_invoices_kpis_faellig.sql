-- The KPI tiles follow the new "Fällig" filter on the invoice list.
--
-- Without this the tiles above the table would keep counting every due date while the rows
-- underneath showed one band, which is the same disagreement migration 20260815160000 closed for
-- the traffic light and the archive switch.
--
-- The three parameters are dates and a boolean, not a band name: dueFilterRange() in
-- src/lib/data/format.ts resolves the band, so this function and the PostgREST list query apply one
-- definition, and "today" stays the user's local day rather than the database server's.
--
-- Same splice-and-drop shape as 20260815160000: the live body is the authoritative version (it has
-- grown clauses across several migrations), adding parameters with defaults creates a SECOND
-- overload rather than replacing the first, and two overloads make every existing call ambiguous.
do $$
declare
  v_def   text;
  v_old   text;
  v_new   text;
  v_count int;
  v_anchor constant text := '    and not_relevant_at is null;';
  v_extra  constant text :=
    '    and (case when p_faellig_unbekannt then due_date is null else true end)' || E'\n' ||
    '    and (p_faellig_von is null or due_date >= p_faellig_von)' || E'\n' ||
    '    and (p_faellig_bis is null or due_date <= p_faellig_bis)' || E'\n' ||
    '    and not_relevant_at is null;';
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  if v_count <> 1 then
    raise exception 'invoices_kpis: expected exactly 1 overload, found %', v_count;
  end if;

  select pg_get_functiondef(p.oid), p.oid::regprocedure::text
    into strict v_def, v_old
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';

  if position('p_faellig_von' in v_def) > 0 then
    raise notice 'invoices_kpis already takes p_faellig_von, nothing to do';
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception 'invoices_kpis: could not find the not_relevant_at clause to splice onto';
  end if;

  v_new := replace(v_def, v_anchor, v_extra);
  v_new := replace(
    v_new,
    'p_ids uuid[] DEFAULT NULL::uuid[])',
    'p_ids uuid[] DEFAULT NULL::uuid[], p_faellig_von date DEFAULT NULL::date, ' ||
    'p_faellig_bis date DEFAULT NULL::date, p_faellig_unbekannt boolean DEFAULT false)'
  );

  if v_new = v_def then
    raise exception 'invoices_kpis: parameter list did not match the expected shape';
  end if;

  execute v_new;
  execute format('drop function %s', v_old);
end
$$;

-- Partial, like its siblings on due_date: a deleted or archived receipt is never in a due band.
create index if not exists idx_invoices_due_date_open
  on public.invoices (due_date)
  where deleted_at is null and archived_at is null and due_date is not null;
