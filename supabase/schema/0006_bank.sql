-- Bank accounts, what moved through them, and what was paid.
--
-- NO VENDOR NAMES. The aggregator that serves a connection is a row in bank_providers and a handful
-- of provider_* references, never a column called after one company. A client on a different
-- aggregator, or on a manual import alone, uses the same tables.
--
-- Vocabulary is English: a transaction is open, matched or ignored; a match is a candidate, auto,
-- confirmed or rejected.

begin;

-- The banks this deployment can connect to, as the aggregator lists them.
create table if not exists public.bank_providers (
    id uuid primary key default gen_random_uuid(),
    bank_name text not null,
    provider_ref text,
    provider_name text,
    supports_direct_transfer boolean not null default false,
    is_supported boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- One consented connection to a bank. The access handle is a reference, never a credential: the
-- secret itself lives with the other credentials, sealed.
create table if not exists public.bank_connections (
    id uuid primary key default gen_random_uuid(),
    bank_provider_id uuid references public.bank_providers(id),
    provider_ref text,
    provider_access_ref text,
    provider_user text,
    credential_ref text,
    bank_name text,
    provider_name text,
    status text not null default 'pending',
    is_sandbox boolean not null default false,
    last_sync_at timestamptz,
    last_sync_status text,
    metadata jsonb not null default '{}'::jsonb,
    connected_by uuid references public.app_users(id),
    connected_by_email text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    constraint bank_connections_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.bank_accounts (
    id uuid primary key default gen_random_uuid(),
    connection_id uuid references public.bank_connections(id) on delete cascade,
    company_id uuid references public.companies(id),
    provider_account_ref text,
    provider_ref text,
    account_name text,
    -- Whether the name was set by a person, so a sync does not overwrite it.
    name_is_custom boolean not null default false,
    iban text,
    bic text,
    bank_name text,
    holder text,
    product_type text,
    currency text,
    balance numeric(14, 2),
    balance_date date,
    -- An account of this business, as opposed to a counterparty's.
    is_own_account boolean not null default true,
    is_active boolean not null default true,
    is_sandbox boolean not null default false,
    -- How it was connected: through the aggregator, or by hand.
    connect_route text,
    metadata jsonb not null default '{}'::jsonb,
    -- Left out of reconciliation on purpose, with the reason kept.
    excluded_at timestamptz,
    excluded_by text,
    exclusion_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint bank_accounts_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists bank_accounts_connection on public.bank_accounts (connection_id);
create index if not exists bank_accounts_company on public.bank_accounts (company_id);

create table if not exists public.bank_transactions (
    id uuid primary key default gen_random_uuid(),
    account_id uuid references public.bank_accounts(id) on delete cascade,
    connection_id uuid references public.bank_connections(id) on delete set null,
    company_id uuid references public.companies(id),
    -- What the provider calls this line, used to recognise it again on the next sync.
    provider_hash text,
    external_id text,
    source text not null default 'sync',
    amount numeric(14, 2) not null,
    currency text,
    direction text,
    booking_date date,
    value_date date,
    payment_reference text,
    booking_text text,
    counterparty_holder text,
    counterparty_iban text,
    counterparty_bic text,
    -- Where this line stands against the documents.
    matching_status text not null default 'open',
    -- A card spender, where the money was spent by a person rather than the company account.
    spender_name text,
    spender_email text,
    transaction_type text,
    transaction_type_source text,
    category_id uuid references public.categories(id),
    category_source text,
    -- Deliberately expected to have no receipt, with the rule that said so.
    no_receipt_reason text,
    no_receipt_set_by text,
    no_receipt_set_at timestamptz,
    whitelist_rule_id uuid,
    -- Fully accounted for by the documents matched to it, even if none covers it alone.
    fully_used_at timestamptz,
    fully_used_by text,
    fully_used_note text,
    is_sandbox boolean not null default false,
    raw_data jsonb,
    imported_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    deleted_at timestamptz,
    constraint bank_transactions_matching_status_known
        check (matching_status in ('open', 'matched', 'ignored')),
    constraint bank_transactions_direction_known
        check (direction is null or direction in ('incoming', 'outgoing'))
);

create index if not exists bank_transactions_account on public.bank_transactions (account_id);
create index if not exists bank_transactions_company on public.bank_transactions (company_id);
create index if not exists bank_transactions_booking_date on public.bank_transactions (booking_date desc);
create index if not exists bank_transactions_matching_status on public.bank_transactions (matching_status)
    where deleted_at is null;
create unique index if not exists bank_transactions_provider_hash on public.bank_transactions (provider_hash)
    where provider_hash is not null;

-- What a run of the sync did, for a person asking why a line is missing.
create table if not exists public.bank_sync_logs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid,
    connection_id uuid references public.bank_connections(id) on delete cascade,
    event text not null,
    level text not null default 'info',
    message text,
    counts jsonb,
    created_at timestamptz not null default now(),
    deleted_at timestamptz
);

create index if not exists bank_sync_logs_connection on public.bank_sync_logs (connection_id, created_at desc);

-- A document against a transaction. Several documents may share one line, and one document may be
-- split across lines, so this is a table rather than a column on either side.
create table if not exists public.document_transaction_matches (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
    status text not null default 'candidate',
    score numeric(5, 2),
    match_reasons jsonb,
    amount_matched numeric(14, 2),
    difference_reason text,
    matched_by text,
    matched_at timestamptz,
    confirmed_by text,
    confirmed_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    reject_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint document_transaction_matches_status_known
        check (status in ('candidate', 'auto', 'confirmed', 'rejected'))
);

create unique index if not exists document_transaction_matches_pair
    on public.document_transaction_matches (document_id, transaction_id);

-- How close a transaction has to be to a document before it is offered, and before it is taken.
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

-- Lines that are expected to have no document, so they stop being chased.
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

-- A figure somebody books without a document behind it, such as a monthly accrual.
create table if not exists public.manual_bookings (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id),
    property_id uuid references public.properties(id),
    category_id uuid references public.categories(id),
    period date not null,
    amount numeric(14, 2) not null,
    note text,
    is_recurring boolean not null default false,
    recurrence_until date,
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text
);

create index if not exists manual_bookings_company on public.manual_bookings (company_id);

-- A transfer this Hub asked the bank to make. Kept even when it fails, because a client needs to
-- see that it was tried.
create table if not exists public.payment_orders (
    id uuid primary key default gen_random_uuid(),
    document_id uuid references public.documents(id),
    company_id uuid references public.companies(id),
    recipient_name text,
    recipient_iban text,
    recipient_bic text,
    amount numeric(14, 2) not null,
    currency text not null default 'EUR',
    payment_reference text,
    status text not null default 'created',
    status_reason text,
    provider_access_ref text,
    provider_account_ref text,
    provider_payment_ref text,
    -- The same order must never be sent twice, whatever the network did.
    idempotency_key text unique,
    -- Set when the recipient's account changed shortly before this was raised.
    recipient_iban_changed_recently boolean not null default false,
    fraud_flags jsonb,
    is_sandbox boolean not null default false,
    initiated_by uuid references public.app_users(id),
    initiated_at timestamptz,
    authorized_at timestamptz,
    executed_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists payment_orders_document on public.payment_orders (document_id);
create index if not exists payment_orders_company on public.payment_orders (company_id);

insert into public.matching_settings (id) values (true) on conflict (id) do nothing;

commit;
