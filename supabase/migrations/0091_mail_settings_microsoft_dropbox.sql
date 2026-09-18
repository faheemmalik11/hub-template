-- 0091_mail_settings_microsoft_dropbox.sql
-- Replace the google-only mail_settings row(s) with the providers Stäy's own pipeline_new
-- actually runs (main.py's WIRING): MAILBOX_PROVIDER=graph (Microsoft, accounting@staey.de) and
-- DRIVE_PROVIDER=dropbox (the StaeyBelege app folder). Gmail/Google Drive are not used anywhere in
-- Stäy's stack — 0026 built this table provider-generic for exactly this kind of swap, and 0044's
-- removal of 'microsoft' was a product decision for the *previous* client context, not a schema
-- limitation.
--
-- Kept from 0026/0044: one row per provider (not one row per row-owns-everything), a real `provider`
-- CHECK constraint (an external pipeline still queries by provider — now pipeline_new's
-- adapters/repo/mail_config.py / channels.py, not the old ai-mail-extraction repo), and column
-- reuse (mail_* / drive_* stay generic "opaque provider identifier" columns).
--
-- New wrinkle 0026/0044 didn't have: Stäy's mailbox and filing channels are TWO DIFFERENT
-- providers (Graph for mail, Dropbox for drive), not one provider doing both like Google did. So
-- the 'microsoft' row only ever uses mail_*  (its drive_* columns stay at their defaults, unused)
-- and the 'dropbox' row only ever uses drive_* (its mail_* columns stay at their defaults, unused).
-- pipeline_new's channels.py currently resolves both channels off a SINGLE provider row (ported
-- from the old google-only assumption) — it needs a matching update to look up 'microsoft' for the
-- mailbox channel and 'dropbox' for the scan_folder channel instead. Tracked in
-- docs/POSTFACH_ABLAGE.md; not done as part of this migration (pipeline-repo work).

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'mail_settings'
  ) then
    raise exception '0091 preconditions failed: table mail_settings is missing';
  end if;
  raise notice '0091 preconditions ok';
end $$;

delete from public.mail_settings where provider = 'google';

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.mail_settings'::regclass
       and conname = 'mail_settings_provider_check'
  ) then
    alter table public.mail_settings drop constraint mail_settings_provider_check;
  end if;
  alter table public.mail_settings
    add constraint mail_settings_provider_check check (provider in ('microsoft', 'dropbox'));
end $$;

-- Both rows always exist, same reasoning as 0026: the Hub can present them side by side without
-- creating anything first, and pipeline_new can read either one without a null check.
insert into public.mail_settings (provider, is_active) values ('microsoft', false), ('dropbox', false)
  on conflict (provider) do nothing;

comment on column public.mail_settings.provider is
  'microsoft (Graph mailbox, accounting@staey.de) or dropbox (StaeyBelege app folder). Exactly one '
  'row per provider. The microsoft row only uses the mail_* columns; the dropbox row only uses the '
  'drive_* columns — each provider here only serves one of the two channels, unlike the old '
  'google row which served both.';
comment on column public.mail_settings.mail_source_folders is
  'Opaque provider ids read as a source. Microsoft: Graph mailFolder id. Unused for provider=dropbox.';
comment on column public.mail_settings.mail_processed_folder is
  'Opaque provider id. Microsoft: Graph mailFolder id, or the well-known name "inbox". Unused for '
  'provider=dropbox.';
comment on column public.mail_settings.drive_source_folders is
  'Opaque provider ids read as a source. Dropbox: a path string (e.g. "/Rechnungen"), not an '
  'internal Dropbox file id — pipeline_new''s DRIVE_SOURCE_FOLDER_ID is path-based. Unused for '
  'provider=microsoft.';
comment on column public.mail_settings.drive_processed_folder is
  'Opaque provider id. Dropbox: a path string. Unused for provider=microsoft.';

do $$
declare v_n int;
begin
  select count(*) into v_n from public.mail_settings;
  raise notice 'mail_settings has % provider row(s)', v_n;
end $$;

commit;
