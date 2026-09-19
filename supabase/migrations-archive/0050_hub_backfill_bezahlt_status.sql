-- 0037_backfill_bezahlt_status.sql
-- Migration 0036 added a trigger that advances workflow_status to 'bezahlt' the moment paid_at
-- transitions null -> non-null. A trigger only fires on a NEW write, though — it does nothing for
-- rows that were already paid (paid_at set, e.g. by the migration 0024 bank-match trigger or the
-- manual "paid" checkbox) BEFORE 0036 existed. Those invoices are stuck at whatever workflow_status
-- they had at the time they were paid. This migration runs the exact same advance-to-bezahlt logic
-- once, directly, for every currently-mis-stated row, so "paid from anywhere" and "workflow_status
-- = 'bezahlt'" agree for existing data too, not just for invoices paid from now on.
--
-- Same guard as the 0036 trigger, deliberately kept in lockstep with it: only advances from a
-- genuine pre-payment state (eingegangen/in_pruefung/rueckfrage/freigegeben_assistenz/
-- freigegeben_vorgesetzter) — a paid-but-rejected or paid-but-not-relevant receipt is left alone,
-- exactly as the trigger itself would leave it alone (0036 self-check 3b covers this for the
-- go-forward case; this backfill must not be stricter or looser than that).
--
-- Idempotent: the affected-rows predicate is naturally empty on a second run.

begin;

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'paid_at'
  ) then
    v_missing := v_missing || 'column invoices.paid_at';
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
    raise exception 'Migration 0037 preconditions failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

do $$
declare
  r record;
  v_text text;
  v_count int := 0;
begin
  for r in
    select id, paid_source
      from public.invoices
     where paid_at is not null
       and workflow_status in (
         'eingegangen', 'in_pruefung', 'rueckfrage',
         'freigegeben_assistenz', 'freigegeben_vorgesetzter'
       )
  loop
    v_text := case r.paid_source
      when 'bank_match' then 'Workflow: Bezahlt (Bankabgleich bestätigt)'
      when 'manual' then 'Workflow: Bezahlt (manuell markiert)'
      else 'Workflow: Bezahlt'
    end;

    update public.invoices
       set workflow_status = 'bezahlt', updated_at = now()
     where id = r.id;

    insert into public.invoice_history (invoice_id, type, text, actor)
    values (r.id, 'bezahlt', v_text, 'system');

    v_count := v_count + 1;
  end loop;

  raise notice '0037 backfill: advanced % already-paid invoice(s) to workflow_status = bezahlt', v_count;
end $$;

commit;

-- Sanity (run manually after applying):
--   select workflow_status, count(*) from public.invoices where paid_at is not null group by 1;
