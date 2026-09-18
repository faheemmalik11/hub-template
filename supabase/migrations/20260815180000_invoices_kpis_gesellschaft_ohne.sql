-- The KPI tiles count "no company assigned" the same way the list does.
--
-- "Unassigned" has TWO representations: the pipeline leaves company_code NULL, and there is also a
-- real companies row NZO ("Nicht zugeordnet") meaning the same thing. Migration 20260813190000
-- settled that for the AI-search RPCs (invoices_filtered_search / invoices_filtered_aggregate):
-- NZO matches the explicit code AND the NULLs. The invoice list now offers "Ohne Gesellschaft" as
-- its own filter option, which sends exactly that code, so invoices_kpis has to read it the same
-- way. Without this the tiles would report 0 while the list shows hundreds of rows, and a 0 that
-- looks like real data is worse than no number at all.
--
-- Deliberately not the reverse: a NULL p_gesellschaft still means "no company filter at all", and
-- no other code is affected.
--
-- Spliced from the live definition, single overload asserted first, for the reasons spelled out in
-- 20260815160000. This one changes no parameter, only the clause, so nothing needs dropping.
do $$
declare
  v_def   text;
  v_count int;
  v_from  constant text := 'and (p_gesellschaft is null or company_code = p_gesellschaft)';
  v_to    constant text :=
    E'and (\n      p_gesellschaft is null\n'
    || '      or company_code = p_gesellschaft' || E'\n'
    || '      -- NZO ("Nicht zugeordnet") is the catch-all for unassigned, and the pipeline'
    || E'\n      -- expresses unassigned as NULL rather than by writing the code, so it has to'
    || E'\n      -- match both. Same rule as migration 20260813190000 set for the search RPCs.'
    || E'\n      or (p_gesellschaft = ''NZO'' and company_code is null)\n    )';
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  if v_count <> 1 then
    raise exception 'invoices_kpis: expected exactly 1 overload, found %', v_count;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';

  if position('p_gesellschaft = ''NZO''' in v_def) > 0 then
    raise notice 'invoices_kpis already reads NZO as unassigned, nothing to do';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'invoices_kpis: expected exactly one company_code clause, refusing to rewrite blind';
  end if;

  execute replace(v_def, v_from, v_to);
end $$;
