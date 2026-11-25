begin;

alter table public.invoice_settings
    add column if not exists buyer_payment_term_days integer;

alter table public.invoice_settings
    drop constraint if exists invoice_settings_buyer_payment_term_days_sane;

alter table public.invoice_settings
    add constraint invoice_settings_buyer_payment_term_days_sane
    check (buyer_payment_term_days is null
        or (buyer_payment_term_days >= 0 and buyer_payment_term_days <= 365));

comment on column public.invoice_settings.buyer_payment_term_days is
    'How many days after the invoice date the buyer side is due. Null means the same due date as the seller side.';

CREATE OR REPLACE FUNCTION public.create_deal_invoices(p_deal_id uuid, p_invoices jsonb)
    RETURNS SETOF public.outgoing_invoices
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
declare
  v_deal public.deals;
  v_invoice_date date;
  v_property_due_date date;
  v_buyer_payment_term_days integer;
  v_item jsonb;
  v_side text;
  v_due_date date;
begin
  select * into v_deal from public.deals where id = p_deal_id and deleted_at is null;
  if not found then
    raise exception 'create_deal_invoices: deal % not found', p_deal_id;
  end if;
  if v_deal.status <> 'approved' then
    raise exception 'create_deal_invoices: deal % is not approved', p_deal_id
      using errcode = 'check_violation';
  end if;

  select p.payment_due_date into v_property_due_date
    from public.properties p where p.id = v_deal.property_id;

  select buyer_payment_term_days into v_buyer_payment_term_days
    from public.invoice_settings where id = true;

  v_invoice_date := coalesce(v_deal.notarised_on, current_date);

  for v_item in select * from jsonb_array_elements(p_invoices) loop
    select ds.side into v_side
      from public.deal_parties dp
      join public.deal_sides ds on ds.id = dp.deal_side_id
      where dp.id = (v_item ->> 'deal_party_id')::uuid;

    v_due_date := case
      when v_side = 'buyer' and v_buyer_payment_term_days is not null
        then v_invoice_date + v_buyer_payment_term_days
      else v_property_due_date
    end;

    insert into public.outgoing_invoices (
      company_id, customer_id, deal_party_id, kind, deal_id,
      status, invoice_date, due_date, amount_net, amount_gross
    ) values (
      v_deal.company_id,
      (v_item ->> 'customer_id')::uuid,
      (v_item ->> 'deal_party_id')::uuid,
      'commission',
      p_deal_id,
      'draft',
      v_invoice_date,
      v_due_date,
      (v_item ->> 'amount_net')::numeric,
      (v_item ->> 'amount_gross')::numeric
    );
  end loop;

  update public.deals set status = 'invoiced' where id = p_deal_id;

  return query select * from public.outgoing_invoices
    where deal_id = p_deal_id and kind = 'commission';
end;
$$;

REVOKE ALL ON FUNCTION public.create_deal_invoices(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_deal_invoices(uuid, jsonb) TO authenticated;

commit;
