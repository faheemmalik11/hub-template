-- The documents themselves, their files, and everything read off them.
--
-- VOCABULARY. Every stored value is English. The screen says whatever the locale file says, so a
-- German Hub reads German while the database reads the same in any country. The words a client's
-- existing data uses map like this, for whoever writes that migration one day:
--   eingegangen received · in_pruefung in_review · rueckfrage query · freigegeben_assistenz
--   approved_first · freigegeben_vorgesetzter approved_final · bezahlt paid · uebergeben_datev
--   handed_over · abgeschlossen closed · abgelehnt rejected · nicht_relevant not_relevant
--   gruen green · gelb yellow · rot red
--   herstellungsaufwand capital_expense · erhaltungsaufwand maintenance_expense
--
-- The text search configuration is a client setting, not a constant: a German client indexes German.
-- It is applied by 0009_search.sql so this file stays language free.

begin;

create table if not exists public.documents (
    id uuid primary key default gen_random_uuid(),

    -- What it is and where it came from
    document_type text,
    source text,
    intake_channel text,
    source_item_id text,
    source_document_id uuid references public.documents(id),
    page_range text,
    content_hash text,

    -- Who issued it and to whom
    issuer text,
    issuer_address text,
    recipient_name text,
    recipient_address text,
    supplier_id uuid references public.suppliers(id),
    customer_number text,

    -- The figures
    invoice_number text,
    order_number text,
    document_date date,
    service_date date,
    service_period_from date,
    service_period_to date,
    due_date date,
    amount_net numeric(14, 2),
    vat_rate numeric(5, 2),
    vat_amount numeric(14, 2),
    amount_gross numeric(14, 2),
    currency text,
    is_small_amount boolean,
    service_description text,
    payment_reference text,
    payment_method text,
    tax_note text,

    -- What it is booked against
    company_id uuid references public.companies(id),
    company_code text,
    property_id uuid references public.properties(id),
    property_code text,
    business_line_id uuid,
    business_line_code text,
    category_id uuid references public.categories(id),
    cost_category text,
    is_overhead boolean not null default false,

    -- How each of those was decided, so a wrong answer can be traced to what produced it
    assignment_source text,
    company_assignment_source text,
    property_assignment_source text,
    assignment_decided_by text,
    cost_category_source text,
    vat_source text,
    paid_source text,

    -- VAT treatment
    vat_treatment text,
    vat_deductible_pct numeric(5, 2),
    vat_deductible_amount numeric(14, 2),
    vat_nondeductible_amount numeric(14, 2),
    vat_deductibility_source text,
    vat_special_case text,
    vat_conflict_at timestamptz,
    vat_conflict_note text,
    income_tax_treatment text,

    -- What the reader made of it
    status text,
    traffic_light text,
    confidence_score numeric(5, 2),
    extracted jsonb,
    validation jsonb,
    validation_detail jsonb,
    ocr_fulltext text,
    line_items jsonb,
    tax jsonb,
    already_paid boolean,

    -- Where the work stands
    workflow_status text not null default 'received',
    assigned_to text,
    assigned_user_id uuid references public.app_users(id),
    approved_by uuid references public.app_users(id),
    urgency text,
    days_until_due integer,
    early_payment_deadline date,
    early_payment_discount_percent numeric(5, 2),
    early_payment_discount_amount numeric(14, 2),
    paid_at timestamptz,
    filed_at timestamptz,
    storage_path text,
    uploaded_for_transaction_id uuid,

    -- Handover to the accountant
    handed_over_at timestamptz,
    handover_batch_id uuid,

    -- Set aside rather than deleted
    not_relevant_at timestamptz,
    not_relevant_by text,
    not_relevant_note text,
    archived_at timestamptz,
    archived_by text,
    archive_note text,
    mailbox_reset_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,

    constraint documents_workflow_status_known check (workflow_status in (
        'received', 'in_review', 'query', 'approved_first', 'approved_final',
        'paid', 'handed_over', 'closed', 'rejected', 'not_relevant')),
    constraint documents_traffic_light_known
        check (traffic_light is null or traffic_light in ('green', 'yellow', 'red')),
    constraint documents_vat_deductible_pct_sane
        check (vat_deductible_pct is null or (vat_deductible_pct >= 0 and vat_deductible_pct <= 100)),
    constraint documents_vat_source_known
        check (vat_source is null or vat_source in ('ai', 'rule', 'human')),
    constraint documents_cost_category_source_known
        check (cost_category_source is null or cost_category_source in ('ai', 'rule', 'human')),
    constraint documents_vat_deductibility_source_known
        check (vat_deductibility_source is null or vat_deductibility_source in ('ai', 'rule', 'human')),
    constraint documents_assignment_decided_by_known
        check (assignment_decided_by is null or assignment_decided_by in ('ai', 'rule', 'human')),
    constraint documents_income_tax_treatment_known
        check (income_tax_treatment is null or income_tax_treatment in ('capital_expense', 'maintenance_expense')),
    -- Overhead belongs to the company as a whole, so it cannot also sit on one property.
    constraint documents_overhead_has_no_property check (not (is_overhead and property_id is not null))
);

create index if not exists documents_status on public.documents (status) where deleted_at is null;
create index if not exists documents_workflow_status on public.documents (workflow_status) where deleted_at is null;
create index if not exists documents_company on public.documents (company_id) where deleted_at is null;
create index if not exists documents_property on public.documents (property_id) where deleted_at is null;
create index if not exists documents_supplier on public.documents (supplier_id) where deleted_at is null;
create index if not exists documents_document_date on public.documents (document_date desc) where deleted_at is null;
create index if not exists documents_content_hash on public.documents (content_hash) where deleted_at is null;

-- One file per role, so a second scan replaces the first instead of piling up beside it.
create table if not exists public.document_files (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    role text not null default 'original',
    filename text,
    mime text,
    size_bytes bigint,
    storage_bucket text,
    storage_path text,
    checksum_sha256 text,
    external_id text,
    source text,
    transaction_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text
);

create unique index if not exists document_files_one_per_role
    on public.document_files (document_id, role) where deleted_at is null;

-- What happened to this document, in order. The trail a person reads on the detail screen.
create table if not exists public.document_history (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    type text not null,
    text text,
    data jsonb,
    actor text,
    created_at timestamptz not null default now()
);

create index if not exists document_history_document on public.document_history (document_id, created_at desc);

create table if not exists public.document_line_items (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    position integer,
    description text,
    quantity numeric(14, 3),
    unit_price numeric(14, 4),
    amount numeric(14, 2),
    vat_rate numeric(5, 2),
    created_at timestamptz not null default now()
);

create index if not exists document_line_items_document on public.document_line_items (document_id);

-- One row per rate on the document, because a single invoice can carry several.
create table if not exists public.document_taxes (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    rate numeric(5, 2),
    net numeric(14, 2),
    vat_amount numeric(14, 2),
    created_at timestamptz not null default now()
);

create index if not exists document_taxes_document on public.document_taxes (document_id);

-- Every account seen on this document, in the order they appeared. Two accounts on one invoice is
-- the case a person has to look at.
create table if not exists public.document_bank_accounts (
    document_id uuid not null references public.documents(id) on delete cascade,
    supplier_bank_account_id uuid not null references public.supplier_bank_accounts(id) on delete cascade,
    position integer not null default 1,
    origin text,
    first_seen_at timestamptz not null default now(),
    primary key (document_id, supplier_bank_account_id)
);

commit;
