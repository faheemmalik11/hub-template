begin;

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

revoke all on public.document_types from anon;
alter table public.document_types enable row level security;
drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types
    for select to authenticated using (public.may_read('master_data.read'));
drop policy if exists document_types_write on public.document_types;
create policy document_types_write on public.document_types
    for all to authenticated
    using (public.may_write('master_data.write'))
    with check (public.may_write('master_data.write'));

commit;
