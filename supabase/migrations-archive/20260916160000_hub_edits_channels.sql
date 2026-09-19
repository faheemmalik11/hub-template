-- 20260916160000_hub_edits_channels.sql
-- Let the Hub read and edit the source configuration, so the Postfach screen can stop writing
-- mail_settings and start writing the tables the pipeline actually reads.
--
-- WHY. The admin panel provisioned channels, channel_folders, channel_state, read_cursors and
-- credentials, with row level security ON and NOT ONE POLICY on any of them. That is right for a
-- service-role client and it means the Hub, which talks to PostgREST as `authenticated`, cannot
-- see a single row. PostgREST answers an empty array rather than an error, so the failure is
-- silent: a screen reading these tables shows nothing and looks merely unconfigured.
--
-- Since the panel wrote the channel rows, mail_settings and channels have been two separate
-- stores for one fact. The Hub wrote the first and the pipeline read the second, so changing the
-- folder selection on the Postfach screen saved successfully and changed nothing about what got
-- ingested. This migration is the first half of closing that; the screen moving over is the
-- second.
--
-- WHAT IS DELIBERATELY NOT HERE:
--   credentials     holds the Graph and Dropbox secrets. Service role only, forever. Secrets are
--                   written through set_channel_secret(), which is SECURITY DEFINER, and there is
--                   no reason for a browser to read them back.
--   channel_state   the panel's own test results. The Hub displays them via the panel, not by
--                   reading the table.
--   read_cursors    the pipeline's bookmarks. A Hub write here would skip or replay mail.
--
-- channels carries no secret: key, kind, provider, enabled, connection_id, provider_ref,
-- settings, position and the updated_* pair, checked against information_schema before writing
-- this. settings holds a mailbox address, a Dropbox path and a bucket name.
--
-- The permission is the one the screen already uses. mail_settings_update is gated on exactly
-- this, so nobody gains an ability they did not already have over source configuration.

begin;

do $preconditions$
begin
    if to_regclass('public.channels') is null or to_regclass('public.channel_folders') is null then
        raise exception
            'channels/channel_folders are missing. The admin panel provisions them (step 0002_channels).';
    end if;
    if not exists (select 1 from public.permissions where key = 'postfach.settings') then
        raise exception 'the postfach.settings permission does not exist in this catalogue';
    end if;
end $preconditions$;

-- ------------------------------------------------------------------------------ channels
-- Readable by anyone signed in, the same as mail_settings_read. Which sources a company has is
-- not sensitive, and every screen that shows ingestion status needs it.
drop policy if exists channels_read on public.channels;
create policy channels_read
    on public.channels for select to authenticated
 using (true);

drop policy if exists channels_write on public.channels;
create policy channels_write
    on public.channels for update to authenticated
 using (public.has_permission('postfach.settings'))
 with check (public.has_permission('postfach.settings'));

-- Insert and delete are NOT granted. A channel is created and removed by the admin panel, which
-- also provisions its credentials and its state row; a Hub that could insert a bare row would
-- produce a source the pipeline cannot authenticate and nobody can explain.

-- ------------------------------------------------------------------------ channel_folders
-- The folder bindings are what the Postfach screen edits, so these need the full set. Saving a
-- selection is a set difference, not an update: folders ticked are inserted, folders unticked
-- are deleted.
drop policy if exists channel_folders_read on public.channel_folders;
create policy channel_folders_read
    on public.channel_folders for select to authenticated
 using (true);

drop policy if exists channel_folders_insert on public.channel_folders;
create policy channel_folders_insert
    on public.channel_folders for insert to authenticated
 with check (public.has_permission('postfach.settings'));

drop policy if exists channel_folders_update on public.channel_folders;
create policy channel_folders_update
    on public.channel_folders for update to authenticated
 using (public.has_permission('postfach.settings'))
 with check (public.has_permission('postfach.settings'));

drop policy if exists channel_folders_delete on public.channel_folders;
create policy channel_folders_delete
    on public.channel_folders for delete to authenticated
 using (public.has_permission('postfach.settings'));

-- PostgREST needs the table grants too: a policy decides which rows, a grant decides whether the
-- role may ask at all. RLS is what keeps this safe, not the absence of a grant.
grant select, update on public.channels to authenticated;
grant select, insert, update, delete on public.channel_folders to authenticated;

commit;

notify pgrst, 'reload schema';
