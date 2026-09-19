-- The rest of what a Hub keeps: outgoing invoices, notifications, the audit trail, guided tours and
-- what the assistant cost.
--
-- Nothing here is client specific, and no channel, tour or event type is seeded: what a client is
-- notified about, and by which channel, is a row somebody sets.

begin;

-- What this business billed, as opposed to what it was billed.
create table if not exists public.outgoing_invoices (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id),
    customer_id uuid references public.customers(id),
    invoice_number text,
    status text not null default 'draft',
    status_source text,
    invoice_date date,
    due_date date,
    amount_net numeric(14, 2),
    amount_gross numeric(14, 2),
    currency text not null default 'EUR',
    line_items jsonb,
    source text not null default 'app',
    -- How far the chasing has gone, and when the next step is due.
    reminder_level integer not null default 0,
    reminder_due_date date,
    handed_over_at timestamptz,
    handover_batch_id uuid references public.handover_batches(id),
    last_synced_at timestamptz,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint outgoing_invoices_status_known
        check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    constraint outgoing_invoices_reminder_level_sane check (reminder_level >= 0)
);

create index if not exists outgoing_invoices_company on public.outgoing_invoices (company_id)
    where deleted_at is null;

create table if not exists public.outgoing_invoice_files (
    id uuid primary key default gen_random_uuid(),
    outgoing_invoice_id uuid not null references public.outgoing_invoices(id) on delete cascade,
    filename text,
    mime text,
    size_bytes bigint,
    storage_bucket text,
    storage_path text,
    checksum_sha256 text,
    created_by text,
    created_at timestamptz not null default now()
);

create table if not exists public.outgoing_invoice_transaction_matches (
    id uuid primary key default gen_random_uuid(),
    outgoing_invoice_id uuid not null references public.outgoing_invoices(id) on delete cascade,
    transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
    status text not null default 'candidate',
    score numeric(5, 2),
    amount_matched numeric(14, 2),
    matched_by text,
    matched_at timestamptz,
    confirmed_by text,
    confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    constraint outgoing_invoice_matches_status_known
        check (status in ('candidate', 'auto', 'confirmed', 'rejected'))
);

create unique index if not exists outgoing_invoice_matches_pair
    on public.outgoing_invoice_transaction_matches (outgoing_invoice_id, transaction_id);

-- Which ways a client can be told something. A channel is a row, so adding one is configuration.
create table if not exists public.notification_channels (
    key text primary key,
    enabled boolean not null default false,
    config jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint notification_channels_config_is_object check (jsonb_typeof(config) = 'object')
);

-- What a notification can point at, so a message can link back to the thing it is about without
-- the notifier knowing every table.
create table if not exists public.notification_target_kinds (
    kind text primary key,
    source_table text not null,
    id_column text not null default 'id',
    is_active boolean not null default true
);

create table if not exists public.notification_events (
    id uuid primary key default gen_random_uuid(),
    type text not null,
    payload jsonb not null default '{}'::jsonb,
    recipient_user_id uuid references public.app_users(id) on delete cascade,
    delivered boolean not null default false,
    acknowledged_at timestamptz,
    created_by text,
    created_at timestamptz not null default now(),
    constraint notification_events_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists notification_events_recipient
    on public.notification_events (recipient_user_id, created_at desc);

create table if not exists public.notification_settings (
    user_id uuid primary key references public.app_users(id) on delete cascade,
    -- Which events reach the bell, and which reach a digest.
    bell_events text[] not null default '{}',
    bell_ack boolean not null default false,
    digest_enabled boolean not null default false,
    digest_events text[] not null default '{}',
    digest_channel text,
    digest_time time,
    timezone text not null default 'UTC',
    last_digest_sent_at timestamptz,
    updated_at timestamptz not null default now()
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

-- Who changed what, for every table that wants a trail. Generic on purpose: one table, named by
-- table_name and record_id, so a new feature gets an audit trail without a migration.
create table if not exists public.change_history (
    id uuid primary key default gen_random_uuid(),
    table_name text not null,
    record_id uuid not null,
    type text not null,
    text text,
    data jsonb,
    actor text,
    at timestamptz not null default now()
);

create index if not exists change_history_record on public.change_history (table_name, record_id, at desc);

-- How far each person has got through each guided tour.
create table if not exists public.tour_progress (
    user_id uuid not null references public.app_users(id) on delete cascade,
    tour_id text not null,
    version integer not null default 1,
    status text not null default 'open',
    last_step integer not null default 0,
    first_seen_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, tour_id),
    constraint tour_progress_status_known check (status in ('open', 'seen', 'done', 'skipped'))
);

drop trigger if exists tour_progress_touch on public.tour_progress;
create trigger tour_progress_touch before update on public.tour_progress
    for each row execute function public.set_updated_at();

-- What each assistant question cost, per attempt, so a bill can be explained per question.
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
