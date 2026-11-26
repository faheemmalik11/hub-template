begin;

alter table public.invoice_mail_templates
    add column if not exists id uuid default gen_random_uuid(),
    add column if not exists name text,
    add column if not exists side text,
    add column if not exists condition text default 'all',
    add column if not exists created_at timestamptz default now();

update public.invoice_mail_templates set
    name = case case_key
        when 'buyer' then 'Buyer'
        when 'seller_under_threshold' then 'Seller, under the threshold'
        when 'seller_over_threshold' then 'Seller, at or above the threshold'
        else case_key
    end,
    side = case
        when case_key = 'buyer' then 'buyer'
        else 'seller'
    end,
    condition = case case_key
        when 'buyer' then 'all'
        when 'seller_under_threshold' then 'below_threshold'
        when 'seller_over_threshold' then 'at_or_above_threshold'
        else 'all'
    end
where name is null;

alter table public.invoice_mail_templates
    alter column id set not null,
    alter column name set not null,
    alter column side set not null,
    alter column condition set not null,
    alter column created_at set not null;

alter table public.invoice_mail_templates drop constraint if exists invoice_mail_templates_pkey;
alter table public.invoice_mail_templates add primary key (id);

alter table public.invoice_mail_templates drop constraint if exists invoice_mail_templates_case_key_check;
alter table public.invoice_mail_templates drop column if exists case_key;

alter table public.invoice_mail_templates
    add constraint invoice_mail_templates_side_check check (side in ('buyer', 'seller')),
    add constraint invoice_mail_templates_condition_check
        check (condition in ('all', 'below_threshold', 'at_or_above_threshold'));

grant insert, delete on public.invoice_mail_templates to authenticated;

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
  v_invoice_number text;
  v_amount_gross numeric;
  v_template public.invoice_mail_templates;
  v_subject text;
  v_body text;
  v_buyer_name text;
  v_seller_name text;
  v_amount_text text;
begin
  select ds.side, d.purchase_price, oi.invoice_number, oi.amount_gross, c.name
    into v_side, v_purchase_price, v_invoice_number, v_amount_gross, v_customer_name
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

  v_buyer_name := case when v_side = 'buyer' then coalesce(v_customer_name, '') else '' end;
  v_seller_name := case when v_side = 'seller' then coalesce(v_customer_name, '') else '' end;
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

revoke execute on function public.outgoing_invoice_mail_text(uuid) from public, anon;
grant execute on function public.outgoing_invoice_mail_text(uuid) to authenticated;

commit;
