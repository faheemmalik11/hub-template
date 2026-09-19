-- 20260827110000_notification_system.sql
-- THE notification system migration (docs/NOTIFICATIONS.md), deliberately SELF-CONTAINED and
-- PORTABLE: copy this one file into any Hub project (Stäy, Eiffler, Living) and it sets up the
-- whole system. Every statement is idempotent, so it also re-runs safely here, where the
-- phase 1 pieces (section 1) were first shipped as 20260827090000_notifications_seen.sql and
-- are already live; they no-op on re-application.
--
-- Prerequisites this file assumes (all Hubs have them): app_users(id, email, name, is_active,
-- updated_at), invoices(created_at, due_date, deleted_at, archived_at, not_relevant_at), and
-- the RLS helpers current_app_user_id() / is_admin() (migration 0046 here).
--
-- The design rule: producers write EVENTS and know nothing about delivery; the dispatcher
-- (phase 3) reads undelivered events and routes them per channel. Until then the events table
-- already powers the in-app ping, and the bell reads counts directly.

begin;

-- ---------------------------------------------------------------------------
-- 1. "Seen" tracking for the header bell (phase 1).
--    Best-effort self-service RPC instead of a self-UPDATE RLS policy on app_users: write
--    policies there stay admin-only, this opens exactly one timestamp. Silent no-op on any
--    edge (no JWT, no row, deactivated user): an error must never surface from a bell click.
-- ---------------------------------------------------------------------------
alter table public.app_users
  add column if not exists notifications_seen_at timestamptz;

comment on column public.app_users.notifications_seen_at is
  'When this user last opened the notification bell. Written only via mark_notifications_seen(). Null = never opened (the bell falls back to a bounded window).';

create or replace function public.mark_notifications_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    return;
  end if;

  update public.app_users
     set notifications_seen_at = now(),
         updated_at = now()
   where lower(email) = lower(v_email);
end;
$$;

revoke execute on function public.mark_notifications_seen() from public;
revoke execute on function public.mark_notifications_seen() from anon;
grant execute on function public.mark_notifications_seen() to authenticated;

-- The bell polls every 60s per signed-in user; two partial indexes keep those counts cheap
-- however large invoices grows.
create index if not exists invoices_active_created_at_idx
  on public.invoices (created_at)
  where deleted_at is null and archived_at is null and not_relevant_at is null;

create index if not exists invoices_due_date_idx
  on public.invoices (due_date)
  where due_date is not null;

-- ---------------------------------------------------------------------------
-- 2. Per-user settings (phase 2). One row per app_users row, created lazily on first save.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_settings (
  user_id        uuid primary key references public.app_users(id) on delete cascade,
  -- Per event type an explicit false hides that row from the bell; a missing key means ON.
  -- Stored as overrides rather than a full list so newly added event types default to visible
  -- without a data migration.
  bell_events    jsonb not null default '{}'::jsonb,
  digest_enabled boolean not null default false,
  digest_time    time not null default '08:00',
  digest_channel text not null default 'team' check (digest_channel in ('team', 'personal')),
  digest_events  jsonb not null default '{}'::jsonb,
  timezone       text not null default 'Europe/Berlin',
  -- Stamped by the phase 3 dispatcher for per-day dedupe of the daily briefing.
  last_digest_sent_at timestamptz,
  updated_at     timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists "notification_settings_own_read" on public.notification_settings;
create policy "notification_settings_own_read" on public.notification_settings
  for select to authenticated
  using (user_id = public.current_app_user_id() or public.is_admin());

drop policy if exists "notification_settings_own_insert" on public.notification_settings;
create policy "notification_settings_own_insert" on public.notification_settings
  for insert to authenticated
  with check (user_id = public.current_app_user_id());

drop policy if exists "notification_settings_own_update" on public.notification_settings;
create policy "notification_settings_own_update" on public.notification_settings
  for update to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- 3. Channel configuration, admin-managed. One row per delivery channel. Secrets do NOT go in
--    config: the Slack webhook URL lives in Vault (phase 3); n8n's inbound webhook URL is
--    entered by the admin and is only as sensitive as the admin screen it is typed into.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_channels (
  key        text primary key,
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notification_channels enable row level security;

drop policy if exists "notification_channels_admin_read" on public.notification_channels;
create policy "notification_channels_admin_read" on public.notification_channels
  for select to authenticated using (public.is_admin());

drop policy if exists "notification_channels_admin_write" on public.notification_channels;
create policy "notification_channels_admin_write" on public.notification_channels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- PORTING: these seed rows decide which channel cards the settings screen OFFERS on this Hub.
-- A project that should not offer a channel simply removes its line here (or deletes the row
-- later); the UI renders cards from the rows, so no code changes per project.
insert into public.notification_channels (key, enabled, config)
values ('n8n', false, '{}'::jsonb), ('slack', false, '{}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. The event log. Producers insert, channels stamp delivery. No direct client writes: the
--    only authenticated path in is the RPC below; triggers and the dispatcher come in phase 3.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_events (
  id                bigint generated always as identity primary key,
  type              text not null,
  payload           jsonb not null default '{}'::jsonb,
  recipient_user_id uuid references public.app_users(id) on delete cascade,
  created_by        uuid references public.app_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- {channel key: ISO timestamp} once a channel delivered this event.
  delivered         jsonb not null default '{}'::jsonb
);

create index if not exists notification_events_recipient_idx
  on public.notification_events (recipient_user_id, created_at desc);

-- The dispatcher's work queue: everything nothing has delivered yet stays in a small partial
-- index however large the log grows.
create index if not exists notification_events_undelivered_idx
  on public.notification_events (created_at)
  where delivered = '{}'::jsonb;

alter table public.notification_events enable row level security;

drop policy if exists "notification_events_recipient_read" on public.notification_events;
create policy "notification_events_recipient_read" on public.notification_events
  for select to authenticated
  using (recipient_user_id = public.current_app_user_id() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. The ping. "Request approval / I still need an invoice from her" from inside the system
--    (Stäy meeting 26.08). security definer so no general INSERT policy on the event table is
--    needed; validates both ends and records who asked.
-- ---------------------------------------------------------------------------
create or replace function public.request_approval_ping(
  p_recipient uuid,
  p_invoice_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := public.current_app_user_id();
  v_sender_name text;
begin
  if v_sender is null then
    raise exception 'request_approval_ping: no active app_users row for this session'
      using errcode = 'insufficient_privilege';
  end if;
  if p_recipient is null then
    raise exception 'request_approval_ping: recipient is required';
  end if;
  if not exists (select 1 from public.app_users where id = p_recipient and is_active) then
    raise exception 'request_approval_ping: recipient % is not an active user', p_recipient;
  end if;
  if p_invoice_id is not null
     and not exists (select 1 from public.invoices where id = p_invoice_id) then
    raise exception 'request_approval_ping: invoice % does not exist', p_invoice_id;
  end if;

  select name into v_sender_name from public.app_users where id = v_sender;

  insert into public.notification_events (type, payload, recipient_user_id, created_by)
  values (
    'ping',
    jsonb_strip_nulls(jsonb_build_object(
      'invoice_id', p_invoice_id,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'from_name', v_sender_name
    )),
    p_recipient,
    v_sender
  );
end;
$$;

revoke execute on function public.request_approval_ping(uuid, uuid, text) from public;
revoke execute on function public.request_approval_ping(uuid, uuid, text) from anon;
grant execute on function public.request_approval_ping(uuid, uuid, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- begin
--   perform public.mark_notifications_seen();  -- no JWT: must be a silent no-op
--   if not exists (select 1 from information_schema.tables
--                  where table_schema = 'public' and table_name = 'notification_events') then
--     raise exception 'notification_events missing';
--   end if;
--   if not exists (select 1 from public.notification_channels where key = 'n8n') then
--     raise exception 'n8n channel row missing';
--   end if;
--   raise notice 'self-check ok';
-- end $$;
