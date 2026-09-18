-- 0081_payment_orders — ported verbatim from immonetz's 0053_payment_orders.sql (origin/dev).
-- Renumbered only: their 0053 slot is taken here. Required by payment-initiate / payment-callback
-- / payment-cancel, which were ported alongside it after immonetz verified the ONE/Connect
-- bulk-transfer flow end-to-end against the live API.

-- 0053_payment_orders.sql
-- Milestone 2 of "Trigger BANKSapi payments from the Hub" (docs/BANKSAPI_PAYMENT_INITIATION.md).
-- Client's own Phase-3 ask (handover/FREELANCER-HANDOVER.md): "payment is initiated via BanksAPI
-- from the platform ('two clicks out')... strict permissions (supervisor role only), and a full
-- audit trail." The one prerequisite that doc flagged as missing -- a real role/permission model
-- -- landed with migration 0046 (docs/ROLES_AND_ACCESS.md), which this migration builds on.
--
-- Scope: schema + trigger wiring only. No BANKSapi call happens here -- this is the part of the
-- feature that is genuinely independent of which BANKSapi product turns out to be the right one
-- (Milestone 1, still open; see docs/BANKSAPI_PAYMENT_INITIATION.md).
--
-- Design choices:
--   * payment_orders is one row per payment ATTEMPT, not per invoice -- a failed attempt followed
--     by a retry is two rows, so the audit trail shows every attempt, not just the latest.
--   * recipient_name/iban/bic/amount/currency/payment_reference are a SNAPSHOT taken at trigger
--     time, deliberately duplicated from suppliers/invoices rather than joined live. Suppliers'
--     IBANs do change (migration 0040's supplier_iban_history exists precisely because they do),
--     and a later change must never retroactively alter what an already-submitted payment's audit
--     record says was paid.
--   * INSERT is restricted to supervisor/admin/super_admin from day one, a deliberate exception to
--     migration 0046's general "defer write RLS" stance -- justified by the client's own explicit
--     "supervisor role only" requirement for this one, money-moving feature. There is no client
--     UPDATE policy at all: only the payment-initiate/payment-callback Edge Functions (service
--     role, bypasses RLS) ever transition a row's status, mirroring bank-connect/bank-callback's
--     "public callback only ever updates a row it can find, service role does the writing" model.
--   * paid_source gets one new value ('banksapi_payment') alongside the existing 'bank_match' /
--     'manual' (migration 0024), wired through the EXISTING advance_workflow_on_payment() trigger
--     (migration 0036) rather than new trigger logic -- setting invoices.paid_at is still the one
--     signal that advances workflow_status to 'bezahlt', regardless of source.
--   * No CHECK constraint added for invoice_history.type (there isn't one on the live table --
--     confirmed via pg_constraint before writing this migration -- so the new 'zahlung_ausgeloest'
--     / 'zahlung_autorisiert' values are added to the TS union in types.ts only, matching how
--     every prior VerlaufTyp addition (0025, 0035, 0038) worked).
--
-- Idempotent throughout: `if not exists`, lookup-driven `do` blocks, matching 0035/0036/0046.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'invoices'
  ) then
    v_missing := v_missing || 'invoices';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'paid_source'
  ) then
    v_missing := v_missing || 'column invoices.paid_source';
  end if;

  if not exists (
    select 1 from pg_proc where proname = 'has_company_access'
  ) then
    v_missing := v_missing || 'function has_company_access (migration 0046)';
  end if;

  if not exists (
    select 1 from pg_proc where proname = 'current_role_name'
  ) then
    v_missing := v_missing || 'function current_role_name (migration 0046)';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Migration 0053 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. payment_orders
-- ===========================================================================
create table if not exists public.payment_orders (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.invoices(id),
  company_id           uuid references public.companies(id),  -- denormalized for RLS, mirrors bank_accounts/bank_transactions

  -- Snapshot at trigger time -- see header note. Never re-read from suppliers/invoices later.
  recipient_name       text,
  recipient_iban       text not null,
  recipient_bic        text,
  amount               numeric not null check (amount > 0),
  currency             text not null default 'EUR',
  payment_reference    text,

  status               text not null default 'draft'
                         check (status in ('draft', 'pending_sca', 'authorized', 'executed', 'failed', 'cancelled')),
  status_reason        text,

  -- BANKSapi correlation. Column names are provisional -- Milestone 1 (docs/BANKSAPI_PAYMENT_INITIATION.md)
  -- may rename banksapi_payment_id once the real live response shape is confirmed.
  banksapi_access_id   text,
  banksapi_product_id  text,
  banksapi_payment_id  text,
  is_sandbox           boolean not null default true,

  -- Client-generated, unique: a double-click or retried request must resolve to the same row,
  -- never submit two live transfers. payment-initiate treats a repeat call with the same key as
  -- a no-op that returns the existing row.
  idempotency_key      uuid not null default gen_random_uuid(),

  -- Fraud signal (handover doc: a changed IBAN is "a classic fraud signal, worth a warning flag").
  -- Captured at creation time so the check that ran is itself part of the audit trail, not just a
  -- runtime warning nobody can later prove was shown.
  recipient_iban_changed_recently boolean not null default false,
  fraud_flags          jsonb,

  initiated_by         text,
  initiated_at         timestamptz not null default now(),
  authorized_at        timestamptz,
  executed_at          timestamptz,
  failed_at            timestamptz,
  cancelled_at          timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (idempotency_key)
);

create index if not exists idx_payment_orders_invoice on public.payment_orders (invoice_id);
create index if not exists idx_payment_orders_company on public.payment_orders (company_id);
create index if not exists idx_payment_orders_status on public.payment_orders (status) where status in ('pending_sca', 'authorized');

comment on table public.payment_orders is
  'One row per BANKSapi payment ATTEMPT (docs/BANKSAPI_PAYMENT_INITIATION.md). Recipient fields '
  'are a snapshot taken at trigger time, not a live join to suppliers. Immutable audit record -- '
  'no soft-delete; a failed/cancelled attempt stays as a row, a retry is a new one.';

alter table public.payment_orders enable row level security;

drop policy if exists "payment_orders_select" on public.payment_orders;
create policy "payment_orders_select" on public.payment_orders
  for select to authenticated using (public.has_company_access(company_id));

-- Client-writable DRAFT insert only, restricted to supervisor/admin/super_admin (see header note).
-- The actual BANKSapi call and every subsequent status transition happens server-side in the
-- payment-initiate/payment-callback Edge Functions via the service-role client, which bypasses
-- RLS entirely -- this policy only gates who may create the initial row from the browser.
drop policy if exists "payment_orders_insert" on public.payment_orders;
create policy "payment_orders_insert" on public.payment_orders
  for insert to authenticated
  with check (
    public.has_company_access(company_id)
    and public.current_role_name() in ('supervisor', 'admin', 'super_admin')
  );

-- Deliberately no UPDATE/DELETE policy for `authenticated` -- only the service-role Edge Functions
-- transition status, matching bank-connect/bank-callback's model.

-- ===========================================================================
-- 2. invoices.paid_source: widen to add the new BANKSapi-payment source
-- ===========================================================================
do $$
declare
  v_con text;
begin
  for v_con in
    select conname
      from pg_constraint
     where conrelid = 'public.invoices'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%paid_source%'
  loop
    raise notice 'replacing paid_source check: %', v_con;
    execute format('alter table public.invoices drop constraint %I', v_con);
  end loop;

  alter table public.invoices add constraint invoices_paid_source_check
    check (paid_source in ('bank_match', 'manual', 'banksapi_payment'));
end $$;

-- ===========================================================================
-- 3. Widen advance_workflow_on_payment()'s log-message case for the new source.
--    No other change: the trigger from migration 0036 is otherwise untouched -- setting paid_at
--    is still the only thing that advances workflow_status, from whatever source.
-- ===========================================================================
create or replace function public.advance_workflow_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
begin
  if new.paid_at is not null and old.paid_at is null
     and new.workflow_status in (
       'eingegangen', 'in_pruefung', 'rueckfrage',
       'freigegeben_assistenz', 'freigegeben_vorgesetzter'
     )
  then
    v_text := case new.paid_source
      when 'bank_match' then 'Workflow: Bezahlt (Bankabgleich bestätigt)'
      when 'manual' then 'Workflow: Bezahlt (manuell markiert)'
      when 'banksapi_payment' then 'Workflow: Bezahlt (Zahlung über BANKSapi ausgeführt)'
      else 'Workflow: Bezahlt'
    end;

    update public.invoices
       set workflow_status = 'bezahlt', updated_at = now()
     where id = new.id;

    insert into public.invoice_history (invoice_id, type, text, actor)
    values (new.id, 'bezahlt', v_text, 'system');
  end if;
  return null;
end;
$$;
-- Trigger itself (trg_advance_workflow_on_payment) is untouched -- CREATE OR REPLACE FUNCTION
-- above is enough since it already points at this function by name.

commit;

-- ===========================================================================
-- 4. Self-checks — probe real data, always roll back (restrict_violation idiom, per 0036/0046)
-- ===========================================================================

-- 4a. payment_orders exists, RLS enabled, exactly the expected status values accepted.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'payment_orders'
  ) then
    raise exception '0053 self-check 4a FAILED: payment_orders table missing';
  end if;

  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'payment_orders' and rowsecurity
  ) then
    raise exception '0053 self-check 4a FAILED: payment_orders RLS not enabled';
  end if;

  raise notice '0053 self-check 4a ok: payment_orders exists with RLS enabled';
end $$;

-- 4b. A stray write of an out-of-list status is rejected by the CHECK constraint.
do $$
declare
  v_invoice_id uuid;
  v_rejected boolean := false;
begin
  select id into v_invoice_id from public.invoices where deleted_at is null limit 1;
  if v_invoice_id is null then
    raise notice '0053 self-check 4b skipped: no invoice available to probe';
  else
    begin
      insert into public.payment_orders (invoice_id, recipient_iban, amount, status)
      values (v_invoice_id, 'DE00000000000000000000', 10, 'not_a_real_status');
    exception
      when check_violation then v_rejected := true;
    end;

    if not v_rejected then
      raise exception '0053 self-check 4b FAILED: an invalid status value was accepted';
    end if;
    raise notice '0053 self-check 4b ok: invalid status rejected by CHECK';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0053 self-check 4b rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 4c. paid_source = 'banksapi_payment' is now accepted and advances workflow_status to 'bezahlt'
-- with the correct log text, exactly like 'bank_match'/'manual' already do (migration 0036 3a/3d).
do $$
declare
  v_invoice_id uuid;
  v_after      text;
  v_text       text;
begin
  select id into v_invoice_id from public.invoices where deleted_at is null limit 1;

  if v_invoice_id is null then
    raise notice '0053 self-check 4c skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'freigegeben_vorgesetzter', paid_at = null, paid_source = null
     where id = v_invoice_id;

    update public.invoices
       set paid_at = now(), paid_source = 'banksapi_payment'
     where id = v_invoice_id;

    select workflow_status into v_after from public.invoices where id = v_invoice_id;
    select text into v_text
      from public.invoice_history
     where invoice_id = v_invoice_id and type = 'bezahlt'
     order by created_at desc
     limit 1;

    if v_after is distinct from 'bezahlt' then
      raise exception '0053 self-check 4c FAILED: expected workflow_status ''bezahlt'', got %', v_after;
    end if;
    if v_text is distinct from 'Workflow: Bezahlt (Zahlung über BANKSapi ausgeführt)' then
      raise exception '0053 self-check 4c FAILED: unexpected log text: %', v_text;
    end if;

    raise notice '0053 self-check 4c ok: banksapi_payment source advances workflow and logs correctly';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0053 self-check 4c rollback';
exception
  when restrict_violation then
    null;
end $$;

-- Sanity (run manually after applying):
--   select status, count(*) from public.payment_orders group by 1;
