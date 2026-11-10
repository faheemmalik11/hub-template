-- The "when does the system stop" practice task calls seed_stop_cases_practice_data() before it
-- starts, to create the three documents (a changed bank account, an AI-misread amount, a document
-- that is not an invoice) it walks the practice through. Without this function the RPC 404s, and
-- "Start the practice" turns practice mode on with nothing to show for it. Paste into the Supabase
-- SQL editor as the database owner; safe to run twice. Requires
-- practice-mode-for-an-existing-client.sql and onboarding-demo-scenario-for-an-existing-client.sql
-- to already be applied (is_demo columns, demo_owner_user_id, current_app_user_id()).
--
-- No client name or real data: the supplier, its two bank accounts and the three documents are
-- placeholders, scoped to the caller the same way the other practice seed function is
-- (demo_owner_user_id), so this is idempotent per person. p_reset is always true from the one
-- caller this has (seedStopCasesPracticeData) and resets whatever a previous run of the practice
-- confirmed, corrected or set aside, so a restart always starts from the same unsolved state.

begin;

CREATE OR REPLACE FUNCTION public.seed_stop_cases_practice_data(p_reset boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_supplier_id uuid;
  v_new_account_id uuid;
  v_iban_doc_id uuid;
  v_ai_doc_id uuid;
  v_flyer_doc_id uuid;
begin
  if v_user_id is null then
    raise exception 'seed_stop_cases_practice_data: no signed-in app user';
  end if;

  select id into v_supplier_id from public.suppliers
   where is_demo and demo_owner_user_id = v_user_id and name = 'Stadtwerke Nord GmbH';
  if v_supplier_id is not null then
    update public.suppliers set deleted_at = null where id = v_supplier_id and deleted_at is not null;
  else
    insert into public.suppliers (name, is_demo, demo_owner_user_id)
    values ('Stadtwerke Nord GmbH', true, v_user_id)
    returning id into v_supplier_id;
  end if;

  -- The account already on file. trg_supplier_default_account_sync copies this onto
  -- suppliers.iban/bic/bank_name, so nothing writes that column directly.
  insert into public.supplier_bank_accounts (
    supplier_id, iban, bic, bank_name, source, is_active, is_default, is_payable,
    confirmed_at, confirmed_by
  )
  values (
    v_supplier_id, 'DE89370400440532013000', 'COBADEFFXXX', 'Commerzbank',
    'human', true, true, true, now(), 'system'
  )
  on conflict (supplier_id, iban) do update
     set is_active = true, is_default = true, is_payable = true,
         confirmed_at = coalesce(public.supplier_bank_accounts.confirmed_at, now()),
         deleted_at = null, deleted_by = null, delete_reason = null;

  -- The account this one practice invoice names. Left unconfirmed on every (re)start: a previous
  -- run may have confirmed it, and the practice is meant to offer the same choice again.
  insert into public.supplier_bank_accounts (
    supplier_id, iban, bic, bank_name, source, is_active, is_default, is_payable,
    confirmed_at, confirmed_by, first_seen_at
  )
  values (
    v_supplier_id, 'DE12500105170648489890', 'INGDDEFFXXX', 'ING-DiBa',
    'pipeline', true, false, true, null, null, now()
  )
  on conflict (supplier_id, iban) do update
     set is_active = true, is_payable = true, confirmed_at = null, confirmed_by = null,
         deleted_at = null, deleted_by = null, delete_reason = null
  returning id into v_new_account_id;

  -- 1) The changed-bank-account invoice. document_bank_accounts is what makes
  -- useInvoiceBankAccounts say this account came off the document rather than off the supplier.
  select id into v_iban_doc_id from public.documents
   where is_demo and demo_owner_user_id = v_user_id and invoice_number = 'STOP-IBAN-1';
  if v_iban_doc_id is not null then
    update public.documents set deleted_at = null where id = v_iban_doc_id and deleted_at is not null;
  else
    insert into public.documents (
      document_type, is_invoice, intake_channel, source, status, workflow_status,
      issuer, supplier_id, invoice_number, document_date, due_date,
      amount_net, vat_rate, vat_amount, amount_gross, currency,
      is_demo, demo_owner_user_id
    )
    values (
      'rechnung', true, 'upload', 'manual', 'needs_review', 'received',
      'Stadtwerke Nord GmbH', v_supplier_id, 'STOP-IBAN-1', current_date - 10, current_date + 20,
      150.00, 19, 28.50, 178.50, 'EUR',
      true, v_user_id
    )
    returning id into v_iban_doc_id;
  end if;

  insert into public.document_bank_accounts (document_id, supplier_bank_account_id, position, origin)
  values (v_iban_doc_id, v_new_account_id, 1, 'invoice')
  on conflict (document_id, supplier_bank_account_id) do nothing;
  -- Drop any other link a previous run left (e.g. the confirmed account, once this one has been
  -- confirmed too), so the practice invoice always names exactly the one account under test.
  delete from public.document_bank_accounts
   where document_id = v_iban_doc_id and supplier_bank_account_id <> v_new_account_id;

  -- 2) The AI-misread invoice. vat_amount and amount_gross already agree with the CORRECT net
  -- (STOP_CASES_CORRECT_NET_AMOUNT in practice-stop-cases-task.ts), so correcting amount_net is
  -- the one edit that makes documentUpdatedEventData's amounts_add_up true.
  select id into v_ai_doc_id from public.documents
   where is_demo and demo_owner_user_id = v_user_id and invoice_number = 'STOP-AI-1';
  if v_ai_doc_id is not null then
    update public.documents
       set deleted_at = null, amount_net = 1200.00, amount_gross = 1475.60
     where id = v_ai_doc_id;
  else
    insert into public.documents (
      document_type, is_invoice, intake_channel, source, status, workflow_status,
      issuer, invoice_number, document_date, due_date,
      amount_net, vat_rate, vat_amount, amount_gross, currency,
      is_demo, demo_owner_user_id
    )
    values (
      'rechnung', true, 'upload', 'manual', 'needs_review', 'received',
      'Gebäudereinigung Blitz GmbH', 'STOP-AI-1', current_date - 5, current_date + 25,
      1200.00, 19, 235.60, 1475.60, 'EUR',
      true, v_user_id
    )
    returning id into v_ai_doc_id;
  end if;

  -- 3) The not-an-invoice document. Reset back to relevant on every (re)start so "set aside" can
  -- be practiced again.
  select id into v_flyer_doc_id from public.documents
   where is_demo and demo_owner_user_id = v_user_id and invoice_number = 'STOP-FLYER-1';
  if v_flyer_doc_id is not null then
    update public.documents
       set deleted_at = null, not_relevant_at = null, not_relevant_by = null,
           not_relevant_note = null, workflow_status = 'received'
     where id = v_flyer_doc_id;
  else
    insert into public.documents (
      document_type, is_invoice, intake_channel, source, status, workflow_status,
      issuer, invoice_number, document_date,
      is_demo, demo_owner_user_id
    )
    values (
      'werbung', false, 'upload', 'manual', 'needs_review', 'received',
      'Büromöbel Profi Werbung', 'STOP-FLYER-1', current_date - 2,
      true, v_user_id
    )
    returning id into v_flyer_doc_id;
  end if;

  return jsonb_build_object(
    'supplier_id', v_supplier_id,
    'iban_account_id', v_new_account_id,
    'iban_document_id', v_iban_doc_id,
    'ai_document_id', v_ai_doc_id,
    'flyer_document_id', v_flyer_doc_id
  );
end $$;

commit;
