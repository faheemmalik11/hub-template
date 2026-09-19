-- 0000_auth_foundation — app_users + roles.
--
-- WHY THIS FILE EXISTS
-- These two tables were never in version control. In immonetz they were created directly in
-- Supabase (Lovable scaffolding) and every repo says so explicitly:
--   * 0025_review_assign.sql:40  -- "created outside this repo (app_users, user_company_access)"
--   * 0051_change_history_rls.sql -- "since whenever this table was created"
--   * ai-mail-extraction/pipeline/db_schema.sql:423
--       -- "Hub-eigene Tabellen (bank_*, mailbox_*, tenants, roles, …) werden bewusst NICHT hier angefasst."
-- Searched staeyhub, immonetz (all branches + full history) and ai-mail-extraction: no DDL anywhere.
--
-- So this is a RECONSTRUCTION, derived from how the code and later migrations use the tables:
--   * 0046_roles_access_trash.sql — role_id, is_active, email, roles.name, drops tenant_id
--   * 0048_clear_must_change_password.sql — must_change_password
--   * 0025_review_assign.sql — user_company_access.user_id references app_users(id)
--   * src/lib/api/employees.functions.ts — the createEmployee insert payload
--
-- Deliberately NOT reproduced: the generic multi-tenant SaaS scaffolding (tenants, tenant_id,
-- the tenant_admin/user roles, seeded test accounts) that 0046 spends 400 lines removing.
-- Stäy is a single-tenant system; building it in only to drop it again would be theatre.
-- 0046's `drop column if exists tenant_id` and its cleanup deletes are all guarded, so they
-- no-op harmlessly against this schema.
--
-- MUST RUN FIRST: 0025 adds a foreign key to app_users(id).

begin;

-- ---------------------------------------------------------------------------
-- roles — fixed, small list. Not client data: these are the four access levels
-- the application checks by name (Appendix A7).
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.roles is
  'Fixed set of four roles: super_admin, admin, supervisor, assistant. Referenced by '
  'app_users.role_id and resolved by name in current_role_name() (see 0046).';

-- 0046 reseeds admin/supervisor/assistant and notes super_admin "already exists", so all four
-- are created here. on conflict keeps 0046 idempotent.
insert into public.roles (name)
  values ('super_admin'), ('admin'), ('supervisor'), ('assistant')
  on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- app_users — one row per person who can sign in. Bridges Supabase auth to a
-- named actor, a role, and the company grants in user_company_access.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id                   uuid primary key default gen_random_uuid(),

  -- Supabase auth user. Nullable so a row can exist briefly before the auth user is
  -- created (createEmployee inserts after auth.admin.createUser, but a failed rollback
  -- must not leave an unsatisfiable NOT NULL).
  auth_user_id         uuid unique references auth.users (id) on delete set null,

  -- Identity is matched on email, case-insensitively, against auth.jwt() ->> 'email'
  -- (see current_app_user_id() in 0046). The unique index below enforces that lookup
  -- can never return two rows.
  email                text not null,

  -- Display name -- shown wherever an approver/actor appears by name rather than email.
  name                 text,

  role_id              uuid references public.roles (id),

  -- New employees start inactive and are activated only after their company grants are
  -- written, so a half-created account can never see every company (see createEmployee).
  is_active            boolean not null default false,

  -- One-time temp password must be replaced before first use (0048 clears this).
  must_change_password boolean not null default false,

  created_by           uuid references public.app_users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.app_users is
  'One row per person who can sign in. Reconstructed in 0000 -- the original table was created '
  'outside version control. Matched to the session by lower(email) = lower(auth.jwt()->>''email'').';

-- Case-insensitive uniqueness: every lookup lowercases both sides, so two rows differing
-- only in case would make current_app_user_id() non-deterministic.
create unique index if not exists app_users_email_lower_idx
  on public.app_users (lower(email));

create index if not exists app_users_role_id_idx on public.app_users (role_id);

-- ---------------------------------------------------------------------------
-- RLS. 0046 layers admin-only write policies "on top of the existing self-read
-- policies" (its own words), so those self-read policies are created here.
-- Server-side writes use the service_role key, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.roles     enable row level security;

-- A signed-in user may read their own row -- needed for the app to resolve who it is.
drop policy if exists "app_users_self_read" on public.app_users;
create policy "app_users_self_read" on public.app_users
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Role names are not sensitive and must be readable to render the current user's role.
drop policy if exists "roles_authenticated_read" on public.roles;
create policy "roles_authenticated_read" on public.roles
  for select to authenticated
  using (true);

commit;
