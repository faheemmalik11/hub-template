-- Notifying somebody about ANY record, acknowledging it there, and delivering it at once.
--
-- Three changes, from the 11.09.2026 request:
--
--   1. The notification target becomes open ended. It was two hard-coded columns (invoice and
--      transaction); it is now a kind plus an id plus the path to open, so a supplier, a customer,
--      a property or a screen added next year needs no migration here.
--   2. Per-event acknowledgement, so a notification can be shown on the record it names and
--      dismissed there.
--   3. Delivery on insert, so Slack arrives in seconds rather than on the next quarter hour.

begin;

-- ---------------------------------------------------------------------------
-- 1. What a notification can point at.
--
-- The old signature named its targets in its arguments: p_invoice_id, then p_transaction_id bolted
-- on beside it. Every further record type meant another parameter, another branch in the bell and
-- another branch in the Slack text. This replaces that with a registry.
--
-- WHY A TABLE AND NOT A FREE TEXT KIND. Two things still have to be true: the kind has to be one
-- the app knows how to render, and the record has to exist. A registry answers both without this
-- function growing a case statement, and adding a kind is one insert.
--
-- THE PATH IS SUPPLIED BY THE CALLER, not derived here. Routes live in the front end and differ per
-- hub, and a couple of screens address a record by something other than its primary key (objekte
-- uses `code`). Deriving URLs in SQL would put that knowledge in the wrong place and get it wrong.
-- The registry validates WHAT is being pointed at; the caller says WHERE to open it.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_target_kinds (
  kind         text primary key,
  -- Null for a plain screen with no record behind it. Then only the path matters.
  source_table text,
  -- The column p_target_id is checked against. Almost always the primary key.
  id_column    text not null default 'id',
  is_active    boolean not null default true
);

comment on table public.notification_target_kinds is
  'What a notification may point at. The front end resolves the kind to a label and an icon; this '
  'table exists so the RPC can confirm the kind is known and the record really exists.';

insert into public.notification_target_kinds (kind, source_table, id_column) values
  ('invoice',          'invoices',           'id'),
  ('transaction',      'bank_transactions',  'id'),
  ('supplier',         'suppliers',          'id'),
  ('customer',         'customers',          'id'),
  ('property',         'properties',         'id'),
  ('outgoing_invoice', 'outgoing_invoices',  'id'),
  -- A screen rather than a record: "look at the open items list". Nothing to check existence of.
  ('page',             null,                 'id')
on conflict (kind) do nothing;

alter table public.notification_target_kinds enable row level security;

-- Readable by everyone signed in (the bell renders from it), writable by nobody through the API.
-- Adding a kind is a migration, which is the point: a kind the front end cannot render is worse
-- than a missing one.
drop policy if exists "notification_target_kinds_read" on public.notification_target_kinds;
create policy "notification_target_kinds_read" on public.notification_target_kinds
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Sending one.
--
-- Returns the new id so a caller can acknowledge or link to it without a second round trip.
-- ---------------------------------------------------------------------------

create or replace function public.send_notification(
  p_recipient   uuid,
  p_note        text default null,
  p_target_kind text default null,
  p_target_id   text default null,
  p_target_path text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender      uuid := public.current_app_user_id();
  v_sender_name text;
  v_kind        public.notification_target_kinds%rowtype;
  v_exists      boolean;
  v_target      jsonb;
  v_id          bigint;
begin
  if v_sender is null then
    raise exception 'send_notification: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;
  if p_recipient is null then
    raise exception 'send_notification: recipient is required';
  end if;

  -- YOURSELF IS NOT A RECIPIENT. A notification is how you ask somebody else to look at something;
  -- sent to your own account it is a bell entry from you, to you, about what is already on your
  -- screen. The picker filters you out too, so reaching this means a stale page or a direct call.
  if p_recipient = v_sender then
    raise exception 'send_notification: cannot notify yourself'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.app_users where id = p_recipient and is_active) then
    raise exception 'send_notification: recipient % is not an active user', p_recipient;
  end if;

  if p_target_kind is not null then
    select * into v_kind
      from public.notification_target_kinds
     where kind = p_target_kind and is_active;
    if not found then
      raise exception 'send_notification: unknown target kind %', p_target_kind
        using errcode = 'check_violation';
    end if;

    -- The record has to be there. A notification pointing at something deleted sends the recipient
    -- to a broken page with no way to tell whether they misread it or it is gone.
    --
    -- format %I quotes the identifiers, and both of them come from this table rather than from the
    -- caller, so the dynamic statement cannot be steered from outside.
    if v_kind.source_table is not null and p_target_id is not null then
      execute format(
        'select exists (select 1 from public.%I where %I::text = $1)',
        v_kind.source_table, v_kind.id_column
      ) into v_exists using p_target_id;
      if not v_exists then
        raise exception 'send_notification: no % with id %', p_target_kind, p_target_id
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- A relative path only. An absolute URL here would let a notification carry somebody off to
  -- another host, which is not what "open the record" should be able to mean.
  if p_target_path is not null and p_target_path !~ '^/[^/]' then
    raise exception 'send_notification: target path must be a relative path starting with /'
      using errcode = 'check_violation';
  end if;

  select name into v_sender_name from public.app_users where id = v_sender;

  if p_target_kind is not null or p_target_path is not null then
    v_target := jsonb_strip_nulls(jsonb_build_object(
      'kind', p_target_kind,
      'id',   p_target_id,
      'path', p_target_path
    ));
  end if;

  insert into public.notification_events (type, payload, recipient_user_id, created_by)
  values (
    'ping',
    jsonb_strip_nulls(jsonb_build_object(
      'target',    v_target,
      'note',      nullif(btrim(coalesce(p_note, '')), ''),
      'from_name', v_sender_name,
      -- WRITTEN FOR THE OLD READERS TOO. Rows created before today carry invoice_id/transaction_id
      -- at the top level and several places still read them. Keeping both shapes on new rows means
      -- the front end and the dispatcher can be migrated after this ships rather than in the same
      -- breath, and nothing has to backfill the history.
      'invoice_id',     case when p_target_kind = 'invoice' then p_target_id end,
      'transaction_id', case when p_target_kind = 'transaction' then p_target_id end
    )),
    p_recipient,
    v_sender
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.send_notification(uuid, text, text, text, text) from public, anon;
grant execute on function public.send_notification(uuid, text, text, text, text) to authenticated;

-- The old name, kept so anything still calling it keeps working. Delegates rather than duplicating
-- the rules. Dropped first because PostgREST resolves overloads by argument name and two functions
-- differing only by a defaulted parameter answer the same call ambiguously.
drop function if exists public.request_approval_ping(uuid, uuid, text);
drop function if exists public.request_approval_ping(uuid, uuid, text, uuid);

create or replace function public.request_approval_ping(
  p_recipient      uuid,
  p_invoice_id     uuid default null,
  p_note           text default null,
  p_transaction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_transaction_id is not null then
    perform public.send_notification(
      p_recipient, p_note, 'transaction', p_transaction_id::text,
      '/banktransaktionen/' || p_transaction_id::text
    );
  elsif p_invoice_id is not null then
    perform public.send_notification(
      p_recipient, p_note, 'invoice', p_invoice_id::text,
      '/eingangsrechnungen/' || p_invoice_id::text
    );
  else
    perform public.send_notification(p_recipient, p_note, null, null, null);
  end if;
end $$;

revoke execute on function public.request_approval_ping(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.request_approval_ping(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Acknowledging one.
--
-- The bell already has a "seen" concept, but it is ONE TIMESTAMP PER USER
-- (app_users.notifications_seen_at, migration 20260827090000): opening the bell marks everything
-- seen at once. That is right for a bell and wrong for a note pinned to a record. Two ways it
-- breaks if reused here:
--
--   opening the bell would silence a note on a record the user never opened
--   dismissing the note on ONE record would silence every other notification they have
--
-- So this is per row, and it is the recipient's own act. The sender does not get to clear it and
-- neither does an admin.
-- ---------------------------------------------------------------------------

alter table public.notification_events
  add column if not exists acknowledged_at timestamptz;

comment on column public.notification_events.acknowledged_at is
  'When the RECIPIENT dismissed this notification on the record it points at. Separate from '
  'app_users.notifications_seen_at, which is one timestamp for the whole bell.';

create index if not exists notification_events_unacknowledged_idx
  on public.notification_events (recipient_user_id, created_at desc)
  where acknowledged_at is null;

create or replace function public.acknowledge_notification(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := public.current_app_user_id();
begin
  if v_user is null then
    raise exception 'acknowledge_notification: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;

  -- Scoped to the recipient in the WHERE clause rather than checked first: a security definer
  -- function that reads the row and then decides would let somebody else's id through a race.
  -- Already-acknowledged rows keep their original timestamp, so a double click does not rewrite
  -- when it was read.
  update public.notification_events
     set acknowledged_at = now()
   where id = p_event_id
     and recipient_user_id = v_user
     and acknowledged_at is null;
end $$;

revoke execute on function public.acknowledge_notification(bigint) from public, anon;
grant execute on function public.acknowledge_notification(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Delivering the moment the event is written.
--
-- WHY NOT JUST DROP THE CRON. The 15 minute job does three things and only the first is delivery:
--
--   deliverEvents   what this trigger now does immediately
--   deliverDigests  the daily briefing, which fires when a user's LOCAL send time passes. Purely
--                   clock driven. With no cron there is no briefing.
--   retry           a failed send is deliberately left unstamped so the next tick tries again.
--                   With no cron, one Slack outage loses the message for good.
--
-- So the cron stays as the safety net and the briefing clock. It simply stops being the path a
-- notification normally travels: by the time it next runs, everything it would have sent is
-- already stamped delivered.
--
-- A TRIGGER RATHER THAN A CALL FROM THE APP. Every producer gets this for free, instead of each
-- one remembering to poke the dispatcher. A client side call would also be skippable by anything
-- that writes the table directly.
--
-- pg_net queues the request and returns immediately, so the user's click does not wait on Slack,
-- and a dead gateway cannot fail their insert.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.notify_dispatch_now()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  -- Same Vault secret the cron job reads (migration 20260827130000). Missing key means the POST
  -- would be rejected at the gateway anyway, so skip quietly: the cron still delivers this event
  -- on its next tick, which is exactly the old behaviour.
  begin
    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'service_role_key';
  exception when others then
    v_key := null;
  end;
  if v_key is null or v_key = '' then
    return null;
  end if;

  -- The id goes in the body so the dispatcher delivers THIS event rather than draining the whole
  -- undelivered batch. Two notifications written a second apart would otherwise start two runs
  -- that both read the same batch and both post it.
  --
  -- PORTING NOTE: this ref is THIS project's, exactly like the cron migration. Replace the host
  -- when copying to another Hub.
  perform net.http_post(
    url := 'https://xsgbdtdwhrrhoeximeon.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'event', 'id', new.id),
    timeout_milliseconds := 30000
  );
  return null;
end $$;

revoke execute on function public.notify_dispatch_now() from public, anon, authenticated;

drop trigger if exists notification_events_dispatch_now on public.notification_events;
create trigger notification_events_dispatch_now
  after insert on public.notification_events
  for each row
  execute function public.notify_dispatch_now();

commit;
