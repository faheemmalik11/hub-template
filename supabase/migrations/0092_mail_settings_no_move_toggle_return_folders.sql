-- 0092_mail_settings_no_move_toggle_return_folders.sql
-- Postfach & Ablage: drop the "actually move" toggles in favour of an implicit rule (a
-- destination folder is chosen -> that channel moves after extraction; none chosen -> nothing
-- moves), give the mailbox's not-relevant return folder a real picker instead of free text, and
-- give the Dropbox filing channel the same not-relevant destination the mailbox already had.
--
-- Why. Each mail_settings row already gates its own channel via `is_active` (one row per
-- provider, migration 0091) — there was never a need to split that further here, unlike a
-- single-row-per-provider design serving two channels at once. But the move toggles are still
-- redundant state that can drift from the folders themselves: a destination folder now IS the
-- whole opt-in, so `mail_move_processed`/`drive_move_processed` have nothing left to add. And
-- Dropbox never had a "not relevant" destination at all, so a rejected filing-channel receipt had
-- nowhere defined to go back to.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'mail_settings'
  ) then
    raise exception '0092 expects mail_settings from migration 0091, which is missing';
  end if;
end $$;

alter table public.mail_settings
  add column if not exists drive_return_folder text;

alter table public.mail_settings
  alter column mail_return_folder drop not null,
  alter column mail_return_folder drop default;

alter table public.mail_settings
  drop column if exists mail_move_processed,
  drop column if exists drive_move_processed;

comment on column public.mail_settings.mail_return_folder is
  'Where a not-relevant email is handed back to (microsoft row only). Null means: leave it where '
  'it is.';
comment on column public.mail_settings.drive_return_folder is
  'Where a not-relevant Dropbox file is moved to (dropbox row only). Null means: leave it where '
  'it is.';
comment on column public.mail_settings.mail_processed_folder is
  'Where a successfully processed email is moved to. Null means: nothing is moved after '
  'extraction — moving is opt-in purely by choosing a destination, there is no separate switch.';
comment on column public.mail_settings.drive_processed_folder is
  'Where a successfully processed file is moved to. Null means: nothing is moved after '
  'extraction — moving is opt-in purely by choosing a destination, there is no separate switch.';

-- Track when the pipeline moved a receipt's source item to its processed folder, same handshake
-- pattern as not_relevant_at/mailbox_reset_at (migration 0038).
alter table public.invoices add column if not exists filed_at timestamptz;
comment on column public.invoices.filed_at is
  'When the pipeline moved this receipt''s source email/Dropbox file into its processed folder. '
  'Null means still pending (or no processed folder configured for that channel).';

commit;
