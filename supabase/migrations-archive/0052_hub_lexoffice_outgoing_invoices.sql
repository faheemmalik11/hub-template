-- 0039_lexoffice_outgoing_invoices.sql
-- Briefing Screen 15 ("Outgoing invoices & customers via LexOffice"). Data model only — the actual
-- LexOffice API calls (create contact, create draft invoice, sync) live in
-- src/lib/api/lexoffice.functions.ts, a TanStack Start server function in this app, same
-- convention as migration 0038's DATEV handover (see that file's own header comment for why
-- createServerFn over a Supabase Edge Function).
--
-- The client's own rule for this screen is narrow and explicit: LexOffice is the source of truth
-- for outgoing invoices, this app only assists creation and mirrors status. Consequences for this
-- schema:
--   * `customers`/`outgoing_invoices` are local MIRRORS, not the authoritative record. Neither
--     table grants `authenticated` a direct INSERT (and `outgoing_invoices` grants no direct
--     UPDATE either) — every write goes through the server function using the service-role
--     client, so "create a customer" and "create an invoice" always mean "create it in LexOffice
--     first, then mirror it here", never a local-only row a sync could later collide with.
--     `customers` DOES allow a direct `authenticated` UPDATE, but only for the soft-delete
--     columns in practice (mirrors `suppliers`' existing convention) — hiding a customer locally
--     has no LexOffice-side effect to keep in sync.
--   * No delete/soft-delete columns on `outgoing_invoices` — there is no "delete an invoice"
--     action to build locally; the LexOffice voucher is the real record regardless of what this
--     app shows.
--
-- `lexoffice_config.api_key` gets the exact same confidentiality mechanish as
-- `datev_routes.address` (migration 0038): an API key is at least as sensitive as an upload
-- address — it's read/write access to the client's whole LexOffice account. `authenticated` gets
-- SELECT on every column except `api_key`, no direct INSERT/UPDATE at all, two SECURITY DEFINER
-- RPCs `set_lexoffice_config()`/`update_lexoffice_config_status()` copied 1:1 from
-- `set_datev_route()`/`update_datev_route_status()`. One row per company by design: this encodes
-- "one LexOffice account = one company" as the default shape without hard-blocking on Philipp's
-- confirmation whether several companies actually share one LexOffice org — if they do, the same
-- key just gets entered into more than one row, no schema change needed either way.
--
-- Deliberately NOT built here:
--   * No FK from outgoing_invoices into invoice_transaction_matches / bank_transactions. Real
--     bank-matching for outgoing invoices (a symmetric "open items" view against `eingehend`
--     transactions) is a clean, independently buildable follow-up once this mirror exists — see
--     the plan file / PR description for the reasoning (migration 0024's matching functions are
--     written specifically against invoice_id, and this round's acceptance criteria only require
--     mirroring LexOffice's own voucherStatus, not recomputing it from the bank feed).
--   * No DATEV delivery path for outgoing invoices — still open with the tax advisor per the
--     briefing. datev_routes.direction = 'outgoing' rows can already be entered (migration 0038)
--     but nothing reads them for a send, and nothing here changes that.
--
-- Live schema naming: targets the English-renamed live names (`companies`), same as 0025/0035/
-- 0036/0038 — NOT the German names in the stale `supabase/schema.sql` snapshot.
--
-- Idempotent throughout: `if not exists`, `drop policy/trigger if exists`, lookup-driven `do`
-- blocks.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'companies'
  ) then
    raise exception 'Migration 0039 preconditions failed: table companies is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. customers — sales-side master data, mirrors `suppliers`' shape
-- ===========================================================================
create table if not exists public.customers (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id),
  lexoffice_contact_id  uuid unique,
  is_company            boolean not null default true,
  name                  text not null,
  contact_person        text,
  email                 text,
  phone                 text,
  address_street        text,
  address_zip           text,
  address_city          text,
  address_country_code  text not null default 'DE',
  vat_id                text,
  customer_number       text,
  normalized_name       text,
  source                text not null default 'app' check (source in ('app', 'lexoffice')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  deleted_by            text,
  delete_reason         text
);

create index if not exists idx_customers_company_id on public.customers (company_id);
create index if not exists idx_customers_live on public.customers (company_id) where deleted_at is null;

alter table public.customers enable row level security;

drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers for select to authenticated using (true);

-- Soft-delete (hide locally) is the only direct write `authenticated` gets — mirrors `suppliers`.
-- No INSERT policy: a customer only ever gets created by the server function (LexOffice contact
-- first, then the local row via the service-role client), never as a local-only row.
drop policy if exists "customers_update" on public.customers;
create policy "customers_update" on public.customers for update to authenticated
  using (true) with check (true);

-- ===========================================================================
-- 2. outgoing_invoices — local mirror of a LexOffice invoice voucher
-- ===========================================================================
create table if not exists public.outgoing_invoices (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies(id),
  customer_id            uuid not null references public.customers(id),
  lexoffice_voucher_id   uuid not null unique,
  voucher_number         text,
  voucher_status         text not null default 'draft'
                           check (voucher_status in ('draft', 'open', 'paidoff', 'voided')),
  voucher_date           date,
  due_date               date,
  amount_net             numeric,
  amount_gross           numeric,
  currency               text not null default 'EUR',
  line_items             jsonb,
  source                 text not null default 'app' check (source in ('app', 'lexoffice')),
  dunning_level          int,
  dunning_due_date       date,
  created_by             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  last_synced_at         timestamptz
);

create index if not exists idx_outgoing_invoices_company_id on public.outgoing_invoices (company_id);
create index if not exists idx_outgoing_invoices_customer_id on public.outgoing_invoices (customer_id);
create index if not exists idx_outgoing_invoices_status on public.outgoing_invoices (voucher_status);

alter table public.outgoing_invoices enable row level security;

drop policy if exists "outgoing_invoices_select" on public.outgoing_invoices;
create policy "outgoing_invoices_select" on public.outgoing_invoices for select to authenticated using (true);

-- No INSERT/UPDATE policy at all — every write (creation AND every sync update) goes through the
-- server function's service-role client. Nobody, including this app's own front-end, can hand-edit
-- the mirror directly; it always reflects what the server function last fetched from LexOffice.

-- ===========================================================================
-- 3. lexoffice_config — per-company API key, blind-write like datev_routes.address
-- ===========================================================================
create table if not exists public.lexoffice_config (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  api_key     text not null,
  is_enabled  boolean not null default true,
  note        text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id)
);

alter table public.lexoffice_config enable row level security;

drop policy if exists "lexoffice_config_select" on public.lexoffice_config;
create policy "lexoffice_config_select" on public.lexoffice_config for select to authenticated using (true);

drop policy if exists "lexoffice_config_insert" on public.lexoffice_config;
drop policy if exists "lexoffice_config_update" on public.lexoffice_config;
revoke insert, update on public.lexoffice_config from authenticated;

revoke select on public.lexoffice_config from authenticated;
grant select (id, company_id, is_enabled, note, updated_by, created_at, updated_at)
  on public.lexoffice_config to authenticated;

create or replace function public.set_lexoffice_config(
  p_company_id  uuid,
  p_api_key     text,
  p_is_enabled  boolean,
  p_note        text,
  p_updated_by  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lexoffice_config (company_id, api_key, is_enabled, note, updated_by, updated_at)
  values (p_company_id, p_api_key, p_is_enabled, p_note, p_updated_by, now())
  on conflict (company_id) do update set
    api_key    = excluded.api_key,
    is_enabled = excluded.is_enabled,
    note       = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.set_lexoffice_config(uuid, text, boolean, text, text) to authenticated;

create or replace function public.update_lexoffice_config_status(
  p_id          uuid,
  p_is_enabled  boolean,
  p_note        text,
  p_updated_by  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lexoffice_config
     set is_enabled = p_is_enabled, note = p_note, updated_by = p_updated_by, updated_at = now()
   where id = p_id;
end;
$$;

grant execute on function public.update_lexoffice_config_status(uuid, boolean, text, text) to authenticated;

-- ===========================================================================
-- 4. lexoffice_sync_log — one row per "Jetzt synchronisieren" run, never the api_key
-- ===========================================================================
create table if not exists public.lexoffice_sync_log (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id),
  status             text not null check (status in ('success', 'error')),
  invoices_synced    int not null default 0,
  customers_synced   int not null default 0,
  error_message      text,
  triggered_by       text,
  created_at         timestamptz not null default now()
);

alter table public.lexoffice_sync_log enable row level security;
drop policy if exists "lexoffice_sync_log_select" on public.lexoffice_sync_log;
create policy "lexoffice_sync_log_select" on public.lexoffice_sync_log
  for select to authenticated using (true);
-- No insert/update policy for `authenticated` — only the server function (service-role) writes
-- these, exactly like datev_handover_batches/bank_sync_logs.

commit;

-- ===========================================================================
-- 5. Self-checks — catalog-based (no SET ROLE / RESET ROLE, see 0038's note on why), always
--    functional probes run inside a restrict_violation rollback sentinel.
-- ===========================================================================

-- 5a. `authenticated` has no SELECT privilege on lexoffice_config.api_key.
do $$
declare
  v_has_priv boolean;
begin
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'lexoffice_config'
       and column_name = 'api_key' and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) into v_has_priv;

  if v_has_priv then
    raise exception '0039 self-check 5a FAILED: authenticated has SELECT privilege on lexoffice_config.api_key';
  end if;

  raise notice '0039 self-check 5a ok: authenticated has no SELECT privilege on lexoffice_config.api_key';
end $$;

-- 5b. `authenticated` CAN still select every other lexoffice_config column.
do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
    from unnest(array[
      'id', 'company_id', 'is_enabled', 'note', 'updated_by', 'created_at', 'updated_at'
    ]) as col
   where not exists (
     select 1 from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'lexoffice_config'
        and column_name = col and grantee = 'authenticated' and privilege_type = 'SELECT'
   );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception '0039 self-check 5b FAILED: authenticated is missing SELECT on: %', array_to_string(v_missing, ', ');
  end if;

  raise notice '0039 self-check 5b ok: authenticated can select every lexoffice_config column except api_key';
end $$;

-- 5c. `authenticated` has no direct INSERT/UPDATE on lexoffice_config (checked via the actual
-- table-privilege GRANT, since that table's protection genuinely IS grant-based — REVOKE + RPC,
-- mirroring datev_routes.address). `customers`/`outgoing_invoices` are checked differently below
-- (5c') — a fresh Supabase project attaches its own default INSERT/UPDATE/DELETE grants to
-- `authenticated` on every newly created public table (confirmed against the live project: this
-- is normal, not a leftover misconfiguration), so testing information_schema.table_privileges for
-- those two tables would fail even though writes are genuinely blocked — RLS with no matching
-- policy denies the operation regardless of the underlying GRANT. Only lexoffice_config needed the
-- grant explicitly revoked here, because column-level SELECT protection (5a/5b) has no RLS
-- equivalent — RLS governs rows, not columns.
do $$
declare
  v_bad text[] := array[]::text[];
  v_row record;
begin
  for v_row in
    select * from (values
      ('lexoffice_config', 'INSERT'),
      ('lexoffice_config', 'UPDATE')
    ) as t(table_name, privilege_type)
  loop
    if exists (
      select 1 from information_schema.table_privileges
       where table_schema = 'public' and table_name = v_row.table_name
         and grantee = 'authenticated' and privilege_type = v_row.privilege_type
    ) then
      v_bad := v_bad || (v_row.table_name || '.' || v_row.privilege_type);
    end if;
  end loop;

  if array_length(v_bad, 1) > 0 then
    raise exception '0039 self-check 5c FAILED: authenticated unexpectedly has: %', array_to_string(v_bad, ', ');
  end if;

  raise notice '0039 self-check 5c ok: authenticated has no direct GRANT-level write path to lexoffice_config';
end $$;

-- 5c'. customers/outgoing_invoices: RLS is enabled and no INSERT (customers) / INSERT+UPDATE
-- (outgoing_invoices) policy exists for `authenticated` — this IS the actual boundary Postgres
-- enforces for these two tables (see the note above 5c on why a raw GRANT check doesn't apply
-- here the way it does for lexoffice_config).
do $$
declare
  v_bad text[] := array[]::text[];
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'customers' and rowsecurity
  ) then
    v_bad := v_bad || 'customers does not have row level security enabled';
  end if;
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'outgoing_invoices' and rowsecurity
  ) then
    v_bad := v_bad || 'outgoing_invoices does not have row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'customers'
       and cmd in ('INSERT', 'ALL') and 'authenticated' = any(roles)
  ) then
    v_bad := v_bad || 'customers has an INSERT policy for authenticated';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'outgoing_invoices'
       and cmd in ('INSERT', 'ALL') and 'authenticated' = any(roles)
  ) then
    v_bad := v_bad || 'outgoing_invoices has an INSERT policy for authenticated';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'outgoing_invoices'
       and cmd in ('UPDATE', 'ALL') and 'authenticated' = any(roles)
  ) then
    v_bad := v_bad || 'outgoing_invoices has an UPDATE policy for authenticated';
  end if;

  if array_length(v_bad, 1) > 0 then
    raise exception '0039 self-check 5c'' FAILED: %', array_to_string(v_bad, '; ');
  end if;

  raise notice '0039 self-check 5c'' ok: RLS blocks authenticated from writing customers/outgoing_invoices directly, regardless of the catalog-level GRANT this Supabase project attaches by default';
end $$;

-- 5d. `authenticated` CAN execute both lexoffice_config write RPCs.
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'set_lexoffice_config'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    v_missing := v_missing || 'set_lexoffice_config';
  end if;

  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'update_lexoffice_config_status'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    v_missing := v_missing || 'update_lexoffice_config_status';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '0039 self-check 5d FAILED: authenticated is missing EXECUTE on: %', array_to_string(v_missing, ', ');
  end if;

  raise notice '0039 self-check 5d ok: authenticated can execute both lexoffice_config write RPCs';
end $$;

-- 5e. set_lexoffice_config inserts, then updates on conflict (never duplicates a company row);
-- update_lexoffice_config_status only ever touches is_enabled/note, never api_key.
do $$
declare
  v_company_id uuid;
  v_id         uuid;
  v_enabled    boolean;
  v_note       text;
begin
  select id into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise notice '0039 self-check 5e skipped: no company available to probe';
  else
    delete from public.lexoffice_config where company_id = v_company_id;

    perform public.set_lexoffice_config(v_company_id, 'probe-key-1', true, 'first', 'tester');
    select id, is_enabled, note into v_id, v_enabled, v_note
      from public.lexoffice_config where company_id = v_company_id;
    if v_id is null or v_enabled is distinct from true or v_note is distinct from 'first' then
      raise exception '0039 self-check 5e FAILED: set_lexoffice_config did not insert correctly';
    end if;

    perform public.set_lexoffice_config(v_company_id, 'probe-key-2', false, 'second', 'tester');
    select is_enabled, note into v_enabled, v_note from public.lexoffice_config where id = v_id;
    if v_enabled is distinct from false or v_note is distinct from 'second' then
      raise exception '0039 self-check 5e FAILED: set_lexoffice_config did not update on conflict';
    end if;

    perform public.update_lexoffice_config_status(v_id, true, 'third', 'tester');
    select is_enabled, note into v_enabled, v_note from public.lexoffice_config where id = v_id;
    if v_enabled is distinct from true or v_note is distinct from 'third' then
      raise exception '0039 self-check 5e FAILED: update_lexoffice_config_status did not apply';
    end if;

    raise notice '0039 self-check 5e ok: set_lexoffice_config upserts correctly, update_lexoffice_config_status only touches is_enabled/note';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0039 self-check 5e rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 5f. outgoing_invoices.customer_id FK is enforced (a mistargeted mirror row is rejected, not
-- silently orphaned).
do $$
declare
  v_company_id uuid;
  v_bad_ref    boolean := false;
begin
  select id into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise notice '0039 self-check 5f skipped: no company available to probe';
  else
    begin
      insert into public.outgoing_invoices (company_id, customer_id, lexoffice_voucher_id)
      values (v_company_id, gen_random_uuid(), gen_random_uuid());
      v_bad_ref := true; -- should never be reached
    exception
      when foreign_key_violation then
        v_bad_ref := false;
    end;

    if v_bad_ref then
      raise exception '0039 self-check 5f FAILED: outgoing_invoices.customer_id accepted a non-existent customer';
    end if;

    raise notice '0039 self-check 5f ok: outgoing_invoices.customer_id FK is enforced';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0039 self-check 5f rollback';
exception
  when restrict_violation then
    null;
end $$;

-- Sanity (run manually after applying):
--   select company_id, is_enabled, note from public.lexoffice_config;
--   select company_id, voucher_status, count(*) from public.outgoing_invoices group by 1, 2 order by 1;
