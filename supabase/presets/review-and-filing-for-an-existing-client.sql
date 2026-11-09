-- Brings an existing client's database up to the rules/filing tables and property columns a
-- fresh clone gets automatically. Additive only: properties keeps its existing sharepoint_path
-- and filing_site_id exactly as they are, and only gains the columns a fresh clone's query
-- expects so that query can run at all. Safe to run twice.

begin;

create table if not exists public.category_account_mapping (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references public.categories(id) on delete cascade,
    company_id uuid references public.companies(id) on delete cascade,
    account_number text not null,
    account_name text,
    direction text not null default 'incoming',
    is_active boolean not null default true,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint category_account_mapping_direction_known check (direction in ('incoming', 'outgoing'))
);

create unique index if not exists category_account_mapping_unique
    on public.category_account_mapping (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), category_id, direction)
    where is_active;

create table if not exists public.filing_placements (
    id uuid primary key default gen_random_uuid(),
    channel text not null,
    workflow_status text not null,
    folder_id text not null,
    folder_label text,
    month_partition boolean not null default false,
    partition_pattern text,
    routing text not null default 'fixed',
    is_active boolean not null default true,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint filing_placements_routing_known check (routing in ('fixed', 'company', 'property')),
    constraint filing_placements_month_needs_fixed
        check (routing = 'fixed' or (not month_partition and partition_pattern is null)),
    constraint filing_placements_partition_pattern_shape check (
        partition_pattern is null
        or (partition_pattern ~ '\{(yyyy|mm)\}' and partition_pattern !~ '(^/|/$|//|\.\.)')),
    constraint filing_placements_status_known check (workflow_status in (
        'received', 'in_review', 'query', 'approved_first', 'approved_final',
        'paid', 'handed_over', 'closed', 'rejected', 'not_relevant'))
);

alter table public.properties
    add column if not exists filing_folder text,
    add column if not exists source text,
    add column if not exists external_id text;

commit;
