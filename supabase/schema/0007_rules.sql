-- The rules a client sets for themselves: what a document is booked as, and who has to approve it.
--
-- A rule is data. Nothing here knows a client's categories, companies or people, and none of it is
-- seeded. Specificity decides which rule wins when several match, so adding one never reorders the
-- others by accident.
--
-- VAT treatments are English: taxable, exempt, reverse_charge, small_business.

begin;

-- What this document should be booked as, when it matches.
create table if not exists public.assignment_rules (
    id uuid primary key default gen_random_uuid(),
    -- Which field the rule sets.
    target text not null,
    -- Matched on any combination of these; the more that are set, the more specific it is.
    supplier_id uuid references public.suppliers(id) on delete cascade,
    company_id uuid references public.companies(id) on delete cascade,
    property_id uuid references public.properties(id) on delete cascade,
    reference_pattern text,
    -- What it sets.
    category_id uuid references public.categories(id),
    cost_category text,
    vat_rate numeric(5, 2),
    vat_treatment text,
    vat_deductible_pct numeric(5, 2),
    vat_special_case text,
    -- Worked out from how many conditions are set, so the winner is never a matter of row order.
    specificity integer not null default 0,
    is_active boolean not null default true,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint assignment_rules_target_known check (target in ('cost_category', 'vat_rate')),
    constraint assignment_rules_target_is_set check (
        (target = 'cost_category' and (category_id is not null or cost_category is not null))
        or (target = 'vat_rate' and vat_rate is not null)),
    constraint assignment_rules_vat_treatment_known check (
        vat_treatment is null
        or vat_treatment in ('taxable', 'exempt', 'reverse_charge', 'small_business')),
    constraint assignment_rules_vat_deductible_pct_sane check (
        vat_deductible_pct is null or (vat_deductible_pct >= 0 and vat_deductible_pct <= 100)),
    constraint assignment_rules_vat_extras_need_vat_target check (
        (vat_deductible_pct is null and vat_special_case is null) or target = 'vat_rate')
);

create index if not exists assignment_rules_supplier on public.assignment_rules (supplier_id) where is_active;

-- Who has to approve, and from what amount. Two steps at most, the second skippable.
create table if not exists public.approval_rules (
    id uuid primary key default gen_random_uuid(),
    supplier_id uuid references public.suppliers(id) on delete cascade,
    company_id uuid references public.companies(id) on delete cascade,
    property_id uuid references public.properties(id) on delete cascade,
    min_amount numeric(14, 2) not null default 0,
    step_1_user_id uuid references public.app_users(id),
    step_2_user_id uuid references public.app_users(id),
    skip_step_2 boolean not null default false,
    specificity integer not null default 0,
    is_active boolean not null default true,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint approval_rules_min_amount_positive check (min_amount >= 0),
    constraint approval_rules_two_steps_differ check (
        step_2_user_id is null or step_1_user_id is null or step_2_user_id <> step_1_user_id)
);

-- Who stands in an approval chain. A person here is an app user; the extra columns are about the
-- chain, not about the account.
create table if not exists public.approvers (
    id uuid primary key default gen_random_uuid(),
    app_user_id uuid references public.app_users(id) on delete cascade,
    name text not null,
    -- Which step of the chain this person serves. Named by the step, not by a job title.
    step text not null default 'first',
    deputy_name text,
    escalation_days integer,
    -- Whether this person is the one who actually moves the money.
    pays boolean not null default false,
    area text,
    covers_all_areas boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint approvers_step_known check (step in ('first', 'final')),
    constraint approvers_escalation_days_positive check (escalation_days is null or escalation_days > 0)
);

-- Where a handover is sent, per company and direction. One address per pairing, so a client who
-- sends incoming and outgoing to different people at the accountant can say so.
create table if not exists public.handover_routes (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    direction text not null,
    address text not null,
    is_enabled boolean not null default true,
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
    -- What became of the send itself, not of the documents in it.
    status text not null,
    error_message text,
    sent_by text,
    created_at timestamptz not null default now(),
    -- A bounce is the case that matters: the accountant never got it, and nobody notices unless the
    -- Hub says so.
    bounced_at timestamptz,
    bounce_reason text,
    acknowledged_at timestamptz,
    acknowledged_by text,
    constraint handover_batches_direction_known check (direction in ('incoming', 'outgoing', 'other')),
    constraint handover_batches_status_known check (status in ('success', 'error', 'bounced'))
);

create index if not exists handover_batches_company on public.handover_batches (company_id, created_at desc);

-- How a client's own categories map onto the accounts their accountant uses.
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

-- How a document earns its place at the top of the review list.
--
-- The checks a reader writes into documents.validation are named by the rule pack, not by this
-- schema, so they are rows rather than a list inside a view. A client who cares more about a missing
-- invoice number than a failed sum says so by changing a weight, and nothing is deployed.
create table if not exists public.review_score_rules (
    check_key text primary key,
    weight integer not null default 10,
    -- Some checks are pointless below the small-amount threshold, where the law asks for less.
    applies_to_small_amounts boolean not null default true,
    is_active boolean not null default true,
    note text,
    updated_at timestamptz not null default now(),
    constraint review_score_rules_weight_sane check (weight >= 0 and weight <= 100)
);

-- What low confidence adds on top, as two bands rather than a curve nobody can reason about.
create table if not exists public.review_confidence_bands (
    id boolean primary key default true,
    low_below numeric(4, 2) not null default 0.80,
    low_weight integer not null default 3,
    medium_below numeric(4, 2) not null default 0.95,
    medium_weight integer not null default 1,
    -- Which key inside documents.extracted holds the per-field confidences.
    confidence_key text not null default 'confidence',
    updated_at timestamptz not null default now(),
    constraint review_confidence_bands_one_row check (id),
    constraint review_confidence_bands_ordered check (medium_below >= low_below)
);

insert into public.review_confidence_bands (id) values (true) on conflict (id) do nothing;

commit;
