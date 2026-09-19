-- 0036_payment_gated_workflow.sql
-- Extends migration 0035 (Briefing Screen 6) so an unpaid invoice cannot silently be treated as
-- "done" before payment actually happens. Widens the approval chain to cover the full lifecycle:
--   eingegangen -> in_pruefung -> freigegeben_assistenz -> freigegeben_vorgesetzter
--     -> bezahlt -> uebergeben_datev -> abgeschlossen
-- with a payment-failure path back into the open-payment state (freigegeben_vorgesetzter).
--
-- Deliberately NOT built here (decided with the client before this migration):
--   * No separate "approved for payment" stage between management approval and paid. Considered
--     and dropped: the client's own read was that the two are close enough to be one state —
--     'freigegeben_vorgesetzter' IS the "awaiting payment" state; 'bezahlt' is reached directly
--     the moment a bank match confirms it (auto-suggested or manually created — same mechanism,
--     see below) or the manual "paid" checkbox is used. No separate "release for payment" action.
--   * No new value for a rejected-but-reworkable path. Resolves the PDF conflict (Screen 6 vs.
--     Appendix A6): 'abgelehnt' stays terminal, matching A6. The existing manual "Status
--     korrigieren" override (front-end only, no schema change) already lets a manager reopen one
--     if the rejection turns out wrong.
--   * No real per-company access control / RLS enforcement. Decided explicitly: role still gates
--     which buttons render client-side; "assigned companies" stays informational.
--   * No new scope dimension for `assigned_to` on approval_rules. Deferred — would require
--     dropping and re-adding the generated `specificity` column; not worth the churn for a
--     dimension the client's own examples don't emphasize.
--
-- Key design choice: hook the DB, not the front-end mutations. Two independent code paths already
-- write invoices.paid_at (the confirmed-bank-match trigger from migration 0009, live name
-- uncertain post-rename and NOT touched here — covers both an automatically-suggested match and
-- one a human created by hand in the reconciliation screen, since confirming either one goes
-- through the exact same code path; and the manual "bezahlt manuell" checkbox in the Hub).
-- migration 0024 already added `invoices.paid_source` ('bank_match' | 'manual') to distinguish
-- these two, which this migration's trigger reuses directly for its log message ("how it is
-- paid") rather than inventing a parallel signal.
--
-- Live schema naming: targets the English-renamed live names (`invoices`, `invoice_history`),
-- same as 0025/0035 — NOT the German names in the stale `supabase/schema.sql` snapshot.
--
-- Idempotent throughout: `if not exists`, lookup-driven `do` blocks.

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
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'paid_at'
  ) then
    v_missing := v_missing || 'column invoices.paid_at';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'workflow_status'
  ) then
    v_missing := v_missing || 'column invoices.workflow_status';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'paid_source'
  ) then
    v_missing := v_missing || 'column invoices.paid_source';
  end if;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'invoice_history'
  ) then
    v_missing := v_missing || 'invoice_history';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Migration 0036 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

-- ===========================================================================
-- 1. Widen the workflow_status CHECK to add the 'bezahlt' payment stage
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
       and pg_get_constraintdef(oid) ilike '%workflow_status%'
  loop
    raise notice 'replacing workflow_status check: %', v_con;
    execute format('alter table public.invoices drop constraint %I', v_con);
  end loop;

  alter table public.invoices add constraint invoices_workflow_status_check
    check (workflow_status in (
      'eingegangen',
      'in_pruefung',
      'rueckfrage',
      'freigegeben_assistenz',
      'freigegeben_vorgesetzter',
      'bezahlt',
      'uebergeben_datev',
      'abgeschlossen',
      'abgelehnt',
      'nicht_relevant'
    ));
end $$;

-- ===========================================================================
-- 2. Auto-advance to 'bezahlt' the moment paid_at is actually set
-- ===========================================================================
-- SET-only in the sense that it only ever moves workflow_status FORWARD to 'bezahlt', and only
-- from a state where that is a genuine advance — never touches a terminal side-path (a stray bank
-- match on a rejected or not-relevant receipt must not silently change its workflow state), and
-- never touches an invoice already at or past 'bezahlt'. The log entry states HOW it was paid,
-- read straight from paid_source (migration 0024) rather than duplicating that distinction.
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

drop trigger if exists trg_advance_workflow_on_payment on public.invoices;
create trigger trg_advance_workflow_on_payment
  after update of paid_at on public.invoices
  for each row execute function public.advance_workflow_on_payment();

commit;

-- ===========================================================================
-- 3. Self-checks — probe real data, always roll back (restrict_violation idiom)
-- ===========================================================================

-- 3a. Setting paid_at on an invoice at 'freigegeben_vorgesetzter' advances it to 'bezahlt'.
do $$
declare
  v_invoice_id uuid;
  v_before     text;
  v_after      text;
begin
  select id, workflow_status into v_invoice_id, v_before
    from public.invoices
   where deleted_at is null
   limit 1;

  if v_invoice_id is null then
    raise notice '0036 self-check 3a skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'freigegeben_vorgesetzter', paid_at = null
     where id = v_invoice_id;

    update public.invoices set paid_at = now() where id = v_invoice_id;

    select workflow_status into v_after from public.invoices where id = v_invoice_id;

    if v_after is distinct from 'bezahlt' then
      raise exception '0036 self-check 3a FAILED: expected workflow_status ''bezahlt'', got %', v_after;
    end if;

    raise notice '0036 self-check 3a ok: paid_at set at freigegeben_vorgesetzter advances to bezahlt';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0036 self-check 3a rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 3b. Setting paid_at on an invoice at 'abgelehnt' does NOT change its workflow_status.
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
    raise notice '0036 self-check 3b skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'abgelehnt', paid_at = null
     where id = v_invoice_id;

    update public.invoices set paid_at = now() where id = v_invoice_id;

    select workflow_status into v_after from public.invoices where id = v_invoice_id;

    if v_after is distinct from 'abgelehnt' then
      raise exception '0036 self-check 3b FAILED: a rejected invoice''s status changed to % on a stray paid_at write', v_after;
    end if;

    raise notice '0036 self-check 3b ok: a stray paid_at write does not move a rejected invoice';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0036 self-check 3b rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 3c. An invoice already at 'bezahlt' is unaffected by a further no-op-ish paid_at update.
do $$
declare
  v_invoice_id uuid;
  v_after      text;
  v_history_before int;
  v_history_after  int;
begin
  select id into v_invoice_id
    from public.invoices
   where deleted_at is null
   limit 1;

  if v_invoice_id is null then
    raise notice '0036 self-check 3c skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'bezahlt', paid_at = now() - interval '1 day'
     where id = v_invoice_id;

    select count(*) into v_history_before from public.invoice_history where invoice_id = v_invoice_id;

    -- paid_at was already non-null, so this update does not cross the null -> non-null edge the
    -- trigger watches for; nothing should fire.
    update public.invoices set paid_at = now() where id = v_invoice_id;

    select workflow_status into v_after from public.invoices where id = v_invoice_id;
    select count(*) into v_history_after from public.invoice_history where invoice_id = v_invoice_id;

    if v_after is distinct from 'bezahlt' then
      raise exception '0036 self-check 3c FAILED: status unexpectedly changed to %', v_after;
    end if;
    if v_history_after <> v_history_before then
      raise exception '0036 self-check 3c FAILED: an extra history row was logged for a non-edge paid_at update';
    end if;

    raise notice '0036 self-check 3c ok: already-paid invoice unaffected by a further paid_at update';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0036 self-check 3c rollback';
exception
  when restrict_violation then
    null;
end $$;

-- 3d. The log entry states HOW it was paid, read from paid_source ('bank_match' vs 'manual' —
-- covers both bank-sync-suggested and manually-created matches, since confirming either goes
-- through the same code path and both set paid_source = 'bank_match').
do $$
declare
  v_invoice_id uuid;
  v_text       text;
begin
  select id into v_invoice_id
    from public.invoices
   where deleted_at is null
   limit 1;

  if v_invoice_id is null then
    raise notice '0036 self-check 3d skipped: no invoice available to probe';
  else
    update public.invoices
       set workflow_status = 'freigegeben_vorgesetzter', paid_at = null, paid_source = null
     where id = v_invoice_id;

    update public.invoices set paid_at = now(), paid_source = 'bank_match' where id = v_invoice_id;

    select text into v_text
      from public.invoice_history
     where invoice_id = v_invoice_id and type = 'bezahlt'
     order by created_at desc
     limit 1;

    if v_text is distinct from 'Workflow: Bezahlt (Bankabgleich bestätigt)' then
      raise exception '0036 self-check 3d FAILED: expected the bank_match log message, got %', v_text;
    end if;

    raise notice '0036 self-check 3d ok: log entry names the actual payment source';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0036 self-check 3d rollback';
exception
  when restrict_violation then
    null;
end $$;

-- Sanity (run manually after applying):
--   select workflow_status, count(*) from public.invoices group by 1 order by 2 desc;
