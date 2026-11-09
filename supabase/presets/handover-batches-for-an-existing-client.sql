-- Brings an existing client's database up to the handover tables a fresh clone gets
-- automatically. Additive only. Safe to run twice.

begin;

create table if not exists public.handover_routes (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    direction text not null,
    address text not null,
    is_enabled boolean not null default false,
    note text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint handover_routes_direction_known check (direction in ('incoming', 'outgoing', 'other'))
);

create unique index if not exists handover_routes_company_direction
    on public.handover_routes (company_id, direction);

create table if not exists public.handover_batches (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    direction text not null,
    invoice_count integer not null default 0,
    total_bytes bigint not null default 0,
    status text not null,
    error_message text,
    sent_by text,
    created_at timestamptz not null default now(),
    bounced_at timestamptz,
    bounce_reason text,
    acknowledged_at timestamptz,
    acknowledged_by text,
    constraint handover_batches_direction_known check (direction in ('incoming', 'outgoing', 'other')),
    constraint handover_batches_status_known check (status in ('success', 'error', 'bounced'))
);

create index if not exists handover_batches_company on public.handover_batches (company_id, created_at desc);

commit;
