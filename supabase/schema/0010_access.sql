-- Who may read and write each table, enforced by the database rather than by a screen.
--
-- THE CONTRACT. Policies ask for capabilities by name, and these are the names the schema itself
-- relies on. A catalogue declares them; a catalogue that does not simply leaves that area to
-- administering roles, because has_permission() answers false for a key nobody granted.
--
--   users.read           see the team without administering it
--   documents.read       see documents and everything hanging off one
--   documents.write      edit a document
--   master_data.read     see companies, properties, suppliers, customers, categories, VAT rates
--   master_data.write    maintain them
--   bank.read            see accounts and transactions
--   bank.write           reconcile, exclude, mark as needing no receipt
--   payments.write       raise a payment order
--   rules.write          change assignment, approval and handover rules
--   settings.manage      change how this Hub is set up: sources, filing, filenames, notifications
--
-- These are areas, not screens. No page name appears here, so a client can arrange their menu any
-- way without touching a policy.
--
-- Company scoping is separate and additive: where a row names a company, a person who has been
-- granted specific companies sees only those. A person with no grants at all is unrestricted, which
-- is what lets a single-company client ignore the whole idea.

begin;

create or replace function public.has_company_access(p_company_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_company_id is null then true
    when public.is_admin() then true
    when not exists (
      select 1 from public.user_company_access a
       where a.user_id = public.current_app_user_id() and a.can_view and a.deleted_at is null
    ) then true
    else exists (
      select 1 from public.user_company_access a
       where a.user_id = public.current_app_user_id()
         and a.company_id = p_company_id
         and a.can_view
         and a.deleted_at is null
    )
  end;
$$;

revoke execute on function public.has_company_access(uuid) from public, anon;
grant execute on function public.has_company_access(uuid) to authenticated;

-- An administering role holds everything, so a client can never lock themselves out of their own
-- data by mis-editing a role. It does NOT hold what this client has switched off: a feature that is
-- off is off for everybody, which is the difference between a hidden screen and a feature a client
-- does not have. has_permission() already resolves both; this adds the admin path and keeps the
-- entitlement in front of it.
create or replace function public.may_use(p_capability text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.has_permission(p_capability)
      or (public.is_admin()
          and p_capability in (select key from public.live_features()));
$$;

create or replace function public.may_read(p_capability text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.may_use(p_capability);
$$;

create or replace function public.may_write(p_capability text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.may_use(p_capability);
$$;

revoke execute on function public.may_use(text) from public, anon;
grant execute on function public.may_use(text) to authenticated;
revoke execute on function public.may_read(text) from public, anon;
revoke execute on function public.may_write(text) from public, anon;
grant execute on function public.may_read(text) to authenticated;
grant execute on function public.may_write(text) to authenticated;

-- Applied the same way to every table in an area, so a new table cannot be forgotten: the loop is
-- the policy, and a table missing from the lists below has RLS on and no policy, which denies
-- everyone rather than leaking.
do $$
declare
    t text;
    area record;
begin
    for area in
        select * from (values
            ('master_data.read', 'master_data.write', array[
                'companies', 'properties', 'property_companies', 'suppliers',
                'supplier_bank_accounts', 'supplier_iban_history', 'customers',
                'categories', 'category_aliases', 'entity_aliases', 'vat_rates']),
            ('documents.read', 'documents.write', array[
                'documents', 'document_files', 'document_history', 'document_line_items',
                'document_taxes', 'document_bank_accounts', 'outgoing_invoices',
                'outgoing_invoice_files', 'outgoing_invoice_transaction_matches',
                'manual_bookings']),
            ('bank.read', 'bank.write', array[
                'bank_accounts', 'bank_connections', 'bank_transactions', 'bank_providers',
                'bank_sync_logs', 'document_transaction_matches', 'open_item_whitelist_rules']),
            ('payments.write', 'payments.write', array['payment_orders']),
            ('documents.read', 'rules.write', array[
                'assignment_rules', 'approval_rules', 'approvers',
                'handover_routes', 'handover_batches', 'category_account_mapping']),
            ('documents.read', 'settings.manage', array[
                'channels', 'channel_folders', 'channel_state', 'read_cursors',
                'imported_items', 'pipeline_runs', 'processing_log', 'ai_usage',
                'ingest_exclusions', 'filing_placements', 'filename_settings',
                'matching_settings', 'tenant_settings', 'tenant_settings_history',
                'notification_channels', 'notification_target_kinds',
                'notification_dispatch_log', 'assistant_usage'])
        ) as v(read_capability, write_capability, tables)
    loop
        foreach t in array area.tables loop
            execute format('alter table public.%I enable row level security', t);

            execute format('drop policy if exists %I on public.%I', t || '_read', t);
            execute format(
                'create policy %I on public.%I for select to authenticated using (public.may_read(%L))',
                t || '_read', t, area.read_capability);

            execute format('drop policy if exists %I on public.%I', t || '_write', t);
            execute format(
                'create policy %I on public.%I for all to authenticated using (public.may_write(%L)) with check (public.may_write(%L))',
                t || '_write', t, area.write_capability, area.write_capability);
        end loop;
    end loop;
end
$$;

-- Where a row names a company, the company grants narrow what the capability opened.
do $$
declare
    t text;
begin
    foreach t in array array['documents', 'bank_accounts', 'bank_transactions',
                             'outgoing_invoices', 'manual_bookings', 'payment_orders'] loop
        execute format('drop policy if exists %I on public.%I', t || '_company_scope', t);
        execute format(
            'create policy %I on public.%I as restrictive for all to authenticated using (public.has_company_access(company_id)) with check (public.has_company_access(company_id))',
            t || '_company_scope', t);
    end loop;
end
$$;

-- A person's own rows, regardless of capability: their notification settings, their tour progress,
-- and what was sent to them.
alter table public.notification_settings enable row level security;
alter table public.notification_events enable row level security;
alter table public.tour_progress enable row level security;

drop policy if exists notification_settings_own on public.notification_settings;
create policy notification_settings_own on public.notification_settings for all to authenticated
    using (user_id = public.current_app_user_id())
    with check (user_id = public.current_app_user_id());

drop policy if exists notification_events_own on public.notification_events;
create policy notification_events_own on public.notification_events for select to authenticated
    using (recipient_user_id = public.current_app_user_id() or public.is_admin());

drop policy if exists notification_events_ack on public.notification_events;
create policy notification_events_ack on public.notification_events for update to authenticated
    using (recipient_user_id = public.current_app_user_id())
    with check (recipient_user_id = public.current_app_user_id());

drop policy if exists tour_progress_own on public.tour_progress;
create policy tour_progress_own on public.tour_progress for all to authenticated
    using (user_id = public.current_app_user_id())
    with check (user_id = public.current_app_user_id());

-- The trail is readable by whoever may read the thing it is about, and written by nobody directly.
alter table public.change_history enable row level security;
drop policy if exists change_history_read on public.change_history;
create policy change_history_read on public.change_history for select to authenticated
    using (public.may_read('documents.read'));

-- Credentials are never selectable, in either table. A value leaves only through an audited reveal
-- that runs with the service role, outside these policies.
alter table public.credentials enable row level security;
alter table public.credential_reads enable row level security;

drop policy if exists credential_reads_read on public.credential_reads;
create policy credential_reads_read on public.credential_reads for select to authenticated
    using (public.may_read('settings.manage'));

commit;
