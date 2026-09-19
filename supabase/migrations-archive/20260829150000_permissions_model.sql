-- A real permission model. Roles stop deciding anything; they become a preset.
--
-- WHY. Until now every capability and every screen was gated by a hardcoded role string, in at
-- least seven places: nextLegalActions' "manager" test, requirePaymentRole's role list,
-- JetztBezahlenSection, useEmployees (which rewrote an admin's stored capability to true before the
-- UI could see it), app-shell's ADMIN_ROLES/NOT_ASSISTANT arrays, and the six route guards. The
-- briefing asked for the opposite -- "the role structure is dynamic: intermediate levels must be
-- creatable WITHOUT changing code" (Screen 17 / A7) -- and docs/ROLES_AND_ACCESS.md §3 item 4 has
-- carried that as an open gap since the model was first built.
--
-- THE SHAPE.
--   permissions       the catalogue. One row per thing that can be granted.
--   role_permissions  what a role grants by default. Editable, so a new intermediate level is an
--                     admin action rather than a migration.
--   user_permissions  per-person override, either direction. granted=false REVOKES something the
--                     role would otherwise give, which is what makes "Saskia is an Admin but must
--                     not pay" expressible at all.
--
-- Effective = user override when one exists, otherwise the role default. Resolved once in
-- current_permissions() and read by everything else, so the browser, the Edge Functions and RLS
-- cannot drift apart.
--
-- PORTABLE. This file contains no permission KEYS at all -- only the mechanism. The catalogue and
-- the role defaults are project data and live in `supabase/permissions.seed.sql`, which a new
-- project replaces wholesale. Copy this migration to another Hub verbatim; supply that Hub's own
-- seed beside it.

begin;

create table if not exists public.permissions (
  key         text primary key,
  category    text not null,
  label_de    text not null,
  label_en    text not null,
  description text,
  sort_order  int not null default 100
);

create table if not exists public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table if not exists public.user_permissions (
  user_id        uuid not null references public.app_users(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  -- false is a REVOKE, not an absent row. An absent row means "inherit the role".
  granted        boolean not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- The effective set for the calling account, role defaults merged with personal overrides.
-- SECURITY DEFINER for the same reason has_company_access() is: it reads app_users/roles, which the
-- caller cannot select for other people.
create or replace function public.current_permissions()
returns setof text
language sql
stable
security definer
set search_path to 'public'
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
    left join public.user_permissions up
      on up.user_id = me.id and up.permission_key = p.key
    left join public.role_permissions rp
      on rp.role_id = me.role_id and rp.permission_key = p.key
   where coalesce(up.granted, rp.permission_key is not null);
$$;

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.current_permissions() k where k = p_key);
$$;

revoke execute on function public.current_permissions() from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
grant execute on function public.current_permissions() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- The break-glass account keeps everything, enforced in the database rather than by a disabled
-- switch -- app_users_admin_update has no column restriction, so any admin can PostgREST-update
-- these tables directly and a disabled prop is not a boundary. Same reasoning as
-- guard_super_admin_row().
create or replace function public.guard_super_admin_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.app_users u join public.roles r on r.id = u.role_id
     where u.id = coalesce(new.user_id, old.user_id) and r.name = 'super_admin'
  ) then
    if tg_op = 'DELETE' then return null; end if;
    new.granted := true;
  end if;
  return new;
end
$$;

drop trigger if exists user_permissions_super_admin on public.user_permissions;
create trigger user_permissions_super_admin
  before insert or update or delete on public.user_permissions
  for each row execute function public.guard_super_admin_permissions();

alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

-- The catalogue is readable by anyone signed in: the UI has to render the switch labels. Who HOLDS
-- what stays admin-only, except your own row, which the client needs to gate its own UI.
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists user_permissions_read on public.user_permissions;
create policy user_permissions_read on public.user_permissions for select to authenticated
  using (is_admin() or user_id = current_app_user_id());
drop policy if exists user_permissions_write on public.user_permissions;
create policy user_permissions_write on public.user_permissions for all to authenticated
  using (is_admin()) with check (is_admin());

-- payment_orders now asks the permission model instead of a bespoke can_pay helper. The
-- two-person clause is unchanged.
drop policy if exists payment_orders_insert on public.payment_orders;
create policy payment_orders_insert on public.payment_orders
  for insert to authenticated
  with check (
    has_company_access(company_id)
    and public.has_permission('invoices.pay')
    and not exists (
      select 1
        from public.invoices i
        join public.app_users u on u.id = i.approved_by
       where i.id = payment_orders.invoice_id
         and lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop function if exists public.current_can_pay();

commit;
