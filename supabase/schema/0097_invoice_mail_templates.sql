-- Fabian's 23 November message, section F: invoice mail texts, picked by side (buyer or seller)
-- and the realised price against the existing donation threshold (donation_settings.threshold_amount
-- -- Text 3 is specifically about the donation program, so one setting rather than a second
-- €500,000 that could drift out of step with the first). Sending stays manual and outside the Hub;
-- this only resolves which text belongs on a given commission invoice and shows it to whoever is
-- sending it.
--
-- Started as exactly three fixed cases (buyer / seller-under / seller-over), one row each. Reworked
-- the same day into any number of named templates per side+condition, so a client can add their own
-- variants without a migration -- the auto-selection just takes whichever one was touched last.

begin;

create table if not exists public.invoice_mail_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    side text not null check (side in ('buyer', 'seller')),
    condition text not null default 'all'
        check (condition in ('all', 'below_threshold', 'at_or_above_threshold')),
    subject text not null default '',
    body text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by uuid references public.app_users(id)
);

insert into public.invoice_mail_templates (name, side, condition)
select v.name, v.side, v.condition
  from (values
    ('Buyer', 'buyer', 'all'),
    ('Seller, under the threshold', 'seller', 'below_threshold'),
    ('Seller, at or above the threshold', 'seller', 'at_or_above_threshold')
  ) as v(name, side, condition)
where not exists (select 1 from public.invoice_mail_templates);

drop trigger if exists invoice_mail_templates_touch on public.invoice_mail_templates;
create trigger invoice_mail_templates_touch before update on public.invoice_mail_templates
    for each row execute function public.set_updated_at();

alter table public.invoice_mail_templates enable row level security;

-- Same two capabilities every other invoice-defaults table already uses (see the
-- documents.read/settings.manage group in 0010_access.sql): anyone who can see invoices can read
-- the texts, only someone who can change the setup can add, edit or delete one.
drop policy if exists invoice_mail_templates_read on public.invoice_mail_templates;
create policy invoice_mail_templates_read on public.invoice_mail_templates for select to authenticated
    using (public.may_read('documents.read'));

drop policy if exists invoice_mail_templates_write on public.invoice_mail_templates;
create policy invoice_mail_templates_write on public.invoice_mail_templates for all to authenticated
    using (public.may_write('settings.manage'))
    with check (public.may_write('settings.manage'));

grant select, insert, update, delete on public.invoice_mail_templates to authenticated;

-- Resolves which template applies to a commission invoice, and fills in the variables that invoice
-- can actually supply: {{invoice_number}}, {{invoice_amount}}, and whichever of {{buyer_name}} /
-- {{seller_name}} matches this invoice's own side (the other resolves empty, since a single
-- invoice only ever has one recipient). security invoker, not definer: a caller who cannot see the
-- invoice (or its deal/side) cannot read its mail text either, the join simply returns nothing
-- rather than needing its own separate check. When more than one template matches the same side and
-- condition, the most recently touched one wins -- creating a better replacement is how you retire
-- an old one, no delete required.
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
