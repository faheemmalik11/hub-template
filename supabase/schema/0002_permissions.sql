-- What may be done here, who may do it, and what this client uses at all.
--
-- Two questions, kept apart and answered in one place:
--   entitlement  does this client use this feature. `default_enabled`, overridden per client in
--                feature_settings. It can only ever remove.
--   permission   may this person use it. role_permissions, deviated per person in user_permissions.
--
-- Everything reads the answer through current_permissions(), including RLS, so the menu, a typed
-- URL and the database can never disagree.
--
-- This file holds the MECHANISM and no keys. The catalogue is project data and lives in
-- supabase/catalogue.sql, which a client's own set replaces wholesale.

begin;

create table if not exists public.permissions (
    key text primary key,
    -- module, page, section or action. A module owns pages, a page owns sections and actions.
    kind text not null default 'action',
    parent_key text references public.permissions(key) on delete cascade,
    category text not null default '',
    label_de text not null default '',
    label_en text not null default '',
    description_de text,
    description_en text,
    -- What the product ships with. The client's own answer, if any, is in feature_settings.
    default_enabled boolean not null default true,
    -- Some things may never be switched off: the overview, a person's own profile, and the screen
    -- where rights are administered, because a client who hides it cannot put it back.
    locked boolean not null default false,
    sort_order integer not null default 100,
    constraint permissions_kind_known check (kind in ('module', 'page', 'section', 'action')),
    constraint permissions_not_its_own_parent check (parent_key is distinct from key)
);

create index if not exists permissions_parent_idx on public.permissions (parent_key);

create table if not exists public.role_permissions (
    role_id uuid not null references public.roles(id) on delete cascade,
    permission_key text not null references public.permissions(key) on delete cascade,
    primary key (role_id, permission_key)
);

create table if not exists public.user_permissions (
    user_id uuid not null references public.app_users(id) on delete cascade,
    permission_key text not null references public.permissions(key) on delete cascade,
    -- false is a REVOKE, not an absent row. An absent row means inherit the role.
    granted boolean not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, permission_key)
);

-- What a feature cannot work without.
--
-- Containment is already expressed by parent_key: switching a module off takes its pages with it.
-- This is the other kind of dependency, the one that crosses the tree. Open items are a list of
-- documents the bank has not covered, so they need banking; a payment needs documents to pay.
-- Without this a client switches banking off and keeps a screen that can only ever be empty.
--
-- Declared in the catalogue, because which features a client's product needs is project data.
create table if not exists public.feature_requirements (
    feature_key text not null references public.permissions(key) on delete cascade,
    requires_key text not null references public.permissions(key) on delete cascade,
    primary key (feature_key, requires_key),
    constraint feature_requirements_not_itself check (feature_key <> requires_key)
);

-- Only what somebody switched. No row means default_enabled decides, so a feature added later
-- arrives on without touching anyone's data.
create table if not exists public.feature_settings (
    feature_key text primary key references public.permissions(key) on delete cascade,
    enabled boolean not null,
    updated_by uuid references public.app_users(id),
    updated_at timestamptz not null default now()
);

-- Which features are live for this client.
--
-- Two kinds of dependency, both resolved here:
--   containment  a page belongs to a module, so switching the module off takes the page with it.
--   requirement  a feature cannot work without another one that is not its parent. Open items are
--                documents the bank has not covered, so they need banking.
--
-- Requirements chain, and a chain cannot be expressed in one recursive query because it needs
-- negation, so the set is narrowed until a pass removes nothing.
create or replace function public.live_features() returns table (key text)
language plpgsql stable set search_path to 'public'
as $$
declare
  v_live text[];
  v_before integer;
begin
  select coalesce(array_agg(c.key), '{}')
    into v_live
    from (
      with recursive resolved as (
        select p.key, p.parent_key, coalesce(f.enabled, p.default_enabled) as on_here
          from public.permissions p
          left join public.feature_settings f on f.feature_key = p.key
      ),
      contained as (
        select r.key from resolved r where r.parent_key is null and r.on_here
        union all
        select r.key
          from resolved r
          join contained parent on parent.key = r.parent_key
         where r.on_here
      )
      select contained.key from contained
    ) c;

  loop
    v_before := coalesce(array_length(v_live, 1), 0);
    select coalesce(array_agg(k), '{}')
      into v_live
      from unnest(v_live) as k
     where not exists (
       select 1
         from public.feature_requirements fr
        where fr.feature_key = k
          and not fr.requires_key = any (v_live)
     );
    exit when coalesce(array_length(v_live, 1), 0) = v_before;
  end loop;

  return query select unnest(v_live);
end;
$$;

-- The effective set for the caller: role defaults, deviated per person, then narrowed to what this
-- client actually uses.
create or replace function public.current_permissions() returns setof text
language sql stable security definer set search_path to 'public'
as $$
  with me as (
    select u.id, u.role_id
      from public.app_users u
     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and u.is_active
     limit 1
  )
  select p.key
    from public.permissions p
    cross join me
    left join public.user_permissions up on up.user_id = me.id and up.permission_key = p.key
    left join public.role_permissions rp on rp.role_id = me.role_id and rp.permission_key = p.key
   where coalesce(up.granted, rp.permission_key is not null)
     and p.key in (select key from public.live_features());
$$;

create or replace function public.has_permission(p_key text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.current_permissions() k where k = p_key);
$$;

-- The catalogue as the two editors need it: the panel during onboarding, and a client's own screen
-- if they are ever given one.
--
-- `effective` is worked out here so nobody re-derives it in TypeScript, and `off_because` says WHY
-- a feature is off, so a screen can tell a client "this is off because banking is off" instead of
-- showing a switch that appears to be theirs to flip and is not.
drop function if exists public.feature_tree();
create or replace function public.feature_tree()
returns table (
    key text, parent_key text, kind text, category text,
    label_de text, label_en text, sort_order integer,
    locked boolean, default_enabled boolean, chosen boolean,
    effective boolean, requires text[], off_because text
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
         end
    from public.permissions p
    left join public.feature_settings f on f.feature_key = p.key
   order by p.sort_order, p.key;
$$;

revoke execute on function public.current_permissions() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.live_features() from public, anon;
revoke execute on function public.feature_tree() from public, anon;
grant execute on function public.current_permissions() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.live_features() to authenticated;
grant execute on function public.feature_tree() to authenticated;

-- A locked feature stays on whatever arrives over the API, because a disabled switch in a screen is
-- not a boundary.
create or replace function public.guard_locked_feature() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.enabled = false
     and exists (select 1 from public.permissions p where p.key = new.feature_key and p.locked) then
    raise exception 'This feature cannot be switched off.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists feature_settings_locked on public.feature_settings;
create trigger feature_settings_locked before insert or update on public.feature_settings
    for each row execute function public.guard_locked_feature();

-- A protected role keeps everything, enforced here rather than by a screen. Which role that is
-- comes from roles.protected, never from a name.
create or replace function public.guard_protected_role_permissions() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.app_users u join public.roles r on r.id = u.role_id
     where u.id = coalesce(new.user_id, old.user_id) and r.protected
  ) then
    if tg_op = 'DELETE' then return null; end if;
    new.granted := true;
  end if;
  return new;
end;
$$;

drop trigger if exists user_permissions_protected_role on public.user_permissions;
create trigger user_permissions_protected_role before insert or update or delete on public.user_permissions
    for each row execute function public.guard_protected_role_permissions();

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.feature_requirements enable row level security;
alter table public.feature_settings enable row level security;

-- The catalogue is readable by anyone signed in, because a screen has to render the labels and has
-- to tell "this client does not use it" apart from "you have no access".
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

drop policy if exists user_permissions_read on public.user_permissions;
create policy user_permissions_read on public.user_permissions for select to authenticated
    using (public.is_admin() or user_id = public.current_app_user_id());

drop policy if exists user_permissions_write on public.user_permissions;
create policy user_permissions_write on public.user_permissions for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

drop policy if exists feature_requirements_read on public.feature_requirements;
create policy feature_requirements_read on public.feature_requirements for select to authenticated using (true);

drop policy if exists feature_settings_read on public.feature_settings;
create policy feature_settings_read on public.feature_settings for select to authenticated using (true);

drop policy if exists feature_settings_write on public.feature_settings;
create policy feature_settings_write on public.feature_settings for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- Now that has_permission exists, the two identity policies from 0001 can widen.
--
-- `users.read` is the one key this mechanism names, and it is a contract rather than a screen: a
-- catalogue that declares it lets somebody read the team without administering it, and a catalogue
-- that does not simply leaves reading to administering roles. No project's page name appears here.
drop policy if exists app_users_admin_read on public.app_users;
create policy app_users_admin_read on public.app_users for select to authenticated
    using (public.is_admin() or public.has_permission('users.read'));

drop policy if exists user_company_access_read on public.user_company_access;
create policy user_company_access_read on public.user_company_access for select to authenticated
    using (public.is_admin() or public.has_permission('users.read') or user_id = public.current_app_user_id());

commit;
