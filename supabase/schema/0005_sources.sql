-- Where documents come in from, what has already been read, and what each run cost.
--
-- A source is a row, never a column: two mailboxes and a drive are three rows of the same shape.
-- The provider is a name the edge resolves, so nothing here knows one provider from another.
--
-- The legacy single-row mail_settings table is deliberately absent. Its folder configuration is a
-- channel with folders, which is what every new client uses.

begin;

create table if not exists public.channels (
    key text primary key,
    -- What sort of source: a mailbox, a folder, a portal. A name, resolved outside the database.
    kind text not null,
    -- Which service serves it. Also a name.
    provider text not null,
    enabled boolean not null default true,
    connection_id text,
    provider_ref text,
    settings jsonb not null default '{}'::jsonb,
    position integer not null default 100,
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint channels_kind_not_blank check (length(btrim(kind)) > 0),
    constraint channels_provider_not_blank check (length(btrim(provider)) > 0),
    constraint channels_settings_is_object check (jsonb_typeof(settings) = 'object')
);

-- Which folders this source reads, and which it moves a handled item into. Role says which is which.
create table if not exists public.channel_folders (
    id uuid primary key default gen_random_uuid(),
    channel_key text not null references public.channels(key) on delete cascade,
    -- Whose folders these are, for a source that can read more than one account.
    identity text not null default '',
    role text not null,
    external_id text not null,
    display_name text,
    -- A folder the provider names itself, such as an inbox, as opposed to one somebody picked.
    well_known_name text,
    position integer not null default 100,
    added_at timestamptz not null default now(),
    added_by text,
    constraint channel_folders_role_not_blank check (length(btrim(role)) > 0),
    constraint channel_folders_external_id_not_blank check (length(btrim(external_id)) > 0)
);

create unique index if not exists channel_folders_unique
    on public.channel_folders (channel_key, identity, role, external_id);

create table if not exists public.channel_state (
    channel_key text primary key references public.channels(key) on delete cascade,
    last_check timestamptz,
    checked_at timestamptz
);

-- A source's own keys, sealed before they arrive here. The database never sees a plain value, and
-- nothing in the app reads one back: a value goes out only through an audited reveal.
-- `channel_key` is '' for a credential the whole client uses rather than one source: the model key,
-- the file store. That is the pipeline's own convention, so there is no foreign key here; a key
-- belonging to nothing would have nothing to point at. The trigger below does the cascade instead.
create table if not exists public.credentials (
    channel_key text not null default '',
    name text not null check (length(btrim(name)) > 0),
    value text not null,
    updated_at timestamptz not null default now(),
    updated_by text,
    primary key (channel_key, name)
);

create or replace function public.forget_credentials_of_removed_channel() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
    delete from public.credentials where channel_key = old.key;
    return old;
end;
$$;

drop trigger if exists channels_forget_credentials on public.channels;
create trigger channels_forget_credentials
    after delete on public.channels
    for each row execute function public.forget_credentials_of_removed_channel();

create table if not exists public.credential_reads (
    id bigserial primary key,
    channel_key text,
    credential text not null,
    read_at timestamptz not null default now(),
    read_by text
);

-- How far each folder has been read. Keeping this per folder is what lets one folder fail without
-- holding up the rest.
create table if not exists public.read_cursors (
    channel_key text not null references public.channels(key) on delete cascade,
    identity text not null default '',
    folder_id text not null,
    scope text not null default '',
    bookmark text,
    synced_at timestamptz not null default now(),
    primary key (channel_key, identity, folder_id, scope)
);

-- Everything seen, whether or not it became a document. This is what stops the same item being read
-- twice, and what lets a permanently broken one retire instead of returning every run.
-- `id` is carried for the pipeline, which names a row by it. The key stays the pair, because that
-- pair is what makes reading the same item twice harmless.
create table if not exists public.imported_items (
    id uuid not null default gen_random_uuid(),
    source_item_id text not null,
    attachment_id text not null default '',
    document_id uuid references public.documents(id) on delete set null,
    status text,
    content_hash text,
    content_anchor text,
    imported_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    primary key (source_item_id, attachment_id)
);

create index if not exists imported_items_document on public.imported_items (document_id);
create index if not exists imported_items_content_hash on public.imported_items (content_hash);

create table if not exists public.pipeline_runs (
    id uuid primary key default gen_random_uuid(),
    source text,
    status text,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    trigger text,
    request_id uuid,
    processed_count integer not null default 0,
    error_count integer not null default 0,
    filed_count integer,
    skipped_count integer,
    duplicate_count integer,
    discarded_count integer,
    relinked_count integer,

    -- Which folders a run got through, and which it did not, so a partial run says where it stopped.
    folders_read text[],
    folders_skipped jsonb,
    folders_left_unfinished text[],

    ai_calls integer not null default 0,
    llm_model text,
    input_tokens integer,
    cached_input_tokens integer,
    output_tokens integer,
    ai_cost numeric(12, 6),
    note text,
    notes text[]
);

-- One line per item a run touched, including the ones it decided not to keep, with the reason.
create table if not exists public.processing_log (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references public.pipeline_runs(id) on delete set null,
    document_id uuid references public.documents(id) on delete set null,
    source_item_id text,
    subject text,
    sender text,
    body text,
    attachment_name text,
    source text,
    folder text,
    status text,
    reason text,
    sent_at timestamptz,
    processed_at timestamptz not null default now(),
    input_tokens integer,
    output_tokens integer,
    ai_cost numeric(12, 6)
);

create index if not exists processing_log_run on public.processing_log (run_id);
create index if not exists processing_log_document on public.processing_log (document_id);

-- What every model call was for, and what it cost. Priced from a rate somebody entered, never
-- guessed, so a total can be explained.
create table if not exists public.ai_usage (
    id uuid primary key default gen_random_uuid(),
    document_id uuid references public.documents(id) on delete set null,
    run_id uuid references public.pipeline_runs(id) on delete set null,
    kind text not null,
    model text,
    input_tokens integer not null default 0,
    cached_input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    cost numeric(12, 6),
    created_at timestamptz not null default now()
);

create index if not exists ai_usage_document on public.ai_usage (document_id);
create index if not exists ai_usage_run on public.ai_usage (run_id);

-- What should never become a document: a newsletter sender, a subject line, a party.
create table if not exists public.ingest_exclusions (
    id uuid primary key default gen_random_uuid(),
    term text not null,
    -- Which part of an item the term is matched against.
    scope text not null default 'sender',
    is_active boolean not null default true,
    note text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    deleted_by text,
    delete_reason text,
    constraint ingest_exclusions_scope_known check (scope in (
        'party', 'sender', 'subject', 'filename', 'envelope', 'body',
        'company', 'property', 'supplier'))
);

-- Where a filed copy lands once a document reaches a given state.
create table if not exists public.filing_placements (
    id uuid primary key default gen_random_uuid(),
    channel text not null,
    workflow_status text not null,
    folder_id text not null,
    folder_label text,
    -- A copy may be filed into a folder per month, but only where the target is a fixed folder.
    month_partition boolean not null default false,
    -- Whether the folder is chosen by the document's company, its property, or neither.
    routing text not null default 'fixed',
    is_active boolean not null default true,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint filing_placements_routing_known check (routing in ('fixed', 'company', 'property')),
    constraint filing_placements_month_needs_fixed check (routing = 'fixed' or not month_partition),
    constraint filing_placements_status_known check (workflow_status in (
        'received', 'in_review', 'query', 'approved_first', 'approved_final',
        'paid', 'handed_over', 'closed', 'rejected', 'not_relevant'))
);

-- How a filed copy is named. Every part is a choice, because every client names differently.
create table if not exists public.filename_settings (
    id boolean primary key default true,
    separator text not null default ' ',
    include_amount boolean not null default true,
    include_property boolean not null default false,
    include_vat_suffix boolean not null default false,
    vat_suffix text not null default '',
    description_source text not null default 'service_description',
    -- Whether letters outside a-z are spelled out, for a drive that dislikes them.
    transliterate_accents boolean not null default true,
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint filename_settings_one_row check (id),
    constraint filename_settings_description_source_known
        check (description_source in ('service_description', 'cost_category', 'none'))
);

-- What this client's pipeline is configured to do, and the keys it needs, as one row.
--
-- The panel writes it, the pipeline reads it, and the Hub shows parts of it. Secrets are sealed
-- before they arrive, so a plain value is never stored here and never returned to a screen.
create table if not exists public.tenant_settings (
    single_row boolean primary key default true,
    config jsonb not null default '{}'::jsonb,
    secrets jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint tenant_settings_one_row check (single_row),
    constraint tenant_settings_config_is_object check (jsonb_typeof(config) = 'object'),
    constraint tenant_settings_secrets_is_object check (jsonb_typeof(secrets) = 'object')
);

create table if not exists public.tenant_settings_history (
    id bigserial primary key,
    config jsonb not null,
    changed_at timestamptz not null default now(),
    changed_by text,
    operation text
);

create index if not exists tenant_settings_history_changed
    on public.tenant_settings_history (changed_at desc);

-- A save that changed nothing must not fill the trail; a reviewer needs the real edits.
create or replace function public.tenant_settings_audit() returns trigger
language plpgsql set search_path to 'public'
as $$
begin
    if tg_op = 'UPDATE' and new.config is not distinct from old.config then
        return new;
    end if;
    insert into public.tenant_settings_history (config, changed_by, operation)
    values (old.config, old.updated_by, lower(tg_op));
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists tenant_settings_audit on public.tenant_settings;
create trigger tenant_settings_audit before update or delete on public.tenant_settings
    for each row execute function public.tenant_settings_audit();

-- The one row each of these tables is meant to hold, with everything at its default. A screen that
-- asks for THE settings row must find one.
insert into public.filename_settings (id) values (true) on conflict (id) do nothing;
insert into public.tenant_settings (single_row) values (true) on conflict (single_row) do nothing;


create index if not exists credential_reads_read_idx on public.credential_reads (read_at desc);

-- The pipeline's own copy of this index is not partial. Here it has to be: a term withdrawn is
-- soft deleted rather than removed, and a plain unique index would refuse to add it back.
create unique index if not exists ingest_exclusions_term_scope_uniq
    on public.ingest_exclusions (lower(term), scope)
    where deleted_at is null;



commit;
