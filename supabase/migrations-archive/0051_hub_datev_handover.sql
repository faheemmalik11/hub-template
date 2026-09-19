-- 0038_datev_handover.sql
-- Briefing Screen 9 ("DATEV handover"): once a receipt is paid and reconciled with a bank
-- transaction, it must be sent on to the tax advisor's DATEV upload mailbox. This migration adds
-- the data model only — the actual send (Gmail API call, ZUGFeRD conversion, batching) lives in
-- src/lib/api/datev-handover.functions.ts, a TanStack Start server function in this app (this
-- app's own convention over a Supabase Edge Function for logic that lives inside this repo — see
-- src/lib/api/example.functions.ts), not here.
--
-- Deliberately NOT built here (decided with the client before this migration):
--   * No cron/automatic trigger. Manual button only for this round — there's no return channel
--     from DATEV, so an unattended bad send just silently fails at the tax advisor's end.
--   * No outgoing-invoice sending. `ausgangsrechnungen` is still a "coming soon" placeholder in
--     this repo — there is no outgoing-invoice table to send from yet. `direction` still supports
--     'outgoing' so IMKO's outgoing route can be entered now (from 1Password) ahead of that
--     feature existing, but nothing reads it for an actual send yet.
--   * No seed data in datev_routes. The real upload addresses are confidential (client's own
--     briefing: stored in 1Password) — this migration creates the table empty; a human enters the
--     real IMKO/IMGM addresses via the app's own admin screen after this is pushed.
--
-- Confidentiality mechanism (the novel part of this migration): datev_routes.address is protected
-- by Postgres COLUMN-LEVEL privileges, not just RLS. `authenticated` gets SELECT on every column
-- except `address`, and NO direct INSERT/UPDATE at all — every write goes through the
-- SECURITY DEFINER RPCs set_datev_route()/update_datev_route_status() further down, a "blind
-- write": any admin can set or replace an address but can never read one back through the API,
-- including their own after saving it. Only this app's server-side `supabaseAdmin` client
-- (service-role, bypasses grants entirely) and these RPCs ever touch the real value.
--
-- Live schema naming: targets the English-renamed live names (`invoices`, `invoice_history`,
-- `companies`, `invoice_transaction_matches`), same as 0025/0035/0036 — NOT the German names in
-- the stale `supabase/schema.sql` snapshot.
--
-- Idempotent throughout: `if not exists`, `drop policy/trigger if exists`, lookup-driven `do`
-- blocks.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
  v_name    text;
begin
  foreach v_name in array array[
    'invoices', 'invoice_history', 'companies', 'invoice_transaction_matches'
  ]
  loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = v_name
    ) then
      v_missing := v_missing || v_name;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'amount_gross'
  ) then
    v_missing := v_missing || 'column invoices.amount_gross';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoice_transaction_matches'
       and column_name = 'amount_matched'
  ) then
    v_missing := v_missing || 'column invoice_transaction_matches.amount_matched';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Migration 0038 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. datev_routes — company x direction -> confidential upload address
-- ===========================================================================
create table if not exists public.datev_routes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  direction   text not null check (direction in ('incoming', 'outgoing')),
  address     text not null,
  is_enabled  boolean not null default true,
  note        text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, direction)
);

alter table public.datev_routes enable row level security;

drop policy if exists "datev_routes_select" on public.datev_routes;
create policy "datev_routes_select" on public.datev_routes for select to authenticated using (true);

-- Cleans up an earlier version of this migration that briefly ran against the live DB (committed
-- the table + a direct insert/update RLS policy and column grant, then failed later at the
-- self-checks — never reached the redesign below). Dropping/revoking unconditionally here makes
-- this migration converge to the same end state regardless of which partial version, if any, a
-- prior run left behind.
drop policy if exists "datev_routes_insert" on public.datev_routes;
drop policy if exists "datev_routes_update" on public.datev_routes;
revoke insert, update on public.datev_routes from authenticated;

-- No insert/update RLS policy for `authenticated` — every write goes through the
-- security-definer RPCs below instead of a direct table grant. Column-level grants alone cannot
-- support the upsert `authenticated` needs (Postgres's `INSERT ... ON CONFLICT DO UPDATE`, which
-- is what a blind "set or replace" write requires, additionally needs SELECT privilege internally
-- to resolve the conflict target — a restriction column grants cannot satisfy without also
-- granting the very SELECT on `address` this table exists to withhold). Routing writes through a
-- SECURITY DEFINER function sidesteps that: it runs with the function owner's (the table owner's)
-- full privileges regardless of what `authenticated` itself is granted, so RLS/grants on the
-- table stay exactly "read every column except address, write nothing directly" while the RPC is
-- still callable.
revoke select on public.datev_routes from authenticated;
grant select (id, company_id, direction, is_enabled, note, updated_by, created_at, updated_at)
  on public.datev_routes to authenticated;

create or replace function public.set_datev_route(
  p_company_id  uuid,
  p_direction   text,
  p_address     text,
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
  insert into public.datev_routes (company_id, direction, address, is_enabled, note, updated_by, updated_at)
  values (p_company_id, p_direction, p_address, p_is_enabled, p_note, p_updated_by, now())
  on conflict (company_id, direction) do update set
    address    = excluded.address,
    is_enabled = excluded.is_enabled,
    note       = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.set_datev_route(uuid, text, text, boolean, text, text) to authenticated;

-- The lighter path (useUpdateDatevRoute): flip is_enabled / edit note on an existing row without
-- touching the address at all — still via RPC, for the same reason as above, even though a plain
-- UPDATE (no ON CONFLICT) would not actually have hit the SELECT-privilege issue; keeping both
-- writes on the same RPC-only pattern is simpler to reason about than mixing the two.
create or replace function public.update_datev_route_status(
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
  update public.datev_routes
     set is_enabled = p_is_enabled, note = p_note, updated_by = p_updated_by, updated_at = now()
   where id = p_id;
end;
$$;

grant execute on function public.update_datev_route_status(uuid, boolean, text, text) to authenticated;

-- ===========================================================================
-- 2. datev_handover_batches — one row per send attempt, never the address
-- ===========================================================================
create table if not exists public.datev_handover_batches (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id),
  direction      text not null check (direction in ('incoming', 'outgoing')),
  invoice_count  int not null default 0,
  total_bytes    bigint not null default 0,
  status         text not null check (status in ('success', 'error')),
  error_message  text,
  sent_by        text,
  created_at     timestamptz not null default now()
);

alter table public.datev_handover_batches enable row level security;
drop policy if exists "datev_handover_batches_select" on public.datev_handover_batches;
create policy "datev_handover_batches_select" on public.datev_handover_batches
  for select to authenticated using (true);
-- No insert/update policy for `authenticated` — only the service-role Edge Function writes these,
-- exactly like bank_sync_logs.

-- ===========================================================================
-- 3. invoices.datev_handed_over_at / datev_batch_id — the checkbox, not just a status
-- ===========================================================================
-- Briefing Appendix A6: "'Handed over to DATEV' is additionally its own checkbox ... not just a
-- status." Mirrors the already-established paid_at pattern (migration 0036): the checkbox is the
-- real signal, workflow_status is derived from it by the trigger below.
alter table public.invoices add column if not exists datev_handed_over_at timestamptz;
alter table public.invoices add column if not exists datev_batch_id uuid references public.datev_handover_batches(id);

-- ===========================================================================
-- 4. Auto-advance to 'uebergeben_datev' the moment datev_handed_over_at is set
-- ===========================================================================
-- Same shape as advance_workflow_on_payment (migration 0036): fires on the null -> non-null edge,
-- guarded to only advance a genuinely paid invoice — a stray write on any other status (rejected,
-- not relevant, already past this point) must not silently change its workflow state.
create or replace function public.advance_workflow_on_datev_handover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.datev_handed_over_at is not null and old.datev_handed_over_at is null
     and new.workflow_status = 'bezahlt'
  then
    update public.invoices
       set workflow_status = 'uebergeben_datev', updated_at = now()
     where id = new.id;

    insert into public.invoice_history (invoice_id, type, text, actor)
    values (new.id, 'uebergeben_datev', 'Workflow: An DATEV übergeben', 'system');
  end if;
  return null;
end;
$$;

drop trigger if exists trg_advance_workflow_on_datev_handover on public.invoices;
create trigger trg_advance_workflow_on_datev_handover
  after update of datev_handed_over_at on public.invoices
  for each row execute function public.advance_workflow_on_datev_handover();

-- ===========================================================================
-- 5. is_invoice_reconciled — server-side mirror of the client's abgleichStatus()
-- ===========================================================================
-- Ports src/lib/data/format.ts's isFullyCovered/paymentTolerance exactly (3% of gross, clamped to
-- [0.01, 150]), so the Edge Function's "ready for handover" check can never disagree with what the
-- invoice detail page already shows as "abgeglichen". Uses plain numeric arithmetic (Postgres
-- numeric is exact decimal) rather than the client's cents-rounding trick, which exists only to
-- work around JS floating point.
create or replace function public.is_invoice_reconciled(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when v.soll <= 0 then false
    else v.matched >= v.soll - least(greatest(v.soll * 0.03, 0.01), 150)
  end
  from (
    select
      abs(coalesce(i.amount_gross, 0)) as soll,
      coalesce((
        select sum(abs(m.amount_matched))
          from public.invoice_transaction_matches m
         where m.invoice_id = i.id and m.status = 'bestaetigt'
      ), 0) as matched
    from public.invoices i
    where i.id = p_invoice_id
  ) v;
$$;

grant execute on function public.is_invoice_reconciled(uuid) to authenticated;

commit;

-- ===========================================================================
-- 6. Self-checks — probe real data, always roll back (restrict_violation idiom)
-- ===========================================================================

-- 6a/6b check the actual GRANT state in the system catalog rather than switching role and
-- probing live (SET LOCAL ROLE / RESET ROLE inside a DO block does not reliably revert across
-- statements in every connection context this migration can run under, e.g. some pooled/proxied
-- connections — a prior version of this self-check left the session AS `authenticated` by the
-- time 6c ran, which then legitimately failed with "permission denied for table invoices" since
-- that probe never touches `invoices` at all under normal operation. Reading
-- information_schema.column_privileges directly is what actually gets enforced, with none of
-- that session-state risk.

-- 6a. `authenticated` has no SELECT privilege on datev_routes.address (the confidentiality
-- guarantee itself).
do $$
declare
  v_has_priv boolean;
begin
  select exists (
    select 1 from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'datev_routes'
       and column_name = 'address' and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) into v_has_priv;

  if v_has_priv then
    raise exception '0038 self-check 6a FAILED: authenticated has SELECT privilege on datev_routes.address';
  end if;

  raise notice '0038 self-check 6a ok: authenticated has no SELECT privilege on datev_routes.address';
end $$;

-- 6b. `authenticated` CAN still select every other column (the config screen must keep working).
do $$
declare
  v_missing text[];
begin
  select array_agg(col) into v_missing
    from unnest(array[
      'id', 'company_id', 'direction', 'is_enabled', 'note', 'updated_by', 'created_at', 'updated_at'
    ]) as col
   where not exists (
     select 1 from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'datev_routes'
        and column_name = col and grantee = 'authenticated' and privilege_type = 'SELECT'
   );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception '0038 self-check 6b FAILED: authenticated is missing SELECT on: %', array_to_string(v_missing, ', ');
  end if;

  raise notice '0038 self-check 6b ok: authenticated can select every datev_routes column except address';
end $$;

-- 6c. Setting datev_handed_over_at on an invoice at 'bezahlt' advances it to 'uebergeben_datev'.
do $$
declare
  v_invoice_id uuid;
  v_after      text;
begin
  select id into v_invoice_id
    from public.invoices
   where deleted_at is null
   limit 1;

  if v_invoice_id is null then
    raise notice '0038 self-check 6c skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'bezahlt', datev_handed_over_at = null
     where id = v_invoice_id;

    update public.invoices set datev_handed_over_at = now() where id = v_invoice_id;

    select workflow_status into v_after from public.invoices where id = v_invoice_id;

    if v_after is distinct from 'uebergeben_datev' then
      raise exception '0038 self-check 6c FAILED: expected workflow_status ''uebergeben_datev'', got %', v_after;
    end if;

    raise notice '0038 self-check 6c ok: datev_handed_over_at set at bezahlt advances to uebergeben_datev';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0038 self-check 6c rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 6d. Setting datev_handed_over_at on an invoice NOT at 'bezahlt' does NOT change its status.
do $$
declare
  v_invoice_id uuid;
  v_after      text;
begin
  select id into v_invoice_id
    from public.invoices
   where deleted_at is null
   limit 1;

  if v_invoice_id is null then
    raise notice '0038 self-check 6d skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'eingegangen', datev_handed_over_at = null
     where id = v_invoice_id;

    update public.invoices set datev_handed_over_at = now() where id = v_invoice_id;

    select workflow_status into v_after from public.invoices where id = v_invoice_id;

    if v_after is distinct from 'eingegangen' then
      raise exception '0038 self-check 6d FAILED: an unpaid invoice''s status changed to % on a stray datev_handed_over_at write', v_after;
    end if;

    raise notice '0038 self-check 6d ok: a stray datev_handed_over_at write does not move an unpaid invoice';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0038 self-check 6d rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 6e. is_invoice_reconciled matches the client's abgleichStatus() tolerance exactly.
do $$
declare
  v_invoice_id    uuid;
  v_transaction_id uuid;
  v_account_id    uuid;
  v_connection_id uuid;
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bank_transactions')
     or not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'bank_accounts')
  then
    raise notice '0038 self-check 6e skipped: bank_transactions/bank_accounts not present in this probe environment';
  else
    select id into v_invoice_id from public.invoices where deleted_at is null limit 1;
    -- bank_transactions.connection_id is a real FK to bank_connections — a random uuid here
    -- violates it. Prefer an account that already has a real connection_id; only fall back to
    -- a fresh bank_connections row (also cleaned up below) if none exists.
    select id, connection_id into v_account_id, v_connection_id
      from public.bank_accounts where connection_id is not null limit 1;

    if v_account_id is null then
      select id into v_account_id from public.bank_accounts limit 1;
    end if;

    if v_invoice_id is null or v_account_id is null then
      raise notice '0038 self-check 6e skipped: no invoice/bank_account available to probe';
    else
      if v_connection_id is null then
        insert into public.bank_connections (banksapi_access_id, status, is_sandbox)
        values ('self-check-6e-' || gen_random_uuid()::text, 'active', true)
        returning id into v_connection_id;
      end if;

      update public.invoices set amount_gross = 100.00 where id = v_invoice_id;

      insert into public.bank_transactions (account_id, connection_id, banksapi_hash, amount, is_sandbox)
      values (v_account_id, v_connection_id, 'self-check-6e-' || gen_random_uuid()::text, -99.50, true)
      returning id into v_transaction_id;

      insert into public.invoice_transaction_matches (invoice_id, transaction_id, status, amount_matched)
      values (v_invoice_id, v_transaction_id, 'bestaetigt', 99.50);

      if not public.is_invoice_reconciled(v_invoice_id) then
        raise exception '0038 self-check 6e FAILED: 99.50 matched against 100.00 gross should be within the 3%% tolerance';
      end if;

      raise notice '0038 self-check 6e ok: is_invoice_reconciled applies the same 3%% tolerance as abgleichStatus()';
    end if;
  end if;

  raise exception using errcode = 'restrict_violation', message = '0038 self-check 6e rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 6f. `authenticated` can EXECUTE both write RPCs (the only way it can write to datev_routes at
-- all, now that direct table INSERT/UPDATE grants are gone). Catalog-based, not a live call —
-- see the note above self-check 6a on why this migration avoids SET ROLE / RESET ROLE entirely.
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'set_datev_route'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    v_missing := v_missing || 'set_datev_route';
  end if;

  if not exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public' and routine_name = 'update_datev_route_status'
       and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    v_missing := v_missing || 'update_datev_route_status';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '0038 self-check 6f FAILED: authenticated is missing EXECUTE on: %', array_to_string(v_missing, ', ');
  end if;

  raise notice '0038 self-check 6f ok: authenticated can execute both datev_routes write RPCs';
end $$;

-- 6g. set_datev_route inserts, then updates on conflict (never duplicates a company+direction
-- row); update_datev_route_status only ever touches is_enabled/note, never address. Runs as
-- whichever role applies this migration — a SECURITY DEFINER function behaves identically
-- regardless of the caller, so this validates the upsert logic itself; 6f separately confirms
-- `authenticated` is actually allowed to call it.
do $$
declare
  v_company_id uuid;
  v_id         uuid;
  v_enabled    boolean;
  v_note       text;
begin
  select id into v_company_id from public.companies limit 1;
  if v_company_id is null then
    raise notice '0038 self-check 6g skipped: no company available to probe';
  else
    delete from public.datev_routes where company_id = v_company_id and direction = 'incoming';

    perform public.set_datev_route(v_company_id, 'incoming', 'probe@example.com', true, 'first', 'tester');
    select id, is_enabled, note into v_id, v_enabled, v_note
      from public.datev_routes where company_id = v_company_id and direction = 'incoming';
    if v_id is null or v_enabled is distinct from true or v_note is distinct from 'first' then
      raise exception '0038 self-check 6g FAILED: set_datev_route did not insert correctly';
    end if;

    perform public.set_datev_route(v_company_id, 'incoming', 'probe2@example.com', false, 'second', 'tester');
    select is_enabled, note into v_enabled, v_note from public.datev_routes where id = v_id;
    if v_enabled is distinct from false or v_note is distinct from 'second' then
      raise exception '0038 self-check 6g FAILED: set_datev_route did not update on conflict';
    end if;

    perform public.update_datev_route_status(v_id, true, 'third', 'tester');
    select is_enabled, note into v_enabled, v_note from public.datev_routes where id = v_id;
    if v_enabled is distinct from true or v_note is distinct from 'third' then
      raise exception '0038 self-check 6g FAILED: update_datev_route_status did not apply';
    end if;

    raise notice '0038 self-check 6g ok: set_datev_route upserts correctly, update_datev_route_status only touches is_enabled/note';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0038 self-check 6g rollback';
exception
  when restrict_violation then
    null;
end $$;

-- Sanity (run manually after applying):
--   select company_id, direction, is_enabled, note from public.datev_routes;
--   select workflow_status, datev_handed_over_at is not null as handed_over, count(*)
--     from public.invoices group by 1, 2 order by 1;
