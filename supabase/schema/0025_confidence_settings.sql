begin;

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

commit;
