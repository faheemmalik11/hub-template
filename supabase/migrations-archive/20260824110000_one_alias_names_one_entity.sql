-- An alias claimed by two entities resolves to neither.
--
-- The pipeline builds {alias -> code} and drops any alias that two codes claim, because guessing
-- between them would file a document under the wrong company. So adding an alias another company
-- already has does not merely fail: it silences the one that used to work. The Hub allows it,
-- because its only unique index is on (entity_type, entity_code, alias).
--
-- This adds the missing one, and refuses to force it: where duplicates already exist it names them
-- and leaves the index uncreated, because only a person can decide which entity keeps an alias.
-- Fix those, run it again, and the index is created.
--
-- Cases it handles:
--   no entity_aliases table (another Hub schema)      skipped with a notice
--   no package_migrations table                        created
--   two entities claiming one alias                    named, index not created
--   one entity holding the same alias twice            named separately, it is a redundant row
--   case and inner whitespace ('A  B' = 'a b')         folded, so near-duplicates are caught
--   an alias that is blank once trimmed                left out of the index entirely
--   a soft-deleted alias, where the column exists      left out of the index
--   an inactive alias                                  left out, so it can always be re-added
--   run twice                                          changes nothing

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
declare
    folded   text := 'regexp_replace(lower(btrim(alias)), ''\s+'', '' '', ''g'')';
    live     text := 'is_active and btrim(coalesce(alias, '''')) <> ''''';
    clash    record;
    shared   int := 0;
    repeated int := 0;
begin
    if to_regclass('public.entity_aliases') is null then
        raise notice 'public.entity_aliases not found — nothing to constrain here';
        return;
    end if;

    -- Only where the column exists: a schema without soft deletes is a valid shape.
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'entity_aliases'
                  and column_name = 'deleted_at') then
        live := live || ' and deleted_at is null';
    end if;

    for clash in execute format($q$
        select entity_type,
               %1$s as alias,
               count(distinct entity_code) as owners,
               count(*) as rows_held,
               string_agg(distinct coalesce(entity_code, '(none)'), ', ') as claimed_by
          from public.entity_aliases
         where %2$s
         group by entity_type, %1$s
        having count(*) > 1
         order by 1, 2
    $q$, folded, live)
    loop
        if clash.owners > 1 then
            shared := shared + 1;
            raise notice 'alias % (%) is claimed by % — the pipeline resolves it to neither',
                clash.alias, clash.entity_type, clash.claimed_by;
        else
            repeated := repeated + 1;
            raise notice 'alias % (%) is held % times by % — the extra rows do nothing',
                clash.alias, clash.entity_type, clash.rows_held, clash.claimed_by;
        end if;
    end loop;

    if shared + repeated > 0 then
        raise notice
            '% alias(es) claimed by two entities and % held twice by one: deactivate the ones that '
            'should not win, in the Hub, then run this migration again',
            shared, repeated;
        return;
    end if;

    execute format(
        'create unique index if not exists entity_aliases_one_owner_uniq '
        '  on public.entity_aliases (entity_type, (%s)) where %s',
        folded, live
    );

    comment on index public.entity_aliases_one_owner_uniq is
        'One alias names one entity. Without it the Hub accepts a second claim and the pipeline '
        'then resolves that alias to nothing, silencing the entity that had it first.';
end $$;

insert into public.package_migrations (version)
values ('20260824110000_one_alias_names_one_entity')
on conflict (version) do nothing;
