-- Fabian's 26 November message: {{buyer_name}}/{{seller_name}} in the invoice mail templates were
-- rendering the customer's full name after "Guten Tag", where German business correspondence
-- expects the courtesy form (Herr/Frau). Nothing in the schema holds that today, and it must not
-- be derived from the name -- a person enters it once, same as any other contact detail.

begin;

alter table public.customers
    add column if not exists salutation text;

comment on column public.customers.salutation is
    'The courtesy form of address ("Herr Mueller", "Frau Schmidt"), entered by hand. Falls back to '
    'the customer''s name wherever it is shown, never derived from it.';

create or replace function public.outgoing_invoice_mail_text(p_invoice_id uuid)
returns table (id uuid, name text, subject text, body text)
language plpgsql stable security invoker set search_path to 'public'
as $$
declare
  v_side text;
  v_purchase_price numeric;
  v_threshold numeric;
  v_condition text;
  v_customer_name text;
  v_customer_salutation text;
  v_invoice_number text;
  v_amount_gross numeric;
  v_template public.invoice_mail_templates;
  v_subject text;
  v_body text;
  v_buyer_name text;
  v_seller_name text;
  v_amount_text text;
begin
  select ds.side, d.purchase_price, oi.invoice_number, oi.amount_gross, c.name, c.salutation
    into v_side, v_purchase_price, v_invoice_number, v_amount_gross, v_customer_name, v_customer_salutation
    from public.outgoing_invoices oi
    join public.deal_parties dp on dp.id = oi.deal_party_id
    join public.deal_sides ds on ds.id = dp.deal_side_id
    join public.deals d on d.id = oi.deal_id
    left join public.customers c on c.id = oi.customer_id
   where oi.id = p_invoice_id and oi.kind = 'commission';

  if v_side is null then
    return;
  end if;

  select threshold_amount into v_threshold from public.donation_settings;

  v_condition := case
    when v_side = 'buyer' then 'all'
    when v_purchase_price is not null and v_purchase_price >= coalesce(v_threshold, 500000)
      then 'at_or_above_threshold'
    else 'below_threshold'
  end;

  select * into v_template
    from public.invoice_mail_templates t
   where t.side = v_side
     and (t.condition = 'all' or t.condition = v_condition)
   order by t.updated_at desc
   limit 1;

  if not found then
    return;
  end if;

  v_customer_salutation := nullif(btrim(v_customer_salutation), '');

  v_buyer_name := case when v_side = 'buyer'
    then coalesce(v_customer_salutation, v_customer_name, '') else '' end;
  v_seller_name := case when v_side = 'seller'
    then coalesce(v_customer_salutation, v_customer_name, '') else '' end;
  v_amount_text := coalesce(to_char(v_amount_gross, 'FM999999990.00'), '');

  v_subject := v_template.subject;
  v_body := v_template.body;

  v_subject := replace(v_subject, '{{invoice_number}}', coalesce(v_invoice_number, ''));
  v_body := replace(v_body, '{{invoice_number}}', coalesce(v_invoice_number, ''));
  v_subject := replace(v_subject, '{{invoice_amount}}', v_amount_text);
  v_body := replace(v_body, '{{invoice_amount}}', v_amount_text);
  v_subject := replace(v_subject, '{{buyer_name}}', v_buyer_name);
  v_body := replace(v_body, '{{buyer_name}}', v_buyer_name);
  v_subject := replace(v_subject, '{{seller_name}}', v_seller_name);
  v_body := replace(v_body, '{{seller_name}}', v_seller_name);

  return query select v_template.id, v_template.name, v_subject, v_body;
end;
$$;

commit;
