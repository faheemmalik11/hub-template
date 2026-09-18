-- The plain-language explanation behind each entry in invoices.validation, one home of its own
-- instead of buried in the extracted JSONB blob where nothing queries it.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
declare
    existing_type text;
begin
    if to_regclass('public.invoices') is null then
        raise notice 'public.invoices not found — skipping the validation_detail column';
        return;
    end if;

    select data_type into existing_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'validation_detail';

    if existing_type is not null and existing_type <> 'jsonb' then
        raise exception 'public.invoices.validation_detail already exists as % (expected jsonb) — '
            'rename or drop the existing column before rerunning this migration', existing_type;
    end if;

    alter table public.invoices
        add column if not exists validation_detail jsonb;

    comment on column public.invoices.validation_detail is
        'Plain-language explanation per check in the validation column, so a reviewer sees why '
        'without digging through the extracted blob. Written by validation.explain().';
end $$;

insert into public.package_migrations (version)
values ('0007_validation_detail_column')
on conflict (version) do nothing;
