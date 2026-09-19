-- The KPI tiles follow the AI search and the Erkennung/Archiv filters too.
--
-- invoices_kpis had no parameter for three filters the list applies: the id set an AI search
-- narrows to (useAskInvoiceQuestion), the recognition traffic light (`ampel`), and the archive
-- switch. With any of them on, the tiles counted a wider set than the rows underneath, so the big
-- number and the list disagreed. A line of small print above the tiles said as much, which is not
-- the same as being right.
--
-- After this, invoices_kpis applies every filter applyBelegeFilter() applies, except `status` --
-- that one stays out on purpose, so the Erkannt / Zu pruefen tiles keep working as status toggles.
--
-- SPLICED FROM THE LIVE DEFINITION, not restated. The body has grown filter clauses across several
-- migrations (datev 0043, bank-match 0055/20260813160000/170000/180000, workflow 20260812180000)
-- and this database's own copy is the only authoritative version of them. The lookup asserts a
-- single overload first: SELECT INTO without STRICT silently picks an arbitrary row when several
-- match, which would rewrite the wrong function without a word.
--
-- Adding parameters with defaults CREATES A SECOND OVERLOAD rather than replacing the first, so the
-- old one is dropped by oid afterwards. Two overloads would leave every existing call ambiguous
-- ("function invoices_kpis is not unique"), which is worse than the stale counts this fixes.
do $$
declare
  v_def   text;
  v_old   text;
  v_new   text;
  v_count int;
  v_arch  constant text := 'and archived_at is null';
  v_rel   constant text := 'and not_relevant_at is null';
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

  if position('p_ampel' in v_def) > 0 then
    raise notice 'invoices_kpis already takes p_ampel, nothing to do';
    return;
  end if;

  -- Both anchors must appear exactly once. A blind rewrite of the aggregate every tile reads is
  -- worse than a migration that refuses to run.
  if (length(v_def) - length(replace(v_def, v_arch, ''))) / length(v_arch) <> 1 then
    raise exception 'invoices_kpis: expected exactly one "%" clause, refusing to rewrite blind', v_arch;
  end if;
  if (length(v_def) - length(replace(v_def, v_rel, ''))) / length(v_rel) <> 1 then
    raise exception 'invoices_kpis: expected exactly one "%" clause, refusing to rewrite blind', v_rel;
  end if;

  -- 1. Three more parameters, appended to the signature. pg_get_functiondef prints the whole
  --    parameter list on one line and follows it with RETURNS TABLE, so that boundary is the anchor.
  v_def := regexp_replace(
    v_def,
    '\)(\s*)RETURNS TABLE',
    ', p_ampel text DEFAULT NULL::text, p_archiv text DEFAULT NULL::text, '
      || 'p_ids uuid[] DEFAULT NULL::uuid[])\1RETURNS TABLE'
  );

  -- 2. The id set and the traffic light. `auffaellig` is gelb+rot together, the same partition the
  --    list uses: both are cases where a human has to look, and they are useless as separate lists.
  v_def := replace(
    v_def,
    v_rel,
    'and (p_ids is null or id = any(p_ids))'
      || E'\n    and (\n'
      || '      p_ampel is null' || E'\n'
      || '      or (p_ampel =  ''auffaellig'' and traffic_light in (''gelb'', ''rot''))' || E'\n'
      || '      or (p_ampel <> ''auffaellig'' and traffic_light = p_ampel)' || E'\n'
      || '    )' || E'\n    '
      || v_rel
  );

  -- 3. The archive switch, which until now was a hardcoded exclusion.
  v_def := replace(
    v_def,
    v_arch,
    'and (case when p_archiv = ''nur'' then archived_at is not null else archived_at is null end)'
  );

  execute v_def;

  execute format('drop function %s', v_old);

  select p.oid::regprocedure::text into v_new
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  execute format('grant execute on function %s to authenticated', v_new);
end $$;
