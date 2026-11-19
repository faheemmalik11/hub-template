begin;

-- Each of these carries a PUBLIC execute grant alongside the explicit anon one, so revoking anon
-- alone leaves the anon key in the browser bundle still able to call them through PUBLIC.

revoke execute on function public.advance_workflow_on_datev_handover() from public;
revoke execute on function public.advance_workflow_on_datev_handover() from anon;

revoke execute on function public.advance_workflow_on_payment() from public;
revoke execute on function public.advance_workflow_on_payment() from anon;

revoke execute on function public.apply_opos_whitelist() from public;
revoke execute on function public.apply_opos_whitelist() from anon;

revoke execute on function public.capture_supplier_iban_history() from public;
revoke execute on function public.capture_supplier_iban_history() from anon;

revoke execute on function public.cascade_company_code_rename() from public;
revoke execute on function public.cascade_company_code_rename() from anon;

revoke execute on function public.cascade_property_code_rename() from public;
revoke execute on function public.cascade_property_code_rename() from anon;

revoke execute on function public.check_match_allocation() from public;
revoke execute on function public.check_match_allocation() from anon;

revoke execute on function public.check_match_same_world() from public;
revoke execute on function public.check_match_same_world() from anon;

revoke execute on function public.check_outgoing_match_allocation() from public;
revoke execute on function public.check_outgoing_match_allocation() from anon;

revoke execute on function public.enforce_invoice_write_permissions() from public;
revoke execute on function public.enforce_invoice_write_permissions() from anon;

revoke execute on function public.enforce_match_payment_permission() from public;
revoke execute on function public.enforce_match_payment_permission() from anon;

revoke execute on function public.forget_credentials_of_removed_channel() from public;
revoke execute on function public.forget_credentials_of_removed_channel() from anon;

revoke execute on function public.guard_locked_feature() from public;
revoke execute on function public.guard_locked_feature() from anon;

revoke execute on function public.guard_permission_grants() from public;
revoke execute on function public.guard_permission_grants() from anon;

revoke execute on function public.guard_protected_role_insert() from public;
revoke execute on function public.guard_protected_role_insert() from anon;

revoke execute on function public.guard_protected_role_permissions() from public;
revoke execute on function public.guard_protected_role_permissions() from anon;

revoke execute on function public.guard_protected_role_row() from public;
revoke execute on function public.guard_protected_role_row() from anon;

revoke execute on function public.guard_role_permission_grants() from public;
revoke execute on function public.guard_role_permission_grants() from anon;

revoke execute on function public.lexoffice_document_push_now() from public;
revoke execute on function public.lexoffice_document_push_now() from anon;

revoke execute on function public.lexoffice_invoice_push_now() from public;
revoke execute on function public.lexoffice_invoice_push_now() from anon;

revoke execute on function public.link_uploaded_invoice_when_extracted() from public;
revoke execute on function public.link_uploaded_invoice_when_extracted() from anon;

revoke execute on function public.log_supplier_bank_account_event() from public;
revoke execute on function public.log_supplier_bank_account_event() from anon;

revoke execute on function public.notify_bonus_decided() from public;
revoke execute on function public.notify_bonus_decided() from anon;

revoke execute on function public.notify_bonus_submitted() from public;
revoke execute on function public.notify_bonus_submitted() from anon;

revoke execute on function public.notify_bonus_suggested() from public;
revoke execute on function public.notify_bonus_suggested() from anon;

revoke execute on function public.notify_deal_status_changed() from public;
revoke execute on function public.notify_deal_status_changed() from anon;

revoke execute on function public.notify_dispatch_now() from public;
revoke execute on function public.notify_dispatch_now() from anon;

revoke execute on function public.notify_donation_suggested() from public;
revoke execute on function public.notify_donation_suggested() from anon;

revoke execute on function public.notify_event_from_history() from public;
revoke execute on function public.notify_event_from_history() from anon;

revoke execute on function public.notify_referrer_bonus_suggested() from public;
revoke execute on function public.notify_referrer_bonus_suggested() from anon;

revoke execute on function public.payment_file_document_set_company() from public;
revoke execute on function public.payment_file_document_set_company() from anon;

revoke execute on function public.payment_file_item_prevent_double_queue() from public;
revoke execute on function public.payment_file_item_prevent_double_queue() from anon;

revoke execute on function public.payment_file_item_set_company() from public;
revoke execute on function public.payment_file_item_set_company() from anon;

revoke execute on function public.payment_settings_ensure_default() from public;
revoke execute on function public.payment_settings_ensure_default() from anon;

revoke execute on function public.payment_settings_promote_next_default() from public;
revoke execute on function public.payment_settings_promote_next_default() from anon;

revoke execute on function public.propagate_account_company() from public;
revoke execute on function public.propagate_account_company() from anon;

revoke execute on function public.scheduled_jobs_apply() from public;
revoke execute on function public.scheduled_jobs_apply() from anon;

revoke execute on function public.set_bank_transaction_company() from public;
revoke execute on function public.set_bank_transaction_company() from anon;

revoke execute on function public.sync_invoice_paid_from_matches() from public;
revoke execute on function public.sync_invoice_paid_from_matches() from anon;

revoke execute on function public.sync_transaction_matching_status() from public;
revoke execute on function public.sync_transaction_matching_status() from anon;

revoke execute on function public.sync_uploaded_outgoing_invoice_status_from_matches() from public;
revoke execute on function public.sync_uploaded_outgoing_invoice_status_from_matches() from anon;

revoke execute on function public.trg_fn_bank_transactions_categorize() from public;
revoke execute on function public.trg_fn_bank_transactions_categorize() from anon;

revoke execute on function public.trg_fn_invoices_apply_rules_on_insert() from public;
revoke execute on function public.trg_fn_invoices_apply_rules_on_insert() from anon;

revoke execute on function public.request_approval_ping(uuid, uuid, text, uuid) from public;
revoke execute on function public.request_approval_ping(uuid, uuid, text, uuid) from anon;

revoke execute on function public.chain_people() from public;
revoke execute on function public.chain_people() from anon;
grant execute on function public.chain_people() to authenticated;

revoke execute on function public.upsert_external_transactions(jsonb, uuid) from public;
revoke execute on function public.upsert_external_transactions(jsonb, uuid) from anon;
grant execute on function public.upsert_external_transactions(jsonb, uuid) to authenticated;

revoke execute on function public.merge_suppliers(uuid, uuid, text, text) from public;
revoke execute on function public.merge_suppliers(uuid, uuid, text, text) from anon;
grant execute on function public.merge_suppliers(uuid, uuid, text, text) to authenticated;

revoke execute on function public.clear_must_change_password() from public;
revoke execute on function public.clear_must_change_password() from anon;
grant execute on function public.clear_must_change_password() to authenticated;

revoke execute on function public.set_practice_mode(boolean) from public;
revoke execute on function public.set_practice_mode(boolean) from anon;
grant execute on function public.set_practice_mode(boolean) to authenticated;

revoke execute on function public.seed_onboarding_demo_data() from public;
revoke execute on function public.seed_onboarding_demo_data() from anon;
grant execute on function public.seed_onboarding_demo_data() to authenticated;

revoke execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric, text) from public;
revoke execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric, text) from anon;
grant execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric, text) to authenticated;

revoke execute on function public.link_outgoing_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) from public;
revoke execute on function public.link_outgoing_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) from anon;
grant execute on function public.link_outgoing_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) to authenticated;

revoke execute on function public.set_uploaded_outgoing_invoice_status(uuid, text, text) from public;
revoke execute on function public.set_uploaded_outgoing_invoice_status(uuid, text, text) from anon;
grant execute on function public.set_uploaded_outgoing_invoice_status(uuid, text, text) to authenticated;

revoke execute on function public.learn_assignment_rule_from_match(uuid, text) from public;
revoke execute on function public.learn_assignment_rule_from_match(uuid, text) from anon;
grant execute on function public.learn_assignment_rule_from_match(uuid, text) to authenticated;

revoke execute on function public.apply_assignment_rule_bulk(uuid, text) from public;
revoke execute on function public.apply_assignment_rule_bulk(uuid, text) from anon;
grant execute on function public.apply_assignment_rule_bulk(uuid, text) to authenticated;

revoke execute on function public.apply_assignment_rules(uuid, text) from public;
revoke execute on function public.apply_assignment_rules(uuid, text) from anon;
grant execute on function public.apply_assignment_rules(uuid, text) to authenticated;

revoke execute on function public.set_transaction_fully_used(uuid, text) from public;
revoke execute on function public.set_transaction_fully_used(uuid, text) from anon;
grant execute on function public.set_transaction_fully_used(uuid, text) to authenticated;

revoke execute on function public.clear_transaction_fully_used(uuid) from public;
revoke execute on function public.clear_transaction_fully_used(uuid) from anon;
grant execute on function public.clear_transaction_fully_used(uuid) to authenticated;

revoke execute on function public.opos_set_no_receipt(uuid, text) from public;
revoke execute on function public.opos_set_no_receipt(uuid, text) from anon;
grant execute on function public.opos_set_no_receipt(uuid, text) to authenticated;

revoke execute on function public.opos_clear_no_receipt(uuid) from public;
revoke execute on function public.opos_clear_no_receipt(uuid) from anon;
grant execute on function public.opos_clear_no_receipt(uuid) to authenticated;

revoke execute on function public.opos_set_category(uuid, uuid) from public;
revoke execute on function public.opos_set_category(uuid, uuid) from anon;
grant execute on function public.opos_set_category(uuid, uuid) to authenticated;

revoke execute on function public.opos_reapply_whitelist(uuid) from public;
revoke execute on function public.opos_reapply_whitelist(uuid) from anon;
grant execute on function public.opos_reapply_whitelist(uuid) to authenticated;

revoke execute on function public.send_notification(uuid, text, text, text, text) from public;
revoke execute on function public.send_notification(uuid, text, text, text, text) from anon;
grant execute on function public.send_notification(uuid, text, text, text, text) to authenticated;

revoke execute on function public.acknowledge_notification(bigint) from public;
revoke execute on function public.acknowledge_notification(bigint) from anon;
grant execute on function public.acknowledge_notification(bigint) to authenticated;

revoke execute on function public.acknowledge_datev_batch(uuid, text) from public;
revoke execute on function public.acknowledge_datev_batch(uuid, text) from anon;
grant execute on function public.acknowledge_datev_batch(uuid, text) to authenticated;

revoke execute on function public.purge_record(text, uuid) from public;
revoke execute on function public.purge_record(text, uuid) from anon;
grant execute on function public.purge_record(text, uuid) to authenticated;

revoke execute on function public.restore_record(text, uuid, text) from public;
revoke execute on function public.restore_record(text, uuid, text) from anon;
grant execute on function public.restore_record(text, uuid, text) to authenticated;

revoke execute on function public.set_user_slack_id(uuid, text) from public;
revoke execute on function public.set_user_slack_id(uuid, text) from anon;
grant execute on function public.set_user_slack_id(uuid, text) to authenticated;

revoke execute on function public.my_profile() from public;
revoke execute on function public.my_profile() from anon;
grant execute on function public.my_profile() to authenticated;

revoke execute on function public.set_my_name(text) from public;
revoke execute on function public.set_my_name(text) from anon;
grant execute on function public.set_my_name(text) to authenticated;

revoke execute on function public.set_my_picture_url(text) from public;
revoke execute on function public.set_my_picture_url(text) from anon;
grant execute on function public.set_my_picture_url(text) to authenticated;

revoke execute on function public.mark_notifications_seen() from public;
revoke execute on function public.mark_notifications_seen() from anon;
grant execute on function public.mark_notifications_seen() to authenticated;

revoke execute on function public.seed_stop_cases_practice_data(boolean) from public;
revoke execute on function public.seed_stop_cases_practice_data(boolean) from anon;
grant execute on function public.seed_stop_cases_practice_data(boolean) to authenticated;

-- is_admin, current_app_user_id, current_role_name and practice_mode_active are called inside RLS
-- policies for authenticated, so authenticated must keep execute or every policy stops evaluating.
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.current_app_user_id() from public;
revoke execute on function public.current_app_user_id() from anon;
grant execute on function public.current_app_user_id() to authenticated;

revoke execute on function public.current_role_name() from public;
revoke execute on function public.current_role_name() from anon;
grant execute on function public.current_role_name() to authenticated;

revoke execute on function public.practice_mode_active() from public;
revoke execute on function public.practice_mode_active() from anon;
grant execute on function public.practice_mode_active() to authenticated;

revoke execute on function public.run_bank_sync(text) from public;
revoke execute on function public.run_bank_sync(text) from anon;
revoke execute on function public.run_bank_sync(text) from authenticated;

revoke execute on function public.mark_datev_batch_bounced(uuid, text) from public;
revoke execute on function public.mark_datev_batch_bounced(uuid, text) from anon;
revoke execute on function public.mark_datev_batch_bounced(uuid, text) from authenticated;

revoke execute on function public.pending_receipt_count() from public;
revoke execute on function public.pending_receipt_count() from anon;
revoke execute on function public.pending_receipt_count() from authenticated;

revoke execute on function public.pending_receipt_downloads(integer) from public;
revoke execute on function public.pending_receipt_downloads(integer) from anon;
revoke execute on function public.pending_receipt_downloads(integer) from authenticated;

revoke execute on function public.match_opos_whitelist(text, text, text, text) from public;
revoke execute on function public.match_opos_whitelist(text, text, text, text) from anon;
revoke execute on function public.match_opos_whitelist(text, text, text, text) from authenticated;

revoke execute on function public.is_invoice_reconciled(uuid) from public;
revoke execute on function public.is_invoice_reconciled(uuid) from anon;
revoke execute on function public.is_invoice_reconciled(uuid) from authenticated;

revoke execute on function public.tenant_banking_provider() from public;
revoke execute on function public.tenant_banking_provider() from anon;
revoke execute on function public.tenant_banking_provider() from authenticated;

revoke execute on function public.tenant_card_provider() from public;
revoke execute on function public.tenant_card_provider() from anon;
revoke execute on function public.tenant_card_provider() from authenticated;

revoke execute on function public.tenant_locale_settings() from public;
revoke execute on function public.tenant_locale_settings() from anon;
revoke execute on function public.tenant_locale_settings() from authenticated;

revoke execute on function public.tenant_tax_regime() from public;
revoke execute on function public.tenant_tax_regime() from anon;
revoke execute on function public.tenant_tax_regime() from authenticated;

revoke execute on function public.reset_onboarding_demo_data() from public;
revoke execute on function public.reset_onboarding_demo_data() from anon;
revoke execute on function public.reset_onboarding_demo_data() from authenticated;

commit;
