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

create or replace function public.current_crm_external_id() returns text
language sql stable security definer set search_path to 'public'
as $$
  select crm_external_id from public.app_users where id = public.current_app_user_id();
$$;

create or replace function public.owns_deal(p_deal_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
      from public.deals d
      left join public.properties p on p.id = d.property_id
     where d.id = p_deal_id
       and d.deleted_at is null
       and (d.acquired_by = public.current_app_user_id()
            or d.handled_by = public.current_app_user_id()
            or (p.broker_external_id is not null
                and p.broker_external_id = public.current_crm_external_id()))
  );
$$;

create or replace function public.owns_deal_side(p_side_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.deal_sides s
                  where s.id = p_side_id and public.owns_deal(s.deal_id));
$$;

create or replace function public.owns_customer_through_a_deal(p_customer_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1
                   from public.deal_parties dp
                   join public.deal_sides s on s.id = dp.deal_side_id
                  where dp.customer_id = p_customer_id and public.owns_deal(s.deal_id));
$$;

revoke execute on function public.current_crm_external_id() from public, anon;
revoke execute on function public.owns_deal(uuid) from public, anon;
revoke execute on function public.owns_deal_side(uuid) from public, anon;
revoke execute on function public.owns_customer_through_a_deal(uuid) from public, anon;
grant execute on function public.current_crm_external_id() to authenticated;
grant execute on function public.owns_deal(uuid) to authenticated;
grant execute on function public.owns_deal_side(uuid) to authenticated;
grant execute on function public.owns_customer_through_a_deal(uuid) to authenticated;

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
                'document_taxes', 'document_bank_accounts', 'document_links', 'outgoing_invoices',
                'outgoing_invoice_files', 'outgoing_invoice_transaction_matches',
                'manual_bookings', 'deals', 'deal_sides', 'deal_parties']),
            ('bank.read', 'bank.write', array[
                'bank_accounts', 'bank_connections', 'bank_transactions', 'bank_providers',
                'bank_sync_logs', 'document_transaction_matches', 'open_item_whitelist_rules']),
            ('payments.write', 'payments.write', array['payment_orders']),
            ('documents.read', 'rules.write', array[
                'assignment_rules', 'approval_rules', 'approvers',
                'handover_batches', 'category_account_mapping']),
            ('documents.read', 'settings.manage', array[
                'channels', 'channel_folders', 'channel_state', 'read_cursors',
                'imported_items', 'pipeline_runs', 'processing_log', 'ai_usage',
                'ingest_exclusions', 'filing_placements', 'filing_attempts', 'filename_settings',
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

-- The table policies above cover the row the browser inserts once a file has reached storage, but
-- storage.objects itself carries no policy of its own, so the upload that writes the bytes there
-- is refused before any table is ever touched: "new row violates row-level security policy". Insert
-- only, same as the table policies allow nothing beyond writing a new document in -- overwriting an
-- existing object is a different operation this does not open.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false), ('outgoing-invoice-files', 'outgoing-invoice-files', false)
on conflict (id) do nothing;

drop policy if exists documents_bucket_write on storage.objects;
create policy documents_bucket_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'documents' and public.may_write('documents.write'));

drop policy if exists outgoing_invoice_files_bucket_write on storage.objects;
create policy outgoing_invoice_files_bucket_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'outgoing-invoice-files' and public.may_write('documents.write'));

-- Where a row names a company, the company grants narrow what the capability opened.
do $$
declare
    t text;
begin
    foreach t in array array['documents', 'bank_accounts', 'bank_transactions',
                             'outgoing_invoices', 'manual_bookings', 'payment_orders',
                             'deals'] loop
        execute format('drop policy if exists %I on public.%I', t || '_company_scope', t);
        execute format(
            'create policy %I on public.%I as restrictive for all to authenticated using (public.has_company_access(company_id)) with check (public.has_company_access(company_id))',
            t || '_company_scope', t);
    end loop;
end
$$;

-- What the CRM says is a person's own, whatever their role may read: the properties they are the
-- broker of, the sales those belong to, and the customers on them. Read only, and added to what a
-- role already grants, so it widens nothing for anyone who may read everything.
drop policy if exists properties_own_broker_read on public.properties;
create policy properties_own_broker_read on public.properties for select to authenticated
    using (deleted_at is null and broker_external_id is not null
           and broker_external_id = public.current_crm_external_id());

drop policy if exists deals_own_read on public.deals;
create policy deals_own_read on public.deals for select to authenticated
    using (public.owns_deal(id));

drop policy if exists deal_sides_own_read on public.deal_sides;
create policy deal_sides_own_read on public.deal_sides for select to authenticated
    using (public.owns_deal(deal_id));

drop policy if exists deal_parties_own_read on public.deal_parties;
create policy deal_parties_own_read on public.deal_parties for select to authenticated
    using (public.owns_deal_side(deal_side_id));

drop policy if exists customers_own_deals_read on public.customers;
create policy customers_own_deals_read on public.customers for select to authenticated
    using (public.owns_customer_through_a_deal(id));

-- handover_routes (the DATEV handover addresses) never gets the generic rules.write "for all"
-- policy above: with that policy plus Postgres's default table grants, anyone holding rules.write
-- could PATCH the row directly over the REST API, bypassing set_datev_route() and
-- update_datev_route_status() entirely, along with the auth.uid() and has_company_access() checks
-- written into those two functions and the address column this table exists to keep unreadable.
-- Read stays capability-gated; every write goes through the two SECURITY DEFINER functions, never
-- through a table grant, so there is no direct path left for RLS alone to have to stop.
alter table public.handover_routes enable row level security;

drop policy if exists handover_routes_read on public.handover_routes;
create policy handover_routes_read on public.handover_routes for select to authenticated
    using (public.may_read('documents.read'));

revoke insert, update, delete on public.handover_routes from authenticated;

revoke select on public.handover_routes from authenticated;
grant select (id, company_id, direction, is_enabled, note, updated_by, created_at, updated_at)
    on public.handover_routes to authenticated;

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

-- Practice mode: a person trying the app out sees only their own is_demo rows while it is active,
-- and only real rows otherwise. Restrictive, so it narrows what the area policies above already
-- allow rather than granting anything on its own -- a person with no documents.read grant still
-- sees nothing here either way.
drop policy if exists documents_demo_owner_read on public.documents;
create policy documents_demo_owner_read on public.documents as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists documents_demo_owner_write on public.documents;
create policy documents_demo_owner_write on public.documents as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists documents_demo_owner_write_update on public.documents;
create policy documents_demo_owner_write_update on public.documents as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists suppliers_demo_owner_read on public.suppliers;
create policy suppliers_demo_owner_read on public.suppliers as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists suppliers_demo_owner_write on public.suppliers;
create policy suppliers_demo_owner_write on public.suppliers as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists suppliers_demo_owner_write_update on public.suppliers;
create policy suppliers_demo_owner_write_update on public.suppliers as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists companies_demo_owner_read on public.companies;
create policy companies_demo_owner_read on public.companies as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists companies_demo_owner_write on public.companies;
create policy companies_demo_owner_write on public.companies as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists companies_demo_owner_write_update on public.companies;
create policy companies_demo_owner_write_update on public.companies as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

-- For a table with no is_demo column of its own (payment_settings and friends in
-- 0024_payment_files.sql). Security definer so this sees the company's real is_demo flag even
-- when companies_demo_owner_read itself would hide that row from the caller.
create or replace function public.company_demo_visible(p_company_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case when public.practice_mode_active()
              then exists (
                  select 1 from public.companies c
                   where c.id = p_company_id and c.is_demo
                     and c.demo_owner_user_id = public.current_app_user_id()
              )
              else not exists (
                  select 1 from public.companies c where c.id = p_company_id and c.is_demo
              )
         end;
$$;

revoke execute on function public.company_demo_visible(uuid) from public, anon;
grant execute on function public.company_demo_visible(uuid) to authenticated;

drop policy if exists properties_demo_owner_read on public.properties;
create policy properties_demo_owner_read on public.properties as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists properties_demo_owner_write on public.properties;
create policy properties_demo_owner_write on public.properties as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists properties_demo_owner_write_update on public.properties;
create policy properties_demo_owner_write_update on public.properties as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists bank_transactions_demo_owner_read on public.bank_transactions;
create policy bank_transactions_demo_owner_read on public.bank_transactions as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists bank_transactions_demo_owner_write on public.bank_transactions;
create policy bank_transactions_demo_owner_write on public.bank_transactions as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists bank_transactions_demo_owner_write_update on public.bank_transactions;
create policy bank_transactions_demo_owner_write_update on public.bank_transactions as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

-- Private post: mail the pipeline never files into a company folder because it belongs to a person,
-- not the business (briefing: this must not be readable by whoever happens to hold documents.read).
-- Restrictive, so it narrows what the area policies above already allow rather than granting
-- anything on its own -- a person with no documents.read grant still sees nothing here either way.
-- An administering role always sees it; the person it was assigned to (private_owner_user_id) sees
-- that one row once an admin has made the assignment. Nobody else, regardless of capability.
drop policy if exists documents_private_hold_read on public.documents;
create policy documents_private_hold_read on public.documents as restrictive for select to authenticated
    using (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id());
drop policy if exists documents_private_hold_write on public.documents;
create policy documents_private_hold_write on public.documents as restrictive for insert to authenticated
    with check (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id());
drop policy if exists documents_private_hold_write_update on public.documents;
create policy documents_private_hold_write_update on public.documents as restrictive for update to authenticated
    using (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id())
    with check (not private_hold or public.is_admin() or private_owner_user_id = public.current_app_user_id());

-- Everything that hangs off a document follows the document's own visibility. Without this, a
-- private row stayed hidden itself but its files, history, line items, taxes, bank accounts, bank
-- matches, import log and processing log were still readable sideways by document_id, through
-- their own capability-scoped policy alone.
do $$
declare
    t text;
begin
    foreach t in array array['document_files', 'document_history', 'document_line_items',
                              'document_taxes', 'document_bank_accounts',
                              'document_transaction_matches', 'imported_items', 'processing_log',
                              'ai_usage', 'payment_orders'] loop
        execute format('drop policy if exists %I on public.%I', t || '_private_hold_read', t);
        execute format(
            'create policy %I on public.%I as restrictive for select to authenticated using ('
            || '%I.document_id is null or not exists ('
            || 'select 1 from public.documents d where d.id = %I.document_id and d.private_hold '
            || 'and not (public.is_admin() or d.private_owner_user_id = public.current_app_user_id())))',
            t || '_private_hold_read', t, t, t);
    end loop;
end
$$;

-- document_history additionally has to refuse WRITING a row against a private document the caller
-- may not read, the same way documents_private_hold_write guards the document itself.
drop policy if exists document_history_private_hold_write on public.document_history;
create policy document_history_private_hold_write on public.document_history as restrictive for insert to authenticated
    with check (
        not exists (
            select 1 from public.documents d
             where d.id = document_history.document_id and d.private_hold
               and not (public.is_admin() or d.private_owner_user_id = public.current_app_user_id())
        )
    );

-- The trail is written once and never changed, so a client role cannot rewrite its own history
-- after the fact even through a capability it otherwise holds. See 0011_functions.sql and
-- 0014_triggers.sql for the trigger that blocks UPDATE/DELETE/TRUNCATE for every role, including
-- this one's own service role; the revoke below is the belt to that trigger's suspenders.
revoke update, delete, truncate on public.document_history from authenticated, anon;

commit;
