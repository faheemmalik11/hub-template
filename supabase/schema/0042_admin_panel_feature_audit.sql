begin;

alter table public.permissions
    add column if not exists shown_in_admin_panel boolean not null default true;

do $$
declare
  v_constraint text;
begin
  select tc.constraint_name
    into v_constraint
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
   where tc.table_schema = 'public'
     and tc.table_name = 'feature_settings'
     and tc.constraint_type = 'FOREIGN KEY'
     and kcu.column_name = 'updated_by';
  if v_constraint is not null then
    execute format('alter table public.feature_settings drop constraint %I', v_constraint);
  end if;
end;
$$;

alter table public.feature_settings
    alter column updated_by type text using updated_by::text;

create table if not exists public.feature_settings_history (
    id bigserial primary key,
    feature_key text not null,
    enabled boolean,
    changed_at timestamptz not null default now(),
    changed_by text,
    operation text
);

create index if not exists feature_settings_history_changed
    on public.feature_settings_history (changed_at desc);

create or replace function public.feature_settings_audit() returns trigger
language plpgsql set search_path to 'public'
as $$
begin
    if tg_op = 'UPDATE' and new.enabled is not distinct from old.enabled then
        return new;
    end if;
    if tg_op = 'DELETE' then
        insert into public.feature_settings_history (feature_key, enabled, changed_by, operation)
        values (old.feature_key, old.enabled, old.updated_by, 'delete');
        return old;
    end if;
    insert into public.feature_settings_history (feature_key, enabled, changed_by, operation)
    values (new.feature_key, new.enabled, new.updated_by, lower(tg_op));
    return new;
end;
$$;

drop trigger if exists feature_settings_audit on public.feature_settings;
create trigger feature_settings_audit before insert or update or delete on public.feature_settings
    for each row execute function public.feature_settings_audit();

drop function if exists public.feature_tree();
create or replace function public.feature_tree()
returns table (
    key text, parent_key text, kind text, category text,
    label_de text, label_en text, sort_order integer,
    locked boolean, default_enabled boolean, chosen boolean,
    effective boolean, requires text[], off_because text,
    shown_in_admin_panel boolean
)
language sql stable set search_path to 'public'
as $$
  with live as (select key from public.live_features())
  select p.key, p.parent_key, p.kind, p.category,
         p.label_de, p.label_en, p.sort_order,
         p.locked, p.default_enabled, f.enabled,
         p.key in (select key from live),
         coalesce((select array_agg(fr.requires_key order by fr.requires_key)
                     from public.feature_requirements fr
                    where fr.feature_key = p.key), '{}'),
         case
           when p.key in (select key from live) then null
           when not coalesce(f.enabled, p.default_enabled) then 'switched off here'
           when p.parent_key is not null and p.parent_key not in (select key from live)
             then p.parent_key
           else (select fr.requires_key
                   from public.feature_requirements fr
                  where fr.feature_key = p.key
                    and fr.requires_key not in (select key from live)
                  order by fr.requires_key
                  limit 1)
         end,
         p.shown_in_admin_panel
    from public.permissions p
    left join public.feature_settings f on f.feature_key = p.key
   order by p.sort_order, p.key;
$$;

revoke execute on function public.feature_tree() from public, anon;
grant execute on function public.feature_tree() to authenticated;

commit;
