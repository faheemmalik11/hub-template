-- The manual SEPA payment file: which account a company pays from, the files built from approved
-- documents, and what went into each one.
--
-- Separate from payment_orders (0006_bank.sql), which is a different mechanism: an order sent
-- straight to a bank provider through its API. This is the opposite shape, a file a person
-- downloads and uploads to their own bank, so it has no provider_* column anywhere.
--
-- Created after 0010_access.sql and 0014_triggers.sql, so its own row level security and its own
-- triggers are written here rather than folded into those files: a fresh apply runs this file last,
-- and a loop over a table name that does not exist yet fails.

begin;

-- A company may pay from more than one account, so this is company_id -> many rows rather than
-- company_id -> one. The one marked is_default is where a new payment file starts out pointed, and
-- the trigger below keeps that column honest: at most one default row per company, and never zero
-- while the company has an active account at all.
create table if not exists public.payment_settings (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id),

    label text not null default 'Main account',
    payer_name text not null,
    payer_iban text not null,
    payer_bic text,

    pain_version text not null default 'pain.001.001.09',
    execution_date_rule text not null default 'as_soon_as_possible',
    batch_booking boolean not null default false,
    max_transfers_per_file integer,
    extra_closing_days date[] not null default '{}',

    is_default boolean not null default true,

    updated_at timestamptz not null default now(),
    updated_by text,
    deleted_at timestamptz,

    constraint payment_settings_pain_version_known
        check (pain_version in ('pain.001.001.02', 'pain.001.001.03', 'pain.001.001.08', 'pain.001.001.09')),
    constraint payment_settings_execution_date_rule_known
        check (execution_date_rule in ('as_soon_as_possible', 'on_due_date'))
);

create index if not exists payment_settings_company on public.payment_settings (company_id);

-- Only one row per company may be the default, and only among the ones still active. A deleted
-- account keeps whatever it last held so the unique index below does not block its replacement.
create unique index if not exists payment_settings_one_default_per_company
    on public.payment_settings (company_id) where is_default and deleted_at is null;

-- A file this Hub built from a set of approved documents, paid from one account. Kept once
-- downloaded even if every item in it later gets discarded some other way, because a client needs
-- to see that it was built and what it said at the time.
create table if not exists public.payment_files (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id),
    payment_settings_id uuid references public.payment_settings(id) on delete set null,

    created_by text,
    created_at timestamptz not null default now(),

    downloaded_at timestamptz,
    download_count integer not null default 0,

    filename text,
    pain_version text,
    total numeric(14, 2) not null default 0,
    item_count integer not null default 0,

    status text not null default 'draft',
    note text,

    constraint payment_files_status_known
        check (status in ('draft', 'generated', 'downloaded', 'discarded'))
);

create index if not exists payment_files_company on public.payment_files (company_id);
create index if not exists payment_files_status on public.payment_files (status) where status != 'discarded';

-- One document queued into one payment file. A document can only sit in one open (non-discarded)
-- file at a time, enforced below, so the same invoice can never end up in two files waiting to be
-- downloaded.
create table if not exists public.payment_file_items (
    id uuid primary key default gen_random_uuid(),
    payment_file_id uuid not null references public.payment_files(id) on delete cascade,
    company_id uuid not null references public.companies(id),
    document_id uuid not null references public.documents(id),

    recipient_name text not null,
    iban text not null,
    bic text,
    amount numeric(14, 2) not null,
    payment_reference text,
    discount_applied boolean not null default false,

    -- Set when this item could not be turned into a transfer: no confirmed account, an invalid
    -- IBAN, a direct debit that must not be transferred again, and so on. One of the sepa engine's
    -- own rejection reasons, kept as plain text so a new reason needs no migration here.
    skipped_reason text,

    created_at timestamptz not null default now(),

    constraint payment_file_items_amount_positive check (amount > 0),
    unique (payment_file_id, document_id)
);

create index if not exists payment_file_items_file on public.payment_file_items (payment_file_id);
create index if not exists payment_file_items_document on public.payment_file_items (document_id);
create index if not exists payment_file_items_company on public.payment_file_items (company_id);

-- The pain.001 XML the engine actually produced for one payment file. A file can split into more
-- than one document when the account settings cap how many transfers go in one message, which is
-- why this is its own table rather than a column on payment_files.
create table if not exists public.payment_file_documents (
    id uuid primary key default gen_random_uuid(),
    payment_file_id uuid not null references public.payment_files(id) on delete cascade,
    company_id uuid not null references public.companies(id),

    file_name text not null,
    message_id text not null,
    content text not null,
    transfer_count integer not null,
    total numeric(14, 2) not null,

    created_at timestamptz not null default now(),

    unique (message_id)
);

create index if not exists payment_file_documents_file on public.payment_file_documents (payment_file_id);
create index if not exists payment_file_documents_company on public.payment_file_documents (company_id);

-- A company's first account becomes its default without anyone ticking a box, and a company left
-- with no default while it still has an active account is a state the deferred check below refuses
-- to let a transaction commit in.
create or replace function public.payment_settings_ensure_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (
        select 1 from public.payment_settings
         where company_id = new.company_id
           and is_default
           and deleted_at is null
           and id != new.id
    ) then
        new.is_default := true;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_payment_settings_ensure_default on public.payment_settings;
create trigger trg_payment_settings_ensure_default
    before insert on public.payment_settings
    for each row execute function public.payment_settings_ensure_default();

-- Promoting the next account runs AFTER the soft delete, not before: a BEFORE trigger racing the
-- partial unique index above would try to set the new default default while the old one still held
-- it, and the index would refuse the row that was supposed to replace it.
create or replace function public.payment_settings_promote_next_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_next uuid;
begin
    if new.deleted_at is not null and old.deleted_at is null and old.is_default then
        update public.payment_settings set is_default = false where id = new.id;

        select id into v_next
          from public.payment_settings
         where company_id = new.company_id
           and deleted_at is null
           and id != new.id
         order by updated_at desc
         limit 1;

        if v_next is not null then
            update public.payment_settings set is_default = true where id = v_next;
        end if;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_payment_settings_promote_next_default on public.payment_settings;
create trigger trg_payment_settings_promote_next_default
    after update on public.payment_settings
    for each row execute function public.payment_settings_promote_next_default();

-- The one way to switch a company's default account deliberately, checked the same way every other
-- write to this table is: company access plus the payments capability.
create or replace function public.set_default_payment_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company_id uuid;
begin
    select company_id into v_company_id
      from public.payment_settings
     where id = p_account_id and deleted_at is null;

    if v_company_id is null then
        raise exception 'payment account % not found', p_account_id;
    end if;
    if not public.has_company_access(v_company_id) or not public.may_write('payments.write') then
        raise exception 'insufficient permission';
    end if;

    update public.payment_settings set is_default = false
     where company_id = v_company_id and id != p_account_id and is_default;
    update public.payment_settings set is_default = true
     where id = p_account_id;
end;
$$;

revoke execute on function public.set_default_payment_account(uuid) from public, anon;
grant execute on function public.set_default_payment_account(uuid) to authenticated;

-- The invariant the two triggers above exist to keep: at the end of any transaction that touched
-- this table, a company has exactly one default account among its active ones, or none at all if it
-- has no active account left. Deferred to commit time because a switch is two updates (clear the
-- old one, set the new one) and the row count is briefly wrong between them.
create or replace function public.payment_settings_check_exactly_one_default()
returns trigger
language plpgsql
as $$
declare
    v_company_id uuid := coalesce(new.company_id, old.company_id);
    v_default_count integer;
    v_active_count integer;
begin
    select count(*) into v_default_count
      from public.payment_settings
     where company_id = v_company_id and is_default and deleted_at is null;

    select count(*) into v_active_count
      from public.payment_settings
     where company_id = v_company_id and deleted_at is null;

    if v_default_count > 1 then
        raise exception 'company % ended the transaction with % default payment accounts', v_company_id, v_default_count;
    end if;
    if v_default_count = 0 and v_active_count > 0 then
        raise exception 'company % has % active payment account(s) but none marked default', v_company_id, v_active_count;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_payment_settings_check_exactly_one_default on public.payment_settings;
create constraint trigger trg_payment_settings_check_exactly_one_default
    after insert or update or delete on public.payment_settings
    deferrable initially deferred
    for each row execute function public.payment_settings_check_exactly_one_default();

-- A payment_file_items row never states its own company: it inherits the one its payment file was
-- raised for, so a caller cannot slip a document into another company's file by naming a different
-- company_id at insert time.
create or replace function public.payment_file_item_set_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    select company_id into strict new.company_id
      from public.payment_files where id = new.payment_file_id;
    return new;
end;
$$;

drop trigger if exists trg_payment_file_item_set_company on public.payment_file_items;
create trigger trg_payment_file_item_set_company
    before insert on public.payment_file_items
    for each row execute function public.payment_file_item_set_company();

-- The same document must never sit in two files that are both still open, so a person cannot build
-- two payment files from one invoice and pay it twice.
create or replace function public.payment_file_item_prevent_double_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if exists (
        select 1
          from public.payment_file_items pfi
          join public.payment_files pf on pf.id = pfi.payment_file_id
         where pfi.document_id = new.document_id
           and pfi.payment_file_id != new.payment_file_id
           and pf.status != 'discarded'
    ) then
        raise exception 'document % is already queued in an open payment file', new.document_id
            using errcode = 'unique_violation';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_payment_file_item_prevent_double_queue on public.payment_file_items;
create trigger trg_payment_file_item_prevent_double_queue
    before insert on public.payment_file_items
    for each row execute function public.payment_file_item_prevent_double_queue();

create or replace function public.payment_file_document_set_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    select company_id into strict new.company_id
      from public.payment_files where id = new.payment_file_id;
    return new;
end;
$$;

drop trigger if exists trg_payment_file_document_set_company on public.payment_file_documents;
create trigger trg_payment_file_document_set_company
    before insert on public.payment_file_documents
    for each row execute function public.payment_file_document_set_company();

-- Row level security, written out directly rather than through the generic loop in 0010_access.sql:
-- that file runs before this one, so a loop there over a table this file creates would fail on a
-- fresh apply. Same contract as every other table in that loop: the payments.write capability for
-- read and write, has_company_access as an additional restrictive filter.
alter table public.payment_settings enable row level security;
alter table public.payment_files enable row level security;
alter table public.payment_file_items enable row level security;
alter table public.payment_file_documents enable row level security;

do $$
declare
    t text;
begin
    foreach t in array array[
        'payment_settings', 'payment_files', 'payment_file_items', 'payment_file_documents'
    ] loop
        execute format('drop policy if exists %I on public.%I', t || '_read', t);
        execute format(
            'create policy %I on public.%I for select to authenticated using (public.may_read(%L))',
            t || '_read', t, 'payments.write');

        execute format('drop policy if exists %I on public.%I', t || '_write', t);
        execute format(
            'create policy %I on public.%I for all to authenticated using (public.may_write(%L)) with check (public.may_write(%L))',
            t || '_write', t, 'payments.write', 'payments.write');

        execute format('drop policy if exists %I on public.%I', t || '_company_scope', t);
        execute format(
            'create policy %I on public.%I as restrictive for all to authenticated using (public.has_company_access(company_id)) with check (public.has_company_access(company_id))',
            t || '_company_scope', t);
    end loop;
end
$$;

commit;
