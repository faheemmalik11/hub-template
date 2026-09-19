-- "Not assigned to any company" in AI search must also find invoices whose company_code is NULL.
--
-- Reported by the client: asking the voice/AI search for invoices not assigned to a company
-- returned 0 records while the table plainly showed rows with "none" in the Company column.
--
-- Cause: "unassigned" has TWO representations. There is a real companies row `NZO`
-- ("Nicht zugeordnet"), so NZO is in the vocabulary enum handed to the model, and the model
-- reasonably answers "not assigned" with companyCode = 'NZO'. But the pipeline never writes that
-- code -- it leaves company_code NULL -- so `company_code = 'NZO'` matched nothing. Confirmed on
-- immonetz: 20 of 30 invoices NULL, 0 NZO.
--
-- Fix: NZO means "unassigned", so it matches the explicit code AND the NULLs. Deliberately not the
-- reverse (a NULL p_company_code still means "no company filter at all"), and no other code is
-- affected. The alternative -- teaching the model a separate "unassigned" flag -- needs a schema
-- change on the filter contract and still leaves plain `NZO` broken for anyone who picks it from
-- the UI, so the meaning is fixed here, once, where every caller sees it.
--
-- Applied to EVERY overload of both functions: two each on immonetz today, and picking one at
-- random is exactly how the KPI splice earlier in this series silently no-oped.
do $$
declare
  r        record;
  v_def    text;
  v_from   text := 'and (p_company_code  is null or company_code  = p_company_code)';
  v_to     text := E'and (\n      p_company_code is null\n      or company_code = p_company_code\n      -- NZO ("Nicht zugeordnet") is the catch-all for unassigned, and the pipeline expresses\n      -- unassigned as NULL rather than by writing the code, so it has to match both.\n      or (p_company_code = ''NZO'' and company_code is null)\n    )';
  v_done   int := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('invoices_filtered_search', 'invoices_filtered_aggregate')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position('p_company_code = ''NZO''' in v_def) > 0 then
      continue;  -- already handled
    end if;

    if position(v_from in v_def) = 0 then
      raise exception 'public.%(%): company_code clause not found, refusing to rewrite blind',
        r.proname, r.args;
    end if;

    execute replace(v_def, v_from, v_to);
    v_done := v_done + 1;
  end loop;

  if v_done = 0 then
    raise notice 'company_code NZO/NULL handling already present on every overload';
  else
    raise notice 'updated % function overload(s)', v_done;
  end if;
end $$;
