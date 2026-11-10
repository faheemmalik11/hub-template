-- The "process an invoice" practice task calls seed_onboarding_demo_data() before it starts, to
-- create the company, property, supplier and bank transactions the sample invoice gets assigned
-- and matched against. The practice-mode-for-an-existing-client.sql preset ported the mechanism
-- (is_demo flags, practice_mode_active(), reset_onboarding_demo_data(), the RLS policies) but
-- deliberately not any seed scenario, by its own header. Without this function the RPC 404s, the
-- practice task silently seeds nothing, and "Start the practice" does nothing visible. Paste into
-- the Supabase SQL editor as the database owner; safe to run twice. Requires
-- practice-mode-for-an-existing-client.sql to already be applied (is_demo columns, demo_owner_user_id).
--
-- Codes are derived from the caller's id the same way the front end derives them
-- (demoCompanyAndPropertyCodes in src/features/onboarding-practice/practice-placeholder-values.ts),
-- so this is idempotent per person. No client name or real data: the company, property and
-- supplier are placeholders, and the bank transaction amounts/references match what
-- src/features/onboarding-practice/practice-invoice-task.ts expects the sample invoice to say.

begin;

-- The one scenario the "process an invoice" practice task walks through: a company and a property
-- to assign the uploaded sample invoice to, a supplier matching its issuer, and two bank
-- transactions (one correct, one a close decoy) for the bank-matching step to offer as candidates.
-- Codes are derived from the caller's id the same way the front end derives them
-- (demoCompanyAndPropertyCodes), so re-running this is idempotent per person.
CREATE OR REPLACE FUNCTION public.seed_onboarding_demo_data() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_tag text;
  v_company_id uuid;
  v_property_id uuid;
  v_supplier_id uuid;
begin
  if v_user_id is null then
    raise exception 'seed_onboarding_demo_data: no signed-in app user';
  end if;

  v_tag := substr(replace(v_user_id::text, '-', ''), 1, 8);

  select id into v_company_id from public.companies
   where is_demo and demo_owner_user_id = v_user_id and code = 'DEMO-' || v_tag;
  if v_company_id is not null then
    update public.companies set deleted_at = null where id = v_company_id and deleted_at is not null;
  else
    insert into public.companies (code, name, is_demo, demo_owner_user_id)
    values ('DEMO-' || v_tag, 'Demo Immobilien GmbH', true, v_user_id)
    returning id into v_company_id;
  end if;

  select id into v_property_id from public.properties
   where is_demo and demo_owner_user_id = v_user_id and code = 'DEMO-' || v_tag || '-P1';
  if v_property_id is not null then
    update public.properties set deleted_at = null where id = v_property_id and deleted_at is not null;
  else
    insert into public.properties (code, name, address, is_demo, demo_owner_user_id)
    values ('DEMO-' || v_tag || '-P1', 'Musterstrasse 12',
            'Musterstrasse 12, 20535 Hamburg', true, v_user_id)
    returning id into v_property_id;
  end if;

  insert into public.property_companies (property_id, company_id)
  select v_property_id, v_company_id
   where not exists (
     select 1 from public.property_companies pc
      where pc.property_id = v_property_id and pc.company_id = v_company_id and pc.deleted_at is null
   );

  select id into v_supplier_id from public.suppliers
   where is_demo and demo_owner_user_id = v_user_id;
  if v_supplier_id is not null then
    update public.suppliers set deleted_at = null where id = v_supplier_id and deleted_at is not null;
  else
    insert into public.suppliers (name, is_demo, demo_owner_user_id)
    values ('Gartenbau Möller', true, v_user_id)
    returning id into v_supplier_id;
  end if;

  if not exists (
    select 1 from public.bank_transactions
     where is_demo and demo_owner_user_id = v_user_id
       and payment_reference = 'MOELLER GARTENBAU RE 2026-1043 487,90'
  ) then
    insert into public.bank_transactions (
      amount, currency, booking_date, value_date, payment_reference, booking_text,
      counterparty_holder, source, is_demo, demo_owner_user_id
    )
    values (
      -487.90, 'EUR', current_date, current_date,
      'MOELLER GARTENBAU RE 2026-1043 487,90', 'MOELLER GARTENBAU RE 2026-1043 487,90',
      'Gartenbau Möller', 'manual', true, v_user_id
    );
  end if;

  if not exists (
    select 1 from public.bank_transactions
     where is_demo and demo_owner_user_id = v_user_id
       and payment_reference = 'MOELLER GARTENBAU RE 2026-0987 478,90'
  ) then
    insert into public.bank_transactions (
      amount, currency, booking_date, value_date, payment_reference, booking_text,
      counterparty_holder, source, is_demo, demo_owner_user_id
    )
    values (
      -478.90, 'EUR', current_date - 28, current_date - 28,
      'MOELLER GARTENBAU RE 2026-0987 478,90', 'MOELLER GARTENBAU RE 2026-0987 478,90',
      'Gartenbau Möller', 'manual', true, v_user_id
    );
  end if;
end $$;

commit;
