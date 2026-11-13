begin;

create table if not exists public.lexware_webhook_events (
    id bigserial primary key,
    event_type text not null,
    resource_id text not null,
    event_date timestamptz,
    received_at timestamptz not null default now(),
    outcome text
);

-- Lexware does not always send an event date, and a plain unique constraint treats two nulls as
-- different rows, so a replayed delivery without one would be handled twice.
create unique index if not exists lexware_webhook_events_delivery
    on public.lexware_webhook_events
       (event_type, resource_id, coalesce(event_date, 'epoch'::timestamptz));

create index if not exists lexware_webhook_events_received
    on public.lexware_webhook_events (received_at desc);

-- No policy is added on purpose: only the webhook Edge Function, running as service_role, ever
-- touches these rows, so every other caller, including a signed-in admin, is correctly refused.
alter table public.lexware_webhook_events enable row level security;

create table if not exists public.lexware_organization (
    id boolean primary key default true,
    organization_id text,
    fetched_at timestamptz,
    constraint lexware_organization_single_row check (id)
);

insert into public.lexware_organization (id) values (true) on conflict (id) do nothing;

-- Same reasoning as above: the webhook reads this row to decide whether a delivery belongs to this
-- Hub's own Lexware organization, and fills it from /v1/profile the first time.
alter table public.lexware_organization enable row level security;

commit;
