begin;

create table if not exists public.invoice_settings (
    id boolean primary key default true,
    default_vat_rate numeric(5, 2) not null default 19,
    country_code text not null default 'DE',
    invoice_fallback_label text not null default 'Rechnung',
    invoice_unit_name text not null default 'Pauschal',
    default_payment_method text not null default 'Überweisung',
    document_fallback_label text not null default 'Beleg',
    updated_at timestamptz not null default now(),
    updated_by text
);

alter table public.invoice_settings
    drop constraint if exists invoice_settings_one_row,
    drop constraint if exists invoice_settings_default_vat_rate_sane,
    drop constraint if exists invoice_settings_country_code_shape,
    drop constraint if exists invoice_settings_labels_present;

alter table public.invoice_settings
    add constraint invoice_settings_one_row check (id),
    add constraint invoice_settings_default_vat_rate_sane
        check (default_vat_rate >= 0 and default_vat_rate <= 100),
    add constraint invoice_settings_country_code_shape check (country_code ~ '^[A-Z]{2}$'),
    add constraint invoice_settings_labels_present check (
        btrim(invoice_fallback_label) <> ''
        and btrim(invoice_unit_name) <> ''
        and btrim(default_payment_method) <> ''
        and btrim(document_fallback_label) <> '');

create table if not exists public.invoice_kind_labels (
    kind text primary key,
    label text not null,
    updated_at timestamptz not null default now(),
    updated_by text
);

alter table public.invoice_kind_labels
    drop constraint if exists invoice_kind_labels_kind_present,
    drop constraint if exists invoice_kind_labels_label_present;

alter table public.invoice_kind_labels
    add constraint invoice_kind_labels_kind_present check (kind ~ '^[a-z][a-z0-9_]*$'),
    add constraint invoice_kind_labels_label_present check (btrim(label) <> '');

drop trigger if exists invoice_settings_touch on public.invoice_settings;
create trigger invoice_settings_touch before update on public.invoice_settings
    for each row execute function public.set_updated_at();

drop trigger if exists invoice_kind_labels_touch on public.invoice_kind_labels;
create trigger invoice_kind_labels_touch before update on public.invoice_kind_labels
    for each row execute function public.set_updated_at();

insert into public.invoice_settings (id) values (true) on conflict (id) do nothing;

insert into public.invoice_kind_labels (kind, label) values
    ('commission', 'Provision'),
    ('coaching', 'Coaching')
on conflict (kind) do nothing;

alter table public.invoice_settings enable row level security;
alter table public.invoice_kind_labels enable row level security;

drop policy if exists invoice_settings_read on public.invoice_settings;
create policy invoice_settings_read on public.invoice_settings
    for select to authenticated using (public.may_read('documents.read'));

drop policy if exists invoice_settings_write on public.invoice_settings;
create policy invoice_settings_write on public.invoice_settings
    for all to authenticated
    using (public.may_write('settings.manage'))
    with check (public.may_write('settings.manage'));

drop policy if exists invoice_kind_labels_read on public.invoice_kind_labels;
create policy invoice_kind_labels_read on public.invoice_kind_labels
    for select to authenticated using (public.may_read('documents.read'));

drop policy if exists invoice_kind_labels_write on public.invoice_kind_labels;
create policy invoice_kind_labels_write on public.invoice_kind_labels
    for all to authenticated
    using (public.may_write('settings.manage'))
    with check (public.may_write('settings.manage'));

grant select, update on public.invoice_settings to authenticated;
grant select, insert, update, delete on public.invoice_kind_labels to authenticated;

commit;
