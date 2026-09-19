-- Who a person is, and which role they hold.
--
-- The role is a label, not a decision. What a role may do lives in 0002_permissions, so an
-- intermediate level is a row somebody adds rather than a migration somebody writes.
--
-- Written for any client. No business, no area names, no seeded people.

begin;

create table if not exists public.roles (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    label text not null default '',
    -- Whether this role may be handed out in the team screen.
    assignable boolean not null default true,
    -- Whether this role administers: manages people, rights and settings. A flag rather than a name,
    -- so a client can call its roles anything and add levels without a migration.
    administers boolean not null default false,
    -- A protected role cannot be assigned, deactivated, renamed or deleted. The break-glass account.
    protected boolean not null default false,
    sort_order integer not null default 100,
    created_at timestamptz not null default now()
);

comment on table public.roles is 'A preset over the permission catalogue. Roles decide nothing by themselves.';

create table if not exists public.app_users (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid,
    email text not null,
    name text,
    role_id uuid references public.roles(id),
    is_active boolean not null default false,
    must_change_password boolean not null default false,
    picture_url text,
    -- Who stands in while this person is away, and after how many days it escalates to them.
    deputy_user_id uuid references public.app_users(id),
    escalation_days integer,
    -- A client may split its business into areas. The names are that client's data, never a list here.
    area text,
    covers_all_areas boolean not null default false,
    slack_user_id text,
    notifications_seen_at timestamptz,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint app_users_area_shape check ((area is null) or (not covers_all_areas)),
    constraint app_users_deputy_not_self check ((deputy_user_id is null) or (deputy_user_id <> id)),
    constraint app_users_escalation_days_positive check ((escalation_days is null) or (escalation_days > 0))
);

create unique index if not exists app_users_email_lower_idx on public.app_users (lower(email));
create index if not exists app_users_role_id_idx on public.app_users (role_id);
create unique index if not exists app_users_one_active_per_area on public.app_users (area)
    where area is not null and is_active;

-- Which companies a person may see. No live rows for a person means no restriction, which is what
-- lets a single-company client ignore this table entirely.
--
-- A grant is withdrawn by setting deleted_at, never by deleting the row: who could see what, and
-- until when, is exactly the question an access review asks. The row also stays so the same grant
-- can be given back by clearing the field rather than by inserting a second one.
create table if not exists public.user_company_access (
    user_id uuid not null references public.app_users(id) on delete cascade,
    -- No foreign key: companies are created in 0003, and identity must stand on its own.
    company_id uuid not null,
    -- Room for a grant that is recorded but not active, without deleting it.
    can_view boolean not null default true,
    granted_at timestamptz not null default now(),
    granted_by uuid,
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    primary key (user_id, company_id)
);

create index if not exists user_company_access_company_idx on public.user_company_access (company_id);

-- The person behind the current request, resolved from the token's email rather than trusted from
-- the client. Security definer because the caller cannot read other people's rows.
create or replace function public.current_app_user_id() returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select id
    from public.app_users
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and is_active
   limit 1;
$$;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path to 'public'
as $$
  select r.name
    from public.app_users u
    join public.roles r on r.id = u.role_id
   where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and u.is_active
   limit 1;
$$;

-- Reads the flag on the role, never a role name, so the role set stays the client's own.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((
    select r.administers
      from public.app_users u
      join public.roles r on r.id = u.role_id
     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and u.is_active
     limit 1
  ), false);
$$;

-- The break-glass account is guarded in the database, not by a disabled button: any admin can reach
-- these tables directly through the API, so the rule has to live where the write lands. Which role
-- is protected is data, in roles.protected.
create or replace function public.guard_protected_role_row() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_old_protected boolean;
  v_new_protected boolean;
begin
  if tg_op = 'DELETE' then
    select protected into v_old_protected from public.roles where id = old.role_id;
    if coalesce(v_old_protected, false) then
      raise exception 'This account cannot be deleted.' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  select protected into v_old_protected from public.roles where id = old.role_id;
  select protected into v_new_protected from public.roles where id = new.role_id;

  if coalesce(v_new_protected, false) and not coalesce(v_old_protected, false) then
    raise exception 'This role cannot be assigned.' using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(v_old_protected, false) then
    return new;
  end if;

  if new.is_active is distinct from old.is_active and new.is_active = false then
    raise exception 'This account cannot be deactivated.' using errcode = 'insufficient_privilege';
  end if;

  if new.role_id is distinct from old.role_id then
    raise exception 'This account cannot change role.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace function public.guard_protected_role_insert() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if exists (select 1 from public.roles where id = new.role_id and protected) then
    raise exception 'This role cannot be assigned.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists app_users_protected_role_no_insert on public.app_users;
create trigger app_users_protected_role_no_insert before insert on public.app_users
    for each row execute function public.guard_protected_role_insert();

drop trigger if exists app_users_protected_role_stays_active on public.app_users;
create trigger app_users_protected_role_stays_active before update on public.app_users
    for each row execute function public.guard_protected_role_row();

drop trigger if exists app_users_protected_role_no_delete on public.app_users;
create trigger app_users_protected_role_no_delete before delete on public.app_users
    for each row execute function public.guard_protected_role_row();

alter table public.roles enable row level security;
alter table public.app_users enable row level security;
alter table public.user_company_access enable row level security;

-- Every policy is dropped before it is created. Postgres ORs permissive policies of the same
-- command together, so one stale `using (true)` left behind makes every scoped policy meaningless.
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);

drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

drop policy if exists app_users_self_read on public.app_users;
create policy app_users_self_read on public.app_users for select to authenticated
    using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Widened in 0002 to include has_permission('page.team'), once that function exists.
drop policy if exists app_users_admin_read on public.app_users;
create policy app_users_admin_read on public.app_users for select to authenticated
    using (public.is_admin());

drop policy if exists app_users_admin_insert on public.app_users;
create policy app_users_admin_insert on public.app_users for insert to authenticated
    with check (public.is_admin());

drop policy if exists app_users_admin_update on public.app_users;
create policy app_users_admin_update on public.app_users for update to authenticated
    using (public.is_admin()) with check (public.is_admin());

-- Also widened in 0002, same reason.
drop policy if exists user_company_access_read on public.user_company_access;
create policy user_company_access_read on public.user_company_access for select to authenticated
    using (public.is_admin() or user_id = public.current_app_user_id());

drop policy if exists user_company_access_write on public.user_company_access;
create policy user_company_access_write on public.user_company_access for all to authenticated
    using (public.is_admin()) with check (public.is_admin());

commit;
