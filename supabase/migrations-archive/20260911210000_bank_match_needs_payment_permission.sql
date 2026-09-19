-- 20260911210000_bank_match_needs_payment_permission.sql
--
-- RENUMBERED from 20260911180000, which collided with
-- 20260911180000_ingest_cron_fetches_receipts.sql. Supabase keys its history on the timestamp
-- alone, so only one file per version is ever recorded: the cron migration was applied and this
-- one was silently skipped, while `supabase db push` reported nothing wrong. Moved past the last
-- applied migration so a plain push installs it. Idempotent throughout, so a re-run is harmless if
-- it did somehow land.
-- Confirming a bank match IS marking the invoice paid.
--
-- WHAT WAS WRONG. "Jetzt bezahlen" and "Bezahlt (manuell)" both ask `invoices.pay`, in the screen
-- and (for paid_at) in enforce_invoice_write_permissions. The bank reconciliation asked nothing at
-- all: its buttons carried no permission check, and invoice_transaction_matches is written
-- directly from the client. Once the confirmed matches cover the invoice, 0037's
-- sync_invoice_paid_from_matches stamps paid_at -- so anyone signed in could settle an invoice
-- from the bank screen without holding the payment right. Unlinking a confirmed match runs the
-- same trigger the other way and takes a payment back, which nothing checked either.
--
-- WHAT THIS ADDS. One BEFORE trigger on each match table, incoming and outgoing. It fires only on
-- the writes that move payment state:
--   * inserting a row that is already 'bestaetigt' (the link_invoice_transaction path)
--   * confirming a row, or un-confirming one
--   * changing amount_matched on a confirmed row, which can flip coverage either way
--   * deleting a confirmed row
-- Declining a suggestion (kandidat -> abgelehnt) is NOT payment: it never stamped anything, and
-- reviewing suggestions is the daily work of people who may not pay. It stays open to them.
--
-- SERVICE ROLE IS EXEMPT, BY DESIGN, the same exemption enforce_invoice_write_permissions makes:
-- the ingestion pipeline, the Edge Functions and the cron jobs carry no JWT and do their own
-- authorization. The guard returns early when no caller email resolves.
--
-- WHY A TRIGGER AND NOT A POLICY. The matches_insert/matches_update policies (migration 0003) are
-- `to authenticated ... check (true)`, and narrowing them would also have to be got right for the
-- Edge Functions that write through them. A trigger applies to every writer whatever the policies
-- say, and cannot break a read path by accident.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'has_permission'
  ) then
    raise exception '20260911180000 preconditions failed: has_permission is missing (run the permissions model first)';
  end if;
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'invoice_transaction_matches'
  ) then
    raise exception '20260911180000 preconditions failed: table invoice_transaction_matches is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. The guard
-- ===========================================================================
create or replace function public.enforce_match_payment_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email          text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_was_confirmed  boolean := tg_op <> 'INSERT' and old.status = 'bestaetigt';
  v_is_confirmed   boolean := tg_op <> 'DELETE' and new.status = 'bestaetigt';
  v_amount_changed boolean := tg_op = 'UPDATE'
                              and old.status = 'bestaetigt'
                              and new.amount_matched is distinct from old.amount_matched;
  v_touches_payment boolean;
begin
  -- No caller identity: pipeline, cron or an Edge Function. See the header.
  if v_email = '' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_touches_payment := (v_was_confirmed is distinct from v_is_confirmed) or v_amount_changed;

  if v_touches_payment and not public.has_permission('invoices.pay') then
    raise exception
      'not permitted: a confirmed bank match settles the invoice, which requires the payment permission'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ===========================================================================
-- 2. On both match tables
-- ===========================================================================
drop trigger if exists trg_enforce_match_payment_permission on public.invoice_transaction_matches;
create trigger trg_enforce_match_payment_permission
  before insert or update or delete on public.invoice_transaction_matches
  for each row execute function public.enforce_match_payment_permission();

do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'outgoing_invoice_transaction_matches'
  ) then
    drop trigger if exists trg_enforce_match_payment_permission
      on public.outgoing_invoice_transaction_matches;
    create trigger trg_enforce_match_payment_permission
      before insert or update or delete on public.outgoing_invoice_transaction_matches
      for each row execute function public.enforce_match_payment_permission();
  end if;
end $$;

commit;

-- ===========================================================================
-- 3. Self-checks -- catalog only; there is no JWT in a raw SQL session, and without one the guard
--    takes its service-role exemption, so the refusal itself has to be checked from the app.
-- ===========================================================================
do $$
declare
  v_bad text[] := array[]::text[];
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_enforce_match_payment_permission'
       and tgrelid = 'public.invoice_transaction_matches'::regclass
  ) then
    v_bad := v_bad || 'the guard is not on invoice_transaction_matches';
  end if;

  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'outgoing_invoice_transaction_matches'
  ) and not exists (
    select 1 from pg_trigger
     where tgname = 'trg_enforce_match_payment_permission'
       and tgrelid = 'public.outgoing_invoice_transaction_matches'::regclass
  ) then
    v_bad := v_bad || 'the guard is not on outgoing_invoice_transaction_matches';
  end if;

  if array_length(v_bad, 1) > 0 then
    raise exception '20260911180000 self-check FAILED: %', array_to_string(v_bad, '; ');
  end if;
  raise notice '20260911180000 self-check ok: the guard is on both match tables';
end $$;

-- Verify from the app, signed in as someone WITHOUT invoices.pay: confirming a suggestion on
-- /banktransaktionen must fail with 42501, and declining one must still work.
