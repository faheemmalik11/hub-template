-- 20260817260000_mail_settings_admin_only_write.sql
-- Restrict writes to `mail_settings` to admins.
--
-- The policy was `for update to authenticated using (true) with check (true)` — no role check of
-- any kind. This table is the single, global configuration for the whole ingestion pipeline: which
-- mailbox and which Drive folders every company's incoming invoices are read from, where processed
-- items are moved to, and whether either channel runs at all. Any authenticated employee, at any
-- role, could repoint it or switch it off for everyone.
--
-- This is the same gap already closed on the two sibling integration screens — DATEV-Übergabe's
-- set_datev_route/update_datev_route_status and LexOffice's set_lexoffice_config/
-- update_lexoffice_config_status (migration 20260817160000) — but those are per-company
-- credentials, and this one is global, which makes it the widest of the three.
--
-- READING STAYS OPEN. The Postfach screen shows the current configuration to everyone, and the
-- overview's "Zielordner fehlt" banner is computed from it for every user; hiding the row would
-- break that warning for exactly the people who most need to see something is wrong. Only writing
-- is restricted.
--
-- is_admin() is the same helper the rest of the schema uses: current_role_name() in
-- ('admin', 'super_admin'), evaluated from the caller's JWT email against app_users.

begin;

drop policy if exists mail_settings_update on public.mail_settings;
create policy mail_settings_update
  on public.mail_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;

-- Sanity (after applying):
--   select polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
--     from pg_policy where polrelid = 'public.mail_settings'::regclass;
--   -- expect mail_settings_read  r  true            (unchanged)
--   --        mail_settings_update w  is_admin()  /  is_admin()
--
-- And the screen must still SAVE for an admin: the Postfach page writes this table directly
-- (no RPC), so a wrong policy here shows up as a save that silently affects zero rows.
