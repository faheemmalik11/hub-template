-- Point the remaining RLS policies at the permission model instead of the role.
--
-- WHAT WAS WRONG. Team & Rollen offers a switch per permission, and the UI honours it — but eight
-- groups of policies still tested `is_admin()` or `current_role_name()`. Granting "Set up
-- notifications" or "OPOS whitelist" to a supervisor therefore showed them the control and then had
-- the database refuse the write. That is the same "the switch lies" defect the capability columns
-- had, one layer down.
--
-- BEHAVIOUR IS UNCHANGED ON APPLY. Each policy is mapped to the permission whose role defaults
-- already match the roles it used to name:
--
--   is_admin()                                  -> a permission granted to admin + super_admin
--   role in (admin, super_admin, supervisor)    -> a permission granted to those three
--
-- Verified against role_permissions before writing this; nobody gains or loses access today. What
-- changes is that an admin can now hand these out per person, which is what the screen promised.
--
-- DELIBERATELY NOT CONVERTED: app_users, user_company_access, role_permissions, user_permissions
-- and companies keep `is_admin()`. The first four are the permission system itself — gating them on
-- a grantable permission would mean an admin could hand someone the ability to grant themselves
-- anything, turning one careless click into full escalation. `is_admin()` is the backstop that
-- keeps "who may grant" a role decision. `companies` has no permission key at all yet.

begin;

-- Mailbox / storage settings.
drop policy if exists mail_settings_update on public.mail_settings;
create policy mail_settings_update on public.mail_settings
  for update to authenticated
  using (public.has_permission('postfach.settings'))
  with check (public.has_permission('postfach.settings'));

-- Notification channels and the dispatch log.
drop policy if exists notification_channels_admin_read on public.notification_channels;
create policy notification_channels_admin_read on public.notification_channels
  for select to authenticated
  using (public.has_permission('notifications.settings'));

drop policy if exists notification_channels_admin_write on public.notification_channels;
create policy notification_channels_admin_write on public.notification_channels
  for all to authenticated
  using (public.has_permission('notifications.settings'))
  with check (public.has_permission('notifications.settings'));

drop policy if exists notification_dispatch_log_admin_read on public.notification_dispatch_log;
create policy notification_dispatch_log_admin_read on public.notification_dispatch_log
  for select to authenticated
  using (public.has_permission('notifications.settings'));

-- OPOS whitelist.
drop policy if exists opos_whitelist_insert on public.opos_whitelist_rules;
create policy opos_whitelist_insert on public.opos_whitelist_rules
  for insert to authenticated
  with check (public.has_permission('opos_whitelist.write'));

drop policy if exists opos_whitelist_update on public.opos_whitelist_rules;
create policy opos_whitelist_update on public.opos_whitelist_rules
  for update to authenticated
  using (public.has_permission('opos_whitelist.write'))
  with check (public.has_permission('opos_whitelist.write'));

-- Filename convention.
drop policy if exists filename_settings_admin_update on public.filename_settings;
create policy filename_settings_admin_update on public.filename_settings
  for update to authenticated
  using (public.has_permission('page.dateibenennung'))
  with check (public.has_permission('page.dateibenennung'));

-- Approval rules and approvers — the Freigabe-Regeln screen.
drop policy if exists approvers_insert on public.approvers;
create policy approvers_insert on public.approvers
  for insert to authenticated
  with check (public.has_permission('page.freigabe_regeln'));

drop policy if exists approvers_update on public.approvers;
create policy approvers_update on public.approvers
  for update to authenticated
  using (public.has_permission('page.freigabe_regeln'))
  with check (public.has_permission('page.freigabe_regeln'));

drop policy if exists approval_rules_insert on public.approval_rules;
create policy approval_rules_insert on public.approval_rules
  for insert to authenticated
  with check (public.has_permission('page.freigabe_regeln'));

drop policy if exists approval_rules_update on public.approval_rules;
create policy approval_rules_update on public.approval_rules
  for update to authenticated
  using (public.has_permission('page.freigabe_regeln'))
  with check (public.has_permission('page.freigabe_regeln'));

-- The audit trail and the pipeline log — the Protokoll screen.
drop policy if exists read_non_assistant on public.change_history;
create policy read_non_assistant on public.change_history
  for select to authenticated
  using (public.has_permission('page.protokoll'));

drop policy if exists read_non_assistant on public.processing_log;
create policy read_non_assistant on public.processing_log
  for select to authenticated
  using (public.has_permission('page.protokoll'));

-- Bank connections and their sync log.
drop policy if exists bank_connections_read on public.bank_connections;
create policy bank_connections_read on public.bank_connections
  for select to authenticated
  using (public.has_permission('page.bankverbindungen'));

drop policy if exists bank_sync_logs_read on public.bank_sync_logs;
create policy bank_sync_logs_read on public.bank_sync_logs
  for select to authenticated
  using (public.has_permission('page.bankverbindungen'));

commit;
