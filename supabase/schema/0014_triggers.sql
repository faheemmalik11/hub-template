-- What the database does by itself.
--
-- Ported from the Hub this template came from: every trigger that was live there, in its last
-- definition, because several were dropped and recreated over time and only the last one is true.
--
-- These are behaviour, not decoration. Without them a Hub looks right and quietly stops advancing
-- a workflow when a payment lands, stops recording that a supplier's IBAN changed, and stops
-- refusing a write somebody is not allowed to make.
--
-- They come after the functions they execute and after the tables they sit on.

begin;

-- from 20260817140000_company_code_rename_cascade.sql
drop trigger if exists companies_code_rename_cascade on public.companies;
create trigger companies_code_rename_cascade
  after update of code on public.companies
  for each row
  when (old.code is distinct from new.code)
  execute function public.cascade_company_code_rename();

-- from 20260911190000_upload_an_invoice_for_a_transaction.sql
drop trigger if exists invoices_link_uploaded_for_transaction on public.documents;
create trigger invoices_link_uploaded_for_transaction
  after update of amount_gross on public.documents
  for each row
  execute function public.link_uploaded_invoice_when_extracted();

-- from 20260911100000_notify_about_any_record.sql
drop trigger if exists notification_events_dispatch_now on public.notification_events;
create trigger notification_events_dispatch_now
  after insert on public.notification_events
  for each row
  execute function public.notify_dispatch_now();

-- from 20260817150000_property_code_rename_cascade.sql
drop trigger if exists properties_code_rename_cascade on public.properties;
create trigger properties_code_rename_cascade
  after update of code on public.properties
  for each row
  when (old.code is distinct from new.code)
  execute function public.cascade_property_code_rename();

-- A soft delete must say why, on every table that can be soft deleted. Written as a loop rather
-- than as one trigger per table, so a table that gains deleted_at later gains the rule by being
-- added to this list, and the rule itself is written once.
do $$
declare
    t text;
begin
    foreach t in array array[
        'documents', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
        'approval_rules', 'assignment_rules', 'ingest_exclusions', 'open_item_whitelist_rules',
        'categories', 'properties', 'companies', 'approvers', 'supplier_bank_accounts',
        'entity_aliases', 'vat_rates', 'property_companies'] loop
        execute format('drop trigger if exists trash_require_delete_reason on public.%I', t);
        execute format(
            'create trigger trash_require_delete_reason before update on public.%I '
            'for each row '
            'when (new.deleted_at is not null '
            '      and (old.deleted_at is null or new.delete_reason is distinct from old.delete_reason)) '
            'execute function public.trash_require_delete_reason()', t);
    end loop;
end
$$;

-- from 0051_hub_datev_handover.sql
drop trigger if exists trg_advance_workflow_on_datev_handover on public.documents;
create trigger trg_advance_workflow_on_datev_handover
  after update of handed_over_at on public.documents
  for each row execute function public.advance_workflow_on_datev_handover();

-- from 0049_hub_payment_gated_workflow.sql
drop trigger if exists trg_advance_workflow_on_payment on public.documents;
create trigger trg_advance_workflow_on_payment
  after update of paid_at on public.documents
  for each row execute function public.advance_workflow_on_payment();

-- from 0029_pipeline_opos_whitelist.sql
drop trigger if exists trg_apply_opos_whitelist on public.bank_transactions;
create trigger trg_apply_opos_whitelist
  before insert or update of payment_reference, counterparty_holder, counterparty_iban, booking_text,
                             amount
  on public.bank_transactions
  for each row execute function public.apply_opos_whitelist();

-- from 0028_pipeline_bank_providers.sql
drop trigger if exists trg_bank_account_connect_route on bank_accounts;
create trigger trg_bank_account_connect_route
  before insert or update of provider_ref on bank_accounts
  for each row execute function set_bank_account_connect_route();

-- from 0069_hub_bank_transaction_auto_categorize.sql
drop trigger if exists trg_bank_transactions_categorize_insert on public.bank_transactions;
create trigger trg_bank_transactions_categorize_insert
  after insert on public.bank_transactions
  for each row execute function public.trg_fn_bank_transactions_categorize();

-- from 0069_hub_bank_transaction_auto_categorize.sql
drop trigger if exists trg_bank_transactions_categorize_update on public.bank_transactions;
create trigger trg_bank_transactions_categorize_update
  after update of counterparty_iban, payment_reference on public.bank_transactions
  for each row execute function public.trg_fn_bank_transactions_categorize();

-- from 0053_hub_supplier_history_aliases_merge.sql
drop trigger if exists trg_capture_supplier_iban_history on public.suppliers;
create trigger trg_capture_supplier_iban_history
  after update on public.suppliers
  for each row
  execute function public.capture_supplier_iban_history();

-- from 0037_hub_match_amounts_m_to_n.sql
drop trigger if exists trg_check_match_allocation on public.document_transaction_matches;
create trigger trg_check_match_allocation
  before insert or update on public.document_transaction_matches
  for each row execute function public.check_match_allocation();

-- from 0058_hub_outgoing_invoice_matching.sql
drop trigger if exists trg_check_outgoing_match_allocation on public.outgoing_invoice_transaction_matches;
create trigger trg_check_outgoing_match_allocation
  before insert or update on public.outgoing_invoice_transaction_matches
  for each row execute function public.check_outgoing_match_allocation();

-- from 20260824100000_supplier_bank_accounts.sql
drop trigger if exists trg_compact_supplier_iban on public.supplier_bank_accounts;
create trigger trg_compact_supplier_iban
  before insert or update of iban on public.supplier_bank_accounts
  for each row execute function public.compact_supplier_iban();

-- from 20260828230000_enforce_invoice_write_permissions.sql
drop trigger if exists trg_enforce_invoice_write_permissions on public.documents;
create trigger trg_enforce_invoice_write_permissions
  before update on public.documents
  for each row execute function public.enforce_invoice_write_permissions();

-- from 20260911210000_bank_match_needs_payment_permission.sql
drop trigger if exists trg_enforce_match_payment_permission on public.outgoing_invoice_transaction_matches;
create trigger trg_enforce_match_payment_permission
      before insert or update or delete on public.outgoing_invoice_transaction_matches
      for each row execute function public.enforce_match_payment_permission();

-- from 20260904120000_no_self_grant_no_escalation.sql
drop trigger if exists trg_guard_permission_grants on public.user_permissions;
create trigger trg_guard_permission_grants
  before insert or update or delete on public.user_permissions
  for each row execute function public.guard_permission_grants();

-- from 20260904120000_no_self_grant_no_escalation.sql
drop trigger if exists trg_guard_role_permission_grants on public.role_permissions;
create trigger trg_guard_role_permission_grants
  before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_permission_grants();

-- from 0044_hub_vat_deductibility.sql
drop trigger if exists trg_invoices_apply_rules_on_insert on public.documents;
create trigger trg_invoices_apply_rules_on_insert
  after insert on public.documents
  for each row execute function public.trg_fn_invoices_apply_rules_on_insert();

-- from 0083_direct_property_company.sql
drop trigger if exists trg_invoices_vat_deductible_default on public.documents;
create trigger trg_invoices_vat_deductible_default
  before insert or update of property_id on public.documents
  for each row execute function public.trg_fn_invoices_vat_deductible_default();

-- from 20260828110000_supplier_bank_account_events.sql
drop trigger if exists trg_log_supplier_bank_account_event on public.supplier_bank_accounts;
create trigger trg_log_supplier_bank_account_event
      after insert or update of is_default on public.supplier_bank_accounts
      for each row execute function public.log_supplier_bank_account_event();

-- from 20260901160500_assignment_notifies.sql
drop trigger if exists trg_notify_event_from_history on public.document_history;
create trigger trg_notify_event_from_history
  after insert on public.document_history
  for each row execute function public.notify_event_from_history();

-- from 20260829140000_first_bank_account_is_default.sql
drop trigger if exists trg_promote_first_bank_account_to_default on public.supplier_bank_accounts;
create trigger trg_promote_first_bank_account_to_default
    before insert or update of is_active, deleted_at, is_default
    on public.supplier_bank_accounts
    for each row
    execute function public.promote_first_bank_account_to_default();

-- from 0025_pipeline_bank_transaction_company.sql
drop trigger if exists trg_propagate_account_company on public.bank_accounts;
create trigger trg_propagate_account_company
  after update of company_id on public.bank_accounts
  for each row execute function public.propagate_account_company();

-- from 20260828140000_supplier_bank_accounts_delete.sql
drop trigger if exists trg_refuse_deleting_default_bank_account on public.supplier_bank_accounts;
create trigger trg_refuse_deleting_default_bank_account
      before delete on public.supplier_bank_accounts
      for each row execute function public.refuse_deleting_default_bank_account();

-- from 0025_pipeline_bank_transaction_company.sql
drop trigger if exists trg_set_bank_transaction_company on public.bank_transactions;
create trigger trg_set_bank_transaction_company
  before insert or update of account_id on public.bank_transactions
  for each row execute function public.set_bank_transaction_company();

-- from 20260901200000_spender_from_employee_id.sql
drop trigger if exists trg_set_transaction_spender on public.bank_transactions;
create trigger trg_set_transaction_spender
  before insert or update of spender_email, spender_name on public.bank_transactions
  for each row execute function public.set_transaction_spender();

-- from 20260827190000_supplier_bank_accounts_default_and_soft_delete.sql
drop trigger if exists trg_supplier_bank_accounts_single_default on public.supplier_bank_accounts;
create trigger trg_supplier_bank_accounts_single_default
      before insert or update of is_default, supplier_id on public.supplier_bank_accounts
      for each row execute function public.supplier_bank_accounts_single_default();

-- from 20260828100000_supplier_default_account_sync_on_edit.sql
drop trigger if exists trg_supplier_default_account_sync on public.supplier_bank_accounts;
create trigger trg_supplier_default_account_sync
      after insert or update of is_default, iban, bic, bank_name on public.supplier_bank_accounts
      for each row when (new.is_default) execute function public.supplier_default_account_sync();

-- from 20260827190000_supplier_bank_accounts_default_and_soft_delete.sql
drop trigger if exists trg_supplier_default_iban_sync on public.suppliers;
create trigger trg_supplier_default_iban_sync
      after update of iban on public.suppliers
      for each row when (new.iban is distinct from old.iban)
      execute function public.supplier_default_iban_sync();

-- from 0012_hub_bezahlt_from_confirmed_match.sql
drop trigger if exists trg_sync_invoice_paid_from_matches on public.document_transaction_matches;
create trigger trg_sync_invoice_paid_from_matches
  after insert or update or delete on public.document_transaction_matches
  for each row execute function public.sync_invoice_paid_from_matches();

-- from 0037_hub_match_amounts_m_to_n.sql
drop trigger if exists trg_sync_invoice_paid_from_matches on public.document_transaction_matches;
create trigger trg_sync_invoice_paid_from_matches
  after insert or update or delete on public.document_transaction_matches
  for each row execute function public.sync_invoice_paid_from_matches();

-- from 0058_hub_outgoing_invoice_matching.sql
drop trigger if exists trg_sync_outgoing_transaction_matching_status on public.outgoing_invoice_transaction_matches;
create trigger trg_sync_outgoing_transaction_matching_status
  after insert or update or delete on public.outgoing_invoice_transaction_matches
  for each row execute function public.sync_transaction_matching_status();

-- from 0037_hub_match_amounts_m_to_n.sql
drop trigger if exists trg_sync_transaction_matching_status on public.document_transaction_matches;
create trigger trg_sync_transaction_matching_status
  after insert or update or delete on public.document_transaction_matches
  for each row execute function public.sync_transaction_matching_status();

-- from 0085_outgoing_invoice_uploads.sql
drop trigger if exists trg_sync_uploaded_outgoing_invoice_status on public.outgoing_invoice_transaction_matches;
create trigger trg_sync_uploaded_outgoing_invoice_status
  after insert or update or delete on public.outgoing_invoice_transaction_matches
  for each row execute function public.sync_uploaded_outgoing_invoice_status_from_matches();

commit;
