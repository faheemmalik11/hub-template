-- 20260817140000_company_code_rename_cascade.sql
-- Renaming a Gesellschaft's `code` silently orphans everything keyed to the old code string.
--
-- Reproduced live on the sibling Immonetz DEV project, which runs the identical screen, the
-- identical mutation hook and an identical schema for every column involved. It was deliberately
-- NOT re-run here: the destructive half of the proof means renaming a real company's code twice.
-- Every structural precondition was confirmed to hold on this database instead -- invoices
-- .company_code exists, the detail page carries the same `company_id = id OR company_code = code`
-- match, and there are 14 entity_aliases rows with entity_type = 'gesellschaft'.
--
-- One difference makes this Hub quieter, not safer: it has no company-alias section on the
-- Gesellschaft screen (aliases are surfaced for suppliers only). Those 14 rows are written and read
-- by the ingest pipeline and never rendered, so a rename orphans them with no visible symptom
-- whatsoever -- name routing just stops matching.
--
-- What was observed on Immonetz DEV, through the Hub UI (Gesellschaft -> Bearbeiten -> Code ->
-- Speichern), on "immonetz konzept GmbH" (IMKO, id 3d1984c6-082f-40ec-868a-c5b414f5be01):
--
--   1. Renamed IMKO -> IMKOTMP. The dialog gave no warning of any kind, and the save reported a
--      plain "Gespeichert." toast.
--   2. Its "BEKANNTE SCHREIBWEISEN" list went from 1 entry to 0. The 2 entity_aliases rows still
--      existed, still under entity_code = 'IMKO', now pointing at a code no company holds. They are
--      unreachable from the UI and, more importantly, the ingest pipeline resolves incoming company
--      names through exactly these rows -- so the alias "immonetz konzept GmbH" kept resolving to a
--      dead code and would stop routing invoices to this company.
--   3. All 10 of its invoices kept `company_code = 'IMKO'`, because that column is a denormalised
--      copy of the code and nothing updates it. Mismatches between invoices.company_code and the
--      owning company's code went from 0 to 10 in a single click.
--   4. Then a SECOND company ("immonetz ostsee GmbH", IMOS, 0 invoices of its own) was renamed to
--      the now-free 'IMKO'. Its detail page immediately displayed all 10 invoices of immonetz
--      konzept GmbH -- 12.215,48 EUR of another legal entity's documents, with its own total -- plus
--      that company's alias, silently re-parented by the matching string. No warning anywhere.
--
-- Both renames were reverted; the DB is back to 0 mismatches with both aliases restored.
--
-- Two things were wrong, and this migration fixes the first (the front-end fix for the second ships
-- alongside it, in src/routes/gesellschaften/$id.tsx):
--
--   A. Nothing cascades a code rename to the rows keyed by that code. -> fixed here.
--   B. The detail page matched invoices with `company_id = id OR company_code = code`, so a code
--      collision leaked another company's data. -> the fallback is now restricted to invoices that
--      carry no company_id at all.
--
-- The cascade lives in the database rather than in the mutation hook on purpose: the Hub is not the
-- only writer. The ingest pipeline and manual SQL both update this table, and a rename done by any
-- of them has to keep the dependent rows consistent.
--
-- Scope of the cascade -- every column in this schema that stores a company code as a string:
--   entity_aliases.entity_code  (only where entity_type = 'gesellschaft')
--   invoices.company_code
-- `properties` links to companies by id, not code, so it needs nothing. (Note: entity_aliases rows
-- with entity_type = 'objekt' are keyed to properties.code the same way and have the same latent
-- problem on a property rename -- out of scope here, tracked separately.)

begin;

create or replace function public.cascade_company_code_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Aliases are keyed by the code string, so they move with it. Scoped to 'gesellschaft' so a
  -- property or supplier alias that happens to share the string is never touched.
  update public.entity_aliases
     set entity_code = new.code
   where entity_type = 'gesellschaft'
     and entity_code = old.code;

  -- invoices.company_code is a denormalised copy. Only rows that genuinely belong to THIS company
  -- are rewritten: those already linked by id, plus unassigned rows that referenced the old code
  -- (the code moved to this company, so the reference moves with it). A row whose company_id points
  -- at a different company is deliberately left alone -- that is pre-existing inconsistent data and
  -- guessing at it here would be the very cross-company mixing this migration exists to prevent.
  update public.invoices
     set company_code = new.code
   where company_code = old.code
     and (company_id = new.id or company_id is null);

  return new;
end;
$function$;

drop trigger if exists companies_code_rename_cascade on public.companies;

create trigger companies_code_rename_cascade
  after update of code on public.companies
  for each row
  when (old.code is distinct from new.code)
  execute function public.cascade_company_code_rename();

commit;

-- Sanity (after applying):
--   select tgname from pg_trigger where tgrelid = 'public.companies'::regclass and not tgisinternal;
--   -- expect companies_code_rename_cascade
--
-- End-to-end, on a throwaway code:
--   update public.companies set code = 'ZZTEST' where code = 'IMKO';
--   select count(*) from public.entity_aliases
--    where entity_type = 'gesellschaft' and entity_code = 'IMKO';        -- expect 0
--   select count(*) from public.invoices i join public.companies c on c.id = i.company_id
--    where i.company_code is not null and i.company_code <> c.code;      -- expect 0
--   update public.companies set code = 'IMKO' where code = 'ZZTEST';     -- and back
