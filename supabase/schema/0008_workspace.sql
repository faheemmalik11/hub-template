-- The rest of what a Hub keeps: outgoing invoices, notifications, the audit trail, guided tours and
-- what the assistant cost.
--
-- Nothing here is client specific, and no channel, tour or event type is seeded: what a client is
-- notified about, and by which channel, is a row somebody sets.

begin;

-- A brokered sale, from which one commission invoice per paying party is drafted.
create table if not exists public.deals (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id),
    property_id uuid references public.properties(id),
    property_label text,
    source text not null default 'app',
    external_id text,
    status text not null default 'incomplete',
    notarised_on date,
    purchase_price numeric(14, 2),
    vat_rate numeric(5, 2) not null default 19.00,
    acquired_by uuid references public.app_users(id),
    handled_by uuid references public.app_users(id),
    -- What a broker's bonus depends on, ticked by the broker or read from the CRM.
    own_lead boolean not null default false,
    from_viewing boolean not null default false,
    costs_closed_at timestamptz,
    ready_for_bookkeeping_at timestamptz,
    referrer_customer_id uuid references public.customers(id),
    note text,
    approved_by uuid references public.app_users(id),
    approved_at timestamptz,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint deals_status_known
        check (status in ('incomplete', 'ready', 'approved', 'invoiced', 'cancelled')),
    constraint deals_purchase_price_positive check (purchase_price is null or purchase_price > 0),
    constraint deals_approval_complete check ((approved_by is null) = (approved_at is null))
);

create unique index if not exists deals_source_external_id on public.deals (source, external_id)
    where external_id is not null;
create index if not exists deals_company on public.deals (company_id) where deleted_at is null;

drop trigger if exists deals_touch on public.deals;
create trigger deals_touch before update on public.deals
    for each row execute function public.set_updated_at();

-- What one side of a deal pays: a net percentage of the price, or a fixed net amount.
create table if not exists public.deal_sides (
    id uuid primary key default gen_random_uuid(),
    deal_id uuid not null references public.deals(id) on delete cascade,
    side text not null,
    fee_kind text not null,
    fee_net_rate numeric(6, 3),
    fee_net_amount numeric(14, 2),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (deal_id, side),
    constraint deal_sides_side_known check (side in ('buyer', 'seller')),
    -- The fee may still be missing on an incomplete deal, but never belong to the other kind.
    constraint deal_sides_fee_shape check (
        (fee_kind = 'percent' and fee_net_amount is null and (fee_net_rate is null or fee_net_rate > 0))
        or (fee_kind = 'fixed' and fee_net_rate is null and (fee_net_amount is null or fee_net_amount > 0)))
);

drop trigger if exists deal_sides_touch on public.deal_sides;
create trigger deal_sides_touch before update on public.deal_sides
    for each row execute function public.set_updated_at();

-- Who pays on a side, and the discount that person was granted. No share on any party of a side means they split it equally.
create table if not exists public.deal_parties (
    id uuid primary key default gen_random_uuid(),
    deal_side_id uuid not null references public.deal_sides(id) on delete cascade,
    customer_id uuid not null references public.customers(id),
    share_percent numeric(6, 3),
    discount_gross numeric(14, 2) not null default 0,
    discount_reason text,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    unique (deal_side_id, customer_id),
    constraint deal_parties_share_in_range
        check (share_percent is null or (share_percent > 0 and share_percent <= 100)),
    constraint deal_parties_discount_not_negative check (discount_gross >= 0)
);

-- What this business billed, as opposed to what it was billed.
create table if not exists public.outgoing_invoices (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id),
    customer_id uuid references public.customers(id),
    deal_party_id uuid references public.deal_parties(id),
    -- Null is an ordinary invoice. A referral credit is paid out to whoever recommended the customer,
    -- so it names the deal that earned it rather than another invoice.
    kind text,
    deal_id uuid references public.deals(id),
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
    -- When the money is expected, where there is no due date: a seller pays once the purchase price
    -- has reached them, weeks after the invoice.
    expected_payment_on date,
    sent_at timestamptz,
    accounting_external_id text,
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
    constraint outgoing_invoices_kind_known
        check (kind is null or kind in ('commission', 'coaching', 'referral_credit')),
    constraint outgoing_invoices_reminder_level_sane check (reminder_level >= 0)
);

create index if not exists outgoing_invoices_company on public.outgoing_invoices (company_id)
    where deleted_at is null;
create unique index if not exists outgoing_invoices_accounting_external_id
    on public.outgoing_invoices (accounting_external_id)
    where accounting_external_id is not null and deleted_at is null;

create table if not exists public.outgoing_invoice_files (
    id uuid primary key default gen_random_uuid(),
    outgoing_invoice_id uuid not null references public.outgoing_invoices(id) on delete cascade,
    filename text,
    mime text,
    size_bytes bigint,
    storage_bucket text,
    storage_path text,
    checksum_sha256 text,
    -- Where the filed copy sits, when it was filed to a drive as well.
    external_id text,
    web_url text,
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
-- What a notification can point at. `send_notification` refuses a kind that is not here, so this
-- is reference data rather than a client's own: an empty table means no notification can name a
-- record at all.
--
-- `source_table` is null for a kind with no record behind it, which is what lets a notification
-- point at a screen. The existence check in `send_notification` skips those on purpose.
create table if not exists public.notification_target_kinds (
    kind text primary key,
    source_table text,
    id_column text not null default 'id',
    is_active boolean not null default true
);

insert into public.notification_target_kinds (kind, source_table, id_column) values
  ('invoice',     'documents',         'id'),
  ('transaction', 'bank_transactions', 'id'),
  ('supplier',    'suppliers',         'id'),
  ('customer',    'customers',         'id'),
  -- A property is addressed by its code, here and in its URL.
  ('property',    'properties',        'code'),
  -- A page is a path, not a row, so there is nothing to look up.
  ('page',        null,                'id')
on conflict (kind) do update
   set source_table = excluded.source_table, id_column = excluded.id_column;

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
