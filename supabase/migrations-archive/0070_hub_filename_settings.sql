-- 20260804090000_filename_settings.sql
-- Uniform filename convention (client briefing): "YYYYMMDD COM[_VAT] Issuer Description
-- [Amount] [Property]", e.g. "20260315 IMKO_UST Sanitär Müller Sanitärinstallation 4.850,00
-- KLMUE4.pdf". Requirement: the receipt type must NOT be part of the name (it's implied by the
-- folder), and the naming logic must be admin-configurable, not hardcoded.
--
-- Storage model note: files land in Supabase Storage (bucket belege-files) — see
-- docs/FILE_STORAGE.md. This table drives the human-readable naming convention used both for the
-- Hub's download/preview filename and as the readable part of the Storage object path.
--
-- Singleton table (one naming convention for the whole Hub, not per-company/per-rule) using the
-- classic `id boolean primary key default true check (id)` trick: a second row would need
-- id = false, which the check rejects, so at most one row can ever exist.

begin;

create table if not exists public.filename_settings (
  id boolean primary key default true check (id),
  separator text not null default ' ',
  vat_suffix text not null default 'UST',
  include_vat_suffix boolean not null default true,
  include_amount boolean not null default true,
  include_property boolean not null default true,
  description_source text not null default 'service_description'
    check (description_source in ('service_description', 'cost_category', 'none')),
  transliterate_umlauts boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.filename_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.filename_settings enable row level security;

-- Every authenticated user can read the convention (needed to compute a suggested filename
-- anywhere in the app); only an admin can change it.
drop policy if exists "filename_settings_select" on public.filename_settings;
create policy "filename_settings_select" on public.filename_settings
  for select to authenticated using (true);

drop policy if exists "filename_settings_admin_update" on public.filename_settings;
create policy "filename_settings_admin_update" on public.filename_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually):
--
-- select * from public.filename_settings; -- exactly one row, id = true
-- insert into public.filename_settings (id) values (false); -- must fail the `check (id)` constraint
