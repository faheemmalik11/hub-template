-- 0026_mail_settings_per_provider.sql
-- Rework `mail_settings` (added in 0025) so folders are held PER PROVIDER, and so mail and Drive
-- each have their own source and destination.
--
-- Why. 0025 modelled this as a single row with one set of folders plus a `provider` column, which
-- silently assumed one provider at a time and one shared set of folders. That is wrong: Google and
-- Microsoft have completely separate folder identifiers, for mail AND for Drive, so switching
-- provider on the old shape would have meant retyping every folder and losing the other one. It also
-- had only `drive_folders` (sources) with no Drive destination, even though a corrected receipt has
-- to be filed to a Drive target as well (Briefing A8: "must rename and move the Drive file along
-- with it").
--
-- New shape: one row per provider, keyed by the provider name, with mail and Drive kept apart.
-- Adding a third provider later is one INSERT rather than another migration.
--
-- Naming: the columns say `..._source_...` and `..._processed_...` rather than "label" or "folder id",
-- because the same column holds a Gmail label id for Google and a Graph mailFolder id for Microsoft.
-- They are opaque provider identifiers either way, never display names.

begin;

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'mail_settings'
  ) then
    raise exception 'migration 0026 expects mail_settings from migration 0025, which is missing';
  end if;
  raise notice '0026 preconditions ok';
end $$;

-- ---------------------------------------------------------------------------
-- Rebuild, carrying the old single row over as the Google row
-- ---------------------------------------------------------------------------
-- The old table is a singleton keyed on a boolean, so the primary key itself has to change. The old
-- row is set aside, the table is rebuilt, and the values are put back under the provider they
-- actually belonged to. 0025 only ever seeded defaults, so in practice there is nothing but defaults
-- to carry, but doing it this way means a database where someone already filled in the screen does
-- not lose the entry.
--
-- Guarded on the shape rather than run blindly. Re-running the rebuild against an already-migrated
-- table would look for `watched_labels` on the new shape and fail, so a second `db push` (or a repo
-- that reapplies migrations) has to fall straight through to the row and policy checks at the end.
-- Everything that references the OLD column names goes through EXECUTE, because plain SQL in a
-- PL/pgSQL block is parsed up front and would reject those names on the already-migrated shape.
do $$
declare
  v_already boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'mail_settings'
       and column_name = 'mail_source_folders'
  ) into v_already;

  if v_already then
    raise notice 'mail_settings is already per-provider, skipping the rebuild';
    return;
  end if;

  raise notice 'rebuilding mail_settings per provider, carrying the existing row over to google';

  execute 'create table public.mail_settings_pre_0026 as select * from public.mail_settings';
  execute 'drop table public.mail_settings';
  execute $ddl$
create table if not exists public.mail_settings (
  -- The provider IS the key. One row per provider, so both can be configured side by side and
  -- neither one's folders can overwrite the other's.
  provider text primary key check (provider in ('google', 'microsoft')),

  -- Whether the pipeline should read this provider at all. Independent per row: a client may run
  -- both, and leaving it per row means enabling Microsoft later does not require disabling Google.
  is_active boolean not null default false,

  mailbox_address text,

  -- ---- Mail ----
  -- Folders that are read. Empty means the whole inbox.
  mail_source_folders text[] not null default array[]::text[],
  -- Where processed mail is moved to, so the inbox shows only what is still open.
  mail_processed_folder text,
  -- Where a "not relevant" receipt is handed back to. INBOX is Gmail's own id for the inbox and
  -- Graph accepts 'inbox' as a well-known name, so the default is meaningful for both.
  mail_return_folder text not null default 'INBOX',
  -- Moving mail is a write on the real mailbox, so it stays off until switched on deliberately.
  -- Otherwise mail disappears from under the bookkeeper.
  mail_move_processed boolean not null default false,

  -- ---- Drive / file storage ----
  -- Additional folders searched as a receipt source; some receipts sit there instead of in mail.
  drive_source_folders text[] not null default array[]::text[],
  -- Where a processed file is filed. Separate from the mail destination: they are different systems
  -- with different identifiers, and on Microsoft they are different products entirely.
  drive_processed_folder text,
  drive_move_processed boolean not null default false,

  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
  $ddl$;

  -- Carry the old values over onto Google. Column names differ, so this is an explicit mapping
  -- rather than a wildcard copy, and it runs through EXECUTE because the old column names do not
  -- exist on an already-migrated database.
  execute $carry$
    insert into public.mail_settings (provider, is_active) values ('google', true)
      on conflict (provider) do nothing;
    update public.mail_settings m
       set mailbox_address       = coalesce(o.mailbox_address, m.mailbox_address),
           mail_source_folders   = coalesce(o.watched_labels, m.mail_source_folders),
           mail_processed_folder = coalesce(o.processed_label, m.mail_processed_folder),
           mail_return_folder    = coalesce(o.return_label, m.mail_return_folder),
           mail_move_processed   = coalesce(o.move_processed_enabled, m.mail_move_processed),
           drive_source_folders  = coalesce(o.drive_folders, m.drive_source_folders),
           updated_by            = o.updated_by,
           updated_at            = now()
      from public.mail_settings_pre_0026 o
     where m.provider = 'google';
  $carry$;

  -- The pre-migration copy has served its purpose. Dropped rather than left behind, so nobody finds
  -- a stale settings table later and wonders which one is real.
  execute 'drop table public.mail_settings_pre_0026';
end $$;

comment on table public.mail_settings is
  'Mail and Drive intake configuration, one row per provider (Briefing Screen 1). Read by the '
  'external ingestion pipeline; the Hub only edits it. Folder columns hold opaque provider ids '
  '(Gmail label id / Graph folder id), never display names.';
comment on column public.mail_settings.mail_move_processed is
  'Moving mail is a write on the real mailbox. Off by default so it is switched on deliberately.';
comment on column public.mail_settings.drive_processed_folder is
  'Drive filing target, deliberately separate from the mail destination: different system, '
  'different identifiers.';

-- Both providers always exist as rows, so the Hub can present them side by side without creating
-- anything first, and so the pipeline can read one without a null check. Google is the one actually
-- wired up today, so it is the one enabled by default. Runs unconditionally, which also repairs a
-- database where a row was deleted by hand.
insert into public.mail_settings (provider, is_active) values ('google', true), ('microsoft', false)
  on conflict (provider) do nothing;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.mail_settings;
  raise notice 'mail_settings has % provider row(s)', v_n;
end $$;

alter table public.mail_settings enable row level security;

drop policy if exists "mail_settings_read" on public.mail_settings;
create policy "mail_settings_read" on public.mail_settings
  for select to authenticated using (true);

drop policy if exists "mail_settings_update" on public.mail_settings;
create policy "mail_settings_update" on public.mail_settings
  for update to authenticated using (true) with check (true);

-- No insert or delete policy: the two provider rows are created here and edited in place. A screen
-- that could add rows would let a third, unsupported provider appear that nothing can read.

commit;
