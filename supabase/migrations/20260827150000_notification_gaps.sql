-- 20260827150000_notification_gaps.sql
-- Closes the phase 3 gaps (docs/NOTIFICATIONS.md): a real event PRODUCER for personal returns,
-- dispatcher observability, and cross-device bell acknowledgement. Self-contained and portable
-- like 20260827110000; every statement is idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cross-device bell acknowledgement. The bell hides a standing row once the user followed it,
--    until its count grows again; that snapshot lived in localStorage (per device). It moves
--    into the user's settings row, which already has own-row RLS for insert/update.
-- ---------------------------------------------------------------------------
alter table public.notification_settings
  add column if not exists bell_ack jsonb not null default '{}'::jsonb;

comment on column public.notification_settings.bell_ack is
  'Per bell row the count the user last acknowledged by clicking through. {row key: count}.';

-- ---------------------------------------------------------------------------
-- 2. Dispatcher run log. Written by notify-dispatch on every tick (service role, bypasses RLS);
--    admins read it on the settings screen. Without it a silently failing webhook is only
--    visible by its absence.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_dispatch_log (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean not null default false,
  events      jsonb not null default '{}'::jsonb,
  digests     integer not null default 0,
  errors      jsonb not null default '[]'::jsonb
);

create index if not exists notification_dispatch_log_started_idx
  on public.notification_dispatch_log (started_at desc);

alter table public.notification_dispatch_log enable row level security;

drop policy if exists "notification_dispatch_log_admin_read" on public.notification_dispatch_log;
create policy "notification_dispatch_log_admin_read" on public.notification_dispatch_log
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Producer: personal returns become events. The app already records WHO an invoice went back
--    to when it happens (invoice_history type 'rueckfrage'/'ablehnung', data->>'returned_to'),
--    so the trigger reads that instead of re-deriving approval rules, which would drift. The
--    recipient link goes through approvers.app_user_id (migration 20260826120000); a name
--    without a login still produces an event (recipient null), so a team channel can carry it.
--    "Sent forward for review" is NOT produced here: forward transitions do not record the next
--    person's name in history yet, and guessing it would duplicate client rule resolution.
-- ---------------------------------------------------------------------------
create or replace function public.notify_event_from_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_recipient uuid;
  v_type text;
  v_invoice_number text;
begin
  if new.type not in ('rueckfrage', 'ablehnung') then
    return null;
  end if;

  v_type := case new.type when 'rueckfrage' then 'rueckfrage' else 'abgelehnt' end;
  v_name := nullif(btrim(coalesce(new.data ->> 'returned_to', '')), '');

  if v_name is not null then
    select a.app_user_id into v_recipient
      from public.approvers a
     where lower(a.name) = lower(v_name)
     limit 1;
  end if;

  select i.invoice_number into v_invoice_number
    from public.invoices i where i.id = new.invoice_id;

  insert into public.notification_events (type, payload, recipient_user_id)
  values (
    v_type,
    jsonb_strip_nulls(jsonb_build_object(
      'invoice_id', new.invoice_id,
      'invoice_number', v_invoice_number,
      'returned_to', v_name,
      'note', nullif(btrim(coalesce(new.text, '')), ''),
      'actor', new.actor
    )),
    v_recipient
  );
  return null;
exception when others then
  -- A notification must never block the workflow write it observes.
  return null;
end;
$$;

drop trigger if exists trg_notify_event_from_history on public.invoice_history;
create trigger trg_notify_event_from_history
  after insert on public.invoice_history
  for each row execute function public.notify_event_from_history();

commit;
