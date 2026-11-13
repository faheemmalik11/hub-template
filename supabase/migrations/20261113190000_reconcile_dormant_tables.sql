begin;

create or replace function public.company_demo_visible(p_company_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case when public.practice_mode_active()
              then exists (
                  select 1 from public.companies c
                   where c.id = p_company_id and c.is_demo
                     and c.demo_owner_user_id = public.current_app_user_id()
              )
              else not exists (
                  select 1 from public.companies c where c.id = p_company_id and c.is_demo
              )
         end;
$$;

revoke execute on function public.company_demo_visible(uuid) from public, anon;
grant execute on function public.company_demo_visible(uuid) to authenticated;

create or replace function public.tenant_locale_settings() returns jsonb
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'locale' from public.tenant_settings where single_row),
        '{"dateFormat": "dd.MM.yyyy", "decimalSeparator": ",", "currency": "EUR"}'::jsonb
    )
$$;

create or replace function public.tenant_tax_regime() returns jsonb
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'tax' from public.tenant_settings where single_row),
        '{"country": "DE", "defaultVatRate": 19, "taxModel": "flat"}'::jsonb
    )
$$;

create or replace function public.tenant_banking_provider() returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'banking' ->> 'provider' from public.tenant_settings where single_row),
        'banksapi'
    )
$$;

create or replace function public.tenant_card_provider() returns text
    language sql stable security definer
    set search_path to 'public'
    as $$
    select coalesce(
        (select config -> 'cards' ->> 'provider' from public.tenant_settings where single_row),
        'pleo'
    )
$$;

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

create unique index if not exists payment_settings_one_default_per_company
    on public.payment_settings (company_id) where is_default and deleted_at is null;

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

    skipped_reason text,

    created_at timestamptz not null default now(),

    constraint payment_file_items_amount_positive check (amount > 0),
    unique (payment_file_id, document_id)
);

create index if not exists payment_file_items_file on public.payment_file_items (payment_file_id);
create index if not exists payment_file_items_document on public.payment_file_items (document_id);
create index if not exists payment_file_items_company on public.payment_file_items (company_id);

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

        execute format('drop policy if exists %I on public.%I', t || '_demo_owner', t);
        execute format(
            'create policy %I on public.%I as restrictive for all to authenticated '
            || 'using (public.company_demo_visible(company_id)) '
            || 'with check (public.company_demo_visible(company_id))',
            t || '_demo_owner', t);
    end loop;
end
$$;

create table if not exists public.client_error_log (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  message     text not null,
  stack       text,
  route       text,
  boundary    text,
  user_id     uuid references auth.users(id) on delete set null
);

create index if not exists client_error_log_occurred_at_idx
  on public.client_error_log (occurred_at desc);

alter table public.client_error_log enable row level security;

drop policy if exists "client_error_log_insert" on public.client_error_log;
create policy "client_error_log_insert" on public.client_error_log
  for insert to authenticated with check (true);

drop policy if exists "client_error_log_select" on public.client_error_log;
create policy "client_error_log_select" on public.client_error_log
  for select to authenticated using (public.is_admin());

create table if not exists public.confidence_settings (
    id boolean primary key default true check (id),
    ampel_green_min numeric not null default 0.95
        check (ampel_green_min > 0 and ampel_green_min <= 1),
    ampel_yellow_min numeric not null default 0.80
        check (ampel_yellow_min > 0 and ampel_yellow_min <= 1),
    relevance_min_konfidenz numeric not null default 0.5
        check (relevance_min_konfidenz > 0 and relevance_min_konfidenz <= 1),
    relevance_noninvoice_max_konfidenz numeric not null default 0.3
        check (relevance_noninvoice_max_konfidenz > 0 and relevance_noninvoice_max_konfidenz <= 1),
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint confidence_settings_bands_ordered
        check (ampel_green_min >= ampel_yellow_min and ampel_yellow_min >= relevance_min_konfidenz)
);

insert into public.confidence_settings (id) values (true) on conflict (id) do nothing;

alter table public.confidence_settings enable row level security;

drop policy if exists confidence_settings_read on public.confidence_settings;
create policy confidence_settings_read on public.confidence_settings
    for select to authenticated using (public.may_read('documents.read'));

drop policy if exists confidence_settings_write on public.confidence_settings;
create policy confidence_settings_write on public.confidence_settings
    for all to authenticated
    using (public.may_write('settings.manage'))
    with check (public.may_write('settings.manage'));

create table if not exists public.document_types (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    label text not null,
    description text,
    maps_from text[] not null default '{}',
    is_fallback boolean not null default false,
    is_active boolean not null default true,
    is_seeded boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists document_types_one_active_fallback
    on public.document_types ((true))
    where is_fallback and is_active;

create unique index if not exists document_types_code_active_uniq
    on public.document_types (lower(code))
    where is_active;

create or replace function public.document_type_canonical(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when btrim(coalesce(p_value, '')) = '' then null
           else regexp_replace(lower(btrim(p_value)), '\s+', '_', 'g')
         end;
$$;

comment on function public.document_type_canonical(text) is
  'Trimmed, lowercased spelling of a document type with whitespace folded to underscores.';

revoke all on function public.document_type_canonical(text) from public;
grant execute on function public.document_type_canonical(text) to authenticated;

drop view if exists public.v_document_intake_log;

create view public.v_document_intake_log with (security_invoker = true) as
select
    d.id,
    d.invoice_number,
    d.created_at,
    d.issuer,
    d.service_description,
    d.document_type,
    d.company_code,
    d.intake_channel,
    d.fts,
    case
        when exists (
            select 1 from public.document_files f
             where f.document_id = d.id
               and f.source = 'sharepoint'
               and f.deleted_at is null
        ) then 'filed'
        when d.handed_over_at is not null or d.workflow_status = 'uebergeben_datev' then 'handed_over'
        when d.not_relevant_at is not null then 'not_relevant'
        when d.archived_at is not null then 'archived'
        when d.workflow_status in (
            'approved_first', 'approved_final', 'paid', 'closed',
            'freigegeben_assistenz', 'freigegeben_vorgesetzter', 'bezahlt', 'abgeschlossen'
        ) then 'approved'
        when d.workflow_status in ('in_review', 'query', 'in_pruefung', 'rueckfrage') then 'in_review'
        when d.status in ('recognised', 'erkannt') then 'recognised'
        else 'open'
    end as outcome
from public.documents d
where d.deleted_at is null;

comment on view public.v_document_intake_log is
    'Everything that arrived, with what became of it. Feeds the intake log screen, which answers '
    '"what came in" rather than "what is there to work on", so archived, not relevant and already '
    'filed documents stay visible instead of being hidden the way the document list hides them.';

grant select on public.v_document_intake_log to authenticated;

create or replace function public.seed_payment_file_practice_data() returns uuid[]
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_tag text;
  v_company_id uuid;
  v_supplier_id uuid;
  v_bank_account_id uuid;
  v_document_id uuid;
begin
  if v_user_id is null then
    raise exception 'seed_payment_file_practice_data: no signed-in app user';
  end if;

  v_tag := substr(replace(v_user_id::text, '-', ''), 1, 8);

  select id into v_company_id from public.companies
   where is_demo and demo_owner_user_id = v_user_id and code = 'DEMO-' || v_tag;
  if v_company_id is null then
    raise exception 'seed_payment_file_practice_data: no demo company for user %, seedPracticeData should have run first', v_user_id;
  end if;

  select id into v_supplier_id from public.suppliers
   where is_demo and demo_owner_user_id = v_user_id and name = 'Dachdecker Brandt';
  if v_supplier_id is not null then
    update public.suppliers set deleted_at = null where id = v_supplier_id and deleted_at is not null;
  else
    insert into public.suppliers (name, is_demo, demo_owner_user_id)
    values ('Dachdecker Brandt', true, v_user_id)
    returning id into v_supplier_id;
  end if;

  select id into v_bank_account_id from public.supplier_bank_accounts
   where supplier_id = v_supplier_id and iban = 'DE89370400440532013000';
  if v_bank_account_id is not null then
    update public.supplier_bank_accounts
       set deleted_at = null, is_active = true, is_payable = true,
           confirmed_at = coalesce(confirmed_at, now())
     where id = v_bank_account_id;
  else
    insert into public.supplier_bank_accounts (
      supplier_id, iban, bic, source, is_active, is_payable, confirmed_at
    )
    values (
      v_supplier_id, 'DE89370400440532013000', 'COBADEFFXXX', 'human', true, true, now()
    )
    returning id into v_bank_account_id;
  end if;

  select id into v_document_id from public.documents
   where is_demo and demo_owner_user_id = v_user_id
     and payment_reference = 'BRANDT RE 2026-2201 890,00';
  if v_document_id is not null then
    update public.documents
       set deleted_at = null, company_id = v_company_id, supplier_id = v_supplier_id,
           workflow_status = 'approved_final', paid_at = null,
           due_date = current_date + 4
     where id = v_document_id;
  else
    insert into public.documents (
      issuer, supplier_id, invoice_number, document_date, due_date,
      amount_net, vat_rate, vat_amount, amount_gross, currency,
      payment_reference, payment_method, workflow_status,
      company_id, is_invoice, is_demo, demo_owner_user_id
    )
    values (
      'Dachdecker Brandt', v_supplier_id, 'RE-2026-2201', current_date - 10, current_date + 4,
      747.90, 19, 142.10, 890.00, 'EUR',
      'BRANDT RE 2026-2201 890,00', 'transfer', 'approved_final',
      v_company_id, true, true, v_user_id
    )
    returning id into v_document_id;
  end if;

  insert into public.document_bank_accounts (document_id, supplier_bank_account_id, position)
  select v_document_id, v_bank_account_id, 1
   where not exists (
     select 1 from public.document_bank_accounts
      where document_id = v_document_id and supplier_bank_account_id = v_bank_account_id
   );

  if not exists (select 1 from public.payment_settings where company_id = v_company_id) then
    insert into public.payment_settings (company_id, label, payer_name, payer_iban, is_default)
    values (v_company_id, 'Demo-Geschäftskonto', 'Demo Immobilien GmbH', 'DE02500105174917781216', true);
  end if;

  update public.payment_files f
     set status = 'discarded'
    from public.payment_file_items i
   where i.payment_file_id = f.id
     and i.document_id = v_document_id
     and f.status <> 'discarded';

  return array[v_document_id];
end $$;

revoke execute on function public.seed_payment_file_practice_data() from public, anon;
grant execute on function public.seed_payment_file_practice_data() to authenticated;

commit;

do $$
declare
  v_missing text[] := '{}';
  t text;
begin
  foreach t in array array[
    'payment_settings', 'payment_files', 'payment_file_items', 'payment_file_documents',
    'client_error_log', 'confidence_settings', 'document_types', 'v_document_intake_log'
  ] loop
    if to_regclass('public.' || t) is null then
      v_missing := v_missing || t;
    end if;
  end loop;

  foreach t in array array[
    'company_demo_visible', 'tenant_locale_settings', 'tenant_tax_regime',
    'tenant_banking_provider', 'tenant_card_provider', 'payment_settings_ensure_default',
    'payment_settings_promote_next_default', 'payment_settings_check_exactly_one_default',
    'set_default_payment_account', 'payment_file_item_set_company',
    'payment_file_item_prevent_double_queue', 'payment_file_document_set_company',
    'document_type_canonical', 'seed_payment_file_practice_data'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = t
    ) then
      v_missing := v_missing || t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.v_document_intake_log'::regclass
       and c.reloptions @> array['security_invoker=true']
  ) then
    v_missing := v_missing || 'v_document_intake_log security_invoker';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'reconcile_dormant_tables self-check failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;
