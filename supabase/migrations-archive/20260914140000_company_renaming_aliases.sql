-- The two pending renamings, as aliases rather than a rename.
--
--   Impuls 1 VV GmbH  ->  Stäy RE GmbH
--   Stäy GmbH         ->  Stäy AG
--
-- Both are still waiting on the commercial register, so for a while documents will arrive under
-- either name, and the old name has to keep resolving forever: an invoice from 2024 says
-- "Impuls 1 VV GmbH" and always will. That is exactly what entity_aliases is for (migration 0006),
-- so nothing is renamed and nothing is retired. The company keeps its code, and the new spelling
-- is simply one more way of saying it.
--
-- `companies.name` is deliberately NOT touched. It is the label the Hub prints, and printing "Stäy
-- AG" before the register entry would be a claim the client cannot yet make. Change it on the
-- Gesellschaften screen the day each registration lands; the aliases below need no revisiting.

begin;

-- NOT `on conflict`: migration 0053 made entity_aliases_uniq PARTIAL (`where is_active`), so a
-- plain three-column conflict target matches no index and the statement fails outright with 42P10.
-- `where not exists` needs no index at all, and it also skips a spelling that is sitting there
-- deactivated, which a conflict target scoped to active rows would happily duplicate.
--
-- The comparison folds case and inner whitespace, the same fold entity_aliases_one_owner_uniq
-- uses, so "Stäy  AG" does not slip past as a second row for the same name.
insert into public.entity_aliases (entity_type, entity_code, alias, note)
select v.entity_type, v.entity_code, v.alias, v.note
  from (values
    -- Impuls 1 VV GmbH becomes Stäy RE GmbH. The ae spelling matches the STAY/STGR rows already
    -- there, because a sender who cannot type an umlaut writes it that way.
    ('gesellschaft', 'IMPV', 'Stäy RE GmbH',  'New name, pending commercial register entry'),
    ('gesellschaft', 'IMPV', 'Staey RE GmbH', 'New name, ae spelling'),
    ('gesellschaft', 'IMPV', 'Stäy RE',       'New name, short form'),
    -- Stäy GmbH becomes Stäy AG.
    ('gesellschaft', 'STAY', 'Stäy AG',  'New legal form, pending commercial register entry'),
    ('gesellschaft', 'STAY', 'Staey AG', 'New legal form, ae spelling')
  ) as v(entity_type, entity_code, alias, note)
 where not exists (
   select 1
     from public.entity_aliases e
    where e.entity_type = v.entity_type
      and regexp_replace(lower(btrim(e.alias)), '\s+', ' ', 'g')
        = regexp_replace(lower(btrim(v.alias)), '\s+', ' ', 'g')
 );

commit;

-- CAREFUL, ONE THING TO WATCH. 'Stäy' on its own already resolves to STAY, and Impuls is becoming
-- "Stäy RE". Whether "Stäy RE GmbH" on a document resolves to IMPV or is swallowed by the shorter
-- 'Stäy' depends on how the pipeline matches, which lives in the book-keeping service, not here.
-- If it matches on containment rather than longest-alias-wins, every Stäy RE document lands on
-- STAY. Check that before the register entry, not after.
--
-- Sanity:
--   select entity_code, alias from entity_aliases
--    where entity_type = 'gesellschaft' order by entity_code, alias;
