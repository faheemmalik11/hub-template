-- The things a document is booked against: companies, properties, suppliers, customers, categories
-- and VAT rates.
--
-- English throughout, including the values. The screen shows whatever the locale file says; the
-- database stores a word a developer in any country can read.
--
-- Nothing here is seeded. A client's companies and categories are their data, loaded through the
-- panel or the app, never written into a schema file.
--
-- Soft delete everywhere: deleted_at, deleted_by and delete_reason. A booked document must keep
-- pointing at something, so a row is retired rather than removed.

begin;

create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    -- Whether this company books on the invoice date or on the payment date.
    booking_basis text not null default 'invoice_date',
    -- Where a filed copy of this company's documents lands, as a path in the client's own drive.
    filing_folder text,
    -- What a client calls its parts of the business, if it has any. The names are that client's data.
    area text,
    overhead_cost_centre integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint companies_booking_basis_known check (booking_basis in ('invoice_date', 'payment_date')),
    constraint companies_overhead_cost_centre_positive
        check (overhead_cost_centre is null or overhead_cost_centre > 0),
    constraint companies_filing_folder_shape check (public.is_folder_path(filing_folder))
);

create table if not exists public.properties (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    address text,
    -- How VAT is handled for this property, which the rules read when they decide deductibility.
    vat_status text,
    filing_folder text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint properties_filing_folder_shape check (public.is_folder_path(filing_folder))
);

-- A property can belong to more than one company, and carries its own cost centre in each.
create table if not exists public.property_companies (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    cost_centre_number integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint property_companies_cost_centre_positive
        check (cost_centre_number is null or cost_centre_number > 0)
);

create unique index if not exists property_companies_pair
    on public.property_companies (property_id, company_id) where deleted_at is null;

create table if not exists public.suppliers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    normalized_name text,
    vat_id text,
    normalized_vat_ids text[],
    address text,
    contact_person text,
    email text,
    phone text,
    -- The account shown on the supplier itself. The full set, with its evidence, is below.
    iban text,
    bic text,
    bank_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text
);

create index if not exists suppliers_normalized_name_idx on public.suppliers (normalized_name);

-- Every account this supplier has ever been seen with, and who vouched for it. A payment may only
-- use one a person confirmed, which is what stops an invoice with a swapped IBAN being paid.
create table if not exists public.supplier_bank_accounts (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    iban text not null,
    bic text,
    bank_name text,
    -- Where this account came from. 'pipeline' means it was read off a document.
    source text not null default 'pipeline',
    is_active boolean not null default true,
    is_default boolean not null default false,
    is_payable boolean not null default false,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz,
    confirmed_at timestamptz,
    confirmed_by text,
    created_by text,
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint supplier_bank_accounts_source_known check (source in ('pipeline', 'human', 'import')),
    -- Masked digits are allowed, since a document often shows only the last four.
    constraint supplier_bank_accounts_iban_shape check (iban ~ '^[A-Z]{2}[0-9*]{2}[A-Z0-9*]{11,30}$'),
    constraint supplier_bank_accounts_default_is_active check (not is_default or is_active),
    constraint supplier_bank_accounts_default_is_payable check (not is_default or is_payable)
);

create index if not exists supplier_bank_accounts_supplier_idx on public.supplier_bank_accounts (supplier_id);

-- Every time a supplier's account changed, and who was looking. A changed IBAN is the single most
-- common invoice fraud, so the trail is kept whether or not anybody asked for it.
create table if not exists public.supplier_iban_history (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid not null references public.suppliers(id) on delete cascade,
    old_iban text,
    new_iban text,
    changed_by text,
    source text,
    note text,
    changed_at timestamptz not null default now()
);

create index if not exists supplier_iban_history_supplier
    on public.supplier_iban_history (supplier_id, changed_at desc);

create table if not exists public.customers (
    id uuid primary key default gen_random_uuid(),
    company_id uuid references public.companies(id),
    is_company boolean not null default true,
    name text not null,
    normalized_name text,
    contact_person text,
    email text,
    phone text,
    address_street text,
    address_zip text,
    address_city text,
    address_country_code text,
    vat_id text,
    customer_number text,
    source text not null default 'app',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint customers_source_known check (source in ('app', 'upload'))
);

-- What a cost is booked as. A tree, so a client can group its own way.
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    name_en text,
    parent_id uuid references public.categories(id),
    -- Which side of the business this category belongs to.
    direction text not null default 'incoming',
    -- Where this category appears in the client's own report, as names that client chose.
    report_block text,
    report_line text,
    -- A category that never reaches the profit and loss account, for example a loan repayment.
    excluded_from_profit_and_loss boolean not null default false,
    -- The one category everything unmatched falls into. At most one may be marked.
    is_catchall boolean not null default false,
    is_active boolean not null default true,
    sort_order integer not null default 100,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint categories_direction_known check (direction in ('incoming', 'outgoing'))
);

create unique index if not exists categories_one_catchall on public.categories (is_catchall)
    where is_catchall and deleted_at is null;

-- The words a client's own people use for a category, so a rule can match what a document says.
create table if not exists public.category_aliases (
    id uuid primary key default gen_random_uuid(),
    category_id uuid not null references public.categories(id) on delete cascade,
    alias text not null,
    is_active boolean not null default true,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    constraint category_aliases_alias_not_blank check (btrim(alias) <> '')
);

create unique index if not exists category_aliases_unique on public.category_aliases (lower(alias))
    where is_active;

-- The same idea for a company or a property: what it is called on paper, which is rarely its code.
create table if not exists public.entity_aliases (
    id uuid primary key default gen_random_uuid(),
    entity_type text not null,
    entity_code text not null,
    alias text not null,
    is_active boolean not null default true,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint entity_aliases_type_known check (entity_type in ('company', 'property', 'category')),
    constraint entity_aliases_alias_not_blank check (btrim(alias) <> '')
);

create unique index if not exists entity_aliases_unique
    on public.entity_aliases (entity_type, lower(alias)) where is_active and deleted_at is null;

-- The rates that may appear on a document, per country. Not seeded: a client's set is their data.
create table if not exists public.vat_rates (
    id uuid primary key default gen_random_uuid(),
    country text not null,
    rate numeric(5, 2) not null,
    is_active boolean not null default true,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint vat_rates_rate_sane check (rate >= 0 and rate <= 100)
);

create unique index if not exists vat_rates_country_rate on public.vat_rates (country, rate)
    where deleted_at is null;

commit;
