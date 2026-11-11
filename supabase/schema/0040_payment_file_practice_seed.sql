-- Finishes the payment-file practice tour (payment-file-practice-task.ts, migration e85e471): the
-- task steps were written and committed, but nothing ever seeded the one payable invoice, its
-- confirmed bank account, or the payer account the tour walks through — so the tour could never
-- actually be completed.
--
-- seedPracticeData() (seed_onboarding_demo_data) always runs before this one, per
-- OnboardingPracticeStart's own start/resume/restart sequence, so the demo company already exists
-- by the time this runs — this reads it, it does not create its own.
--
-- Returns the seeded document's id, the same shape seedStopCasesPracticeData's caller expects, so
-- restart/resume can validate and clean up through the existing generic
-- findLivePracticeDocumentIds/discardPracticeDocuments (is_demo + demo_owner_user_id is all those
-- need, nothing payment-file-specific). Any payment file a previous run built against that
-- document is reset to 'discarded' on every call, so a restart does not leave a stray draft or
-- generated file sitting in the history/track views.

begin;

create or replace function public.seed_payment_file_practice_data() returns uuid[]
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_tag text;
  v_company_id uuid;
  v_supplier_id uuid;
  v_bank_account_id uuid;
  v_document_id uuid;
begin
  if v_user_id is null then
    raise exception 'seed_payment_file_practice_data: no signed-in app user';
  end if;

  v_tag := substr(replace(v_user_id::text, '-', ''), 1, 8);

  select id into v_company_id from public.companies
   where is_demo and demo_owner_user_id = v_user_id and code = 'DEMO-' || v_tag;
  if v_company_id is null then
    raise exception 'seed_payment_file_practice_data: no demo company for user %, seedPracticeData should have run first', v_user_id;
  end if;

  select id into v_supplier_id from public.suppliers
   where is_demo and demo_owner_user_id = v_user_id and name = 'Dachdecker Brandt';
  if v_supplier_id is not null then
    update public.suppliers set deleted_at = null where id = v_supplier_id and deleted_at is not null;
  else
    insert into public.suppliers (name, is_demo, demo_owner_user_id)
    values ('Dachdecker Brandt', true, v_user_id)
    returning id into v_supplier_id;
  end if;

  select id into v_bank_account_id from public.supplier_bank_accounts
   where supplier_id = v_supplier_id and iban = 'DE89370400440532013000';
  if v_bank_account_id is not null then
    update public.supplier_bank_accounts
       set deleted_at = null, is_active = true, is_payable = true,
           confirmed_at = coalesce(confirmed_at, now())
     where id = v_bank_account_id;
  else
    insert into public.supplier_bank_accounts (
      supplier_id, iban, bic, source, is_active, is_payable, confirmed_at
    )
    values (
      v_supplier_id, 'DE89370400440532013000', 'COBADEFFXXX', 'human', true, true, now()
    )
    returning id into v_bank_account_id;
  end if;

  select id into v_document_id from public.documents
   where is_demo and demo_owner_user_id = v_user_id
     and payment_reference = 'BRANDT RE 2026-2201 890,00';
  if v_document_id is not null then
    update public.documents
       set deleted_at = null, company_id = v_company_id, supplier_id = v_supplier_id,
           workflow_status = 'approved_final', paid_at = null,
           due_date = current_date + 4
     where id = v_document_id;
  else
    insert into public.documents (
      issuer, supplier_id, invoice_number, document_date, due_date,
      amount_net, vat_rate, vat_amount, amount_gross, currency,
      payment_reference, payment_method, workflow_status,
      company_id, is_invoice, is_demo, demo_owner_user_id
    )
    values (
      'Dachdecker Brandt', v_supplier_id, 'RE-2026-2201', current_date - 10, current_date + 4,
      747.90, 19, 142.10, 890.00, 'EUR',
      'BRANDT RE 2026-2201 890,00', 'transfer', 'approved_final',
      v_company_id, true, true, v_user_id
    )
    returning id into v_document_id;
  end if;

  insert into public.document_bank_accounts (document_id, supplier_bank_account_id, position)
  select v_document_id, v_bank_account_id, 1
   where not exists (
     select 1 from public.document_bank_accounts
      where document_id = v_document_id and supplier_bank_account_id = v_bank_account_id
   );

  if not exists (select 1 from public.payment_settings where company_id = v_company_id) then
    insert into public.payment_settings (company_id, label, payer_name, payer_iban, is_default)
    values (v_company_id, 'Demo-Geschäftskonto', 'Demo Immobilien GmbH', 'DE02500105174917781216', true);
  end if;

  update public.payment_files f
     set status = 'discarded'
    from public.payment_file_items i
   where i.payment_file_id = f.id
     and i.document_id = v_document_id
     and f.status <> 'discarded';

  return array[v_document_id];
end $$;

revoke execute on function public.seed_payment_file_practice_data() from public, anon;
grant execute on function public.seed_payment_file_practice_data() to authenticated;

commit;
