-- Brings an existing client's database up to the remaining bank-reconciliation tables a fresh
-- clone gets automatically (document_transaction_matches and its views already landed in
-- document-views-for-an-existing-client.sql). Additive only. Safe to run twice.

begin;

create table if not exists public.matching_settings (
    id boolean primary key default true,
    amount_tolerance numeric(14, 2) not null default 0.00,
    candidate_threshold numeric(5, 2) not null default 60.00,
    auto_match_threshold numeric(5, 2) not null default 95.00,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint matching_settings_one_row check (id),
    constraint matching_settings_thresholds_ordered check (auto_match_threshold >= candidate_threshold)
);

insert into public.matching_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.open_item_whitelist_rules (
    id uuid primary key default gen_random_uuid(),
    term text not null,
    scope text not null default 'counterparty',
    category text,
    is_active boolean not null default true,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint open_item_whitelist_rules_scope_known
        check (scope in ('counterparty', 'reference', 'booking_text'))
);

commit;
