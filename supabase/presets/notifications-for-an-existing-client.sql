-- Brings an existing client's database up to the notification tables a fresh clone gets
-- automatically. Additive only: notification_settings keeps its existing bell_events/bell_ack
-- exactly as they are (some clients' own data in there differs in shape from a fresh clone's;
-- this never touches those two columns), and only adds the digest-related columns a fresh clone
-- already has. Safe to run twice.

begin;

create table if not exists public.notification_channels (
    key text primary key,
    enabled boolean not null default false,
    config jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint notification_channels_config_is_object check (jsonb_typeof(config) = 'object')
);

create table if not exists public.notification_dispatch_log (
    id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    ok boolean,
    events integer not null default 0,
    digests integer not null default 0,
    errors jsonb
);

alter table public.notification_settings
    add column if not exists digest_enabled boolean not null default false,
    add column if not exists digest_events text[] not null default '{}',
    add column if not exists digest_channel text,
    add column if not exists digest_time time,
    add column if not exists timezone text not null default 'UTC',
    add column if not exists last_digest_sent_at timestamptz;

create table if not exists public.assistant_usage (
    id uuid primary key default gen_random_uuid(),
    search_id uuid,
    question text,
    language text,
    intent text,
    stage text,
    attempt integer not null default 1,
    provider text,
    model text,
    input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists assistant_usage_search on public.assistant_usage (search_id);

commit;
