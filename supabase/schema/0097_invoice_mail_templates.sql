-- Fabian's 23 November message, section F: three invoice mail texts, picked by side (buyer or
-- seller) and the realised price against the existing donation threshold
-- (donation_settings.threshold_amount -- Text 3 is specifically about the donation program, so one
-- setting rather than a second €500,000 that could drift out of step with the first). Sending stays
-- manual and outside the Hub; this only resolves which text belongs on a given commission invoice
-- and shows it to whoever is sending it.

begin;

create table if not exists public.invoice_mail_templates (
    case_key text primary key
        check (case_key in ('buyer', 'seller_under_threshold', 'seller_over_threshold')),
    subject text not null default '',
    body text not null default '',
    updated_at timestamptz not null default now(),
    updated_by uuid references public.app_users(id)
);

insert into public.invoice_mail_templates (case_key) values
    ('buyer'),
    ('seller_under_threshold'),
    ('seller_over_threshold')
on conflict (case_key) do nothing;

drop trigger if exists invoice_mail_templates_touch on public.invoice_mail_templates;
create trigger invoice_mail_templates_touch before update on public.invoice_mail_templates
    for each row execute function public.set_updated_at();

alter table public.invoice_mail_templates enable row level security;

-- Same two capabilities every other invoice-defaults table already uses (see the
-- documents.read/settings.manage group in 0010_access.sql): anyone who can see invoices can read
-- the texts, only someone who can change the setup can edit them.
drop policy if exists invoice_mail_templates_read on public.invoice_mail_templates;
create policy invoice_mail_templates_read on public.invoice_mail_templates for select to authenticated
    using (public.may_read('documents.read'));

drop policy if exists invoice_mail_templates_write on public.invoice_mail_templates;
create policy invoice_mail_templates_write on public.invoice_mail_templates for all to authenticated
    using (public.may_write('settings.manage'))
    with check (public.may_write('settings.manage'));

grant select, update on public.invoice_mail_templates to authenticated;

-- Resolves which of the three texts belongs to a commission invoice. security invoker, not
-- definer: a caller who cannot see the invoice (or its deal/side) cannot read its mail text either,
-- the join simply returns nothing rather than needing its own separate check.
create or replace function public.outgoing_invoice_mail_text(p_invoice_id uuid)
returns table (case_key text, subject text, body text)
language plpgsql stable security invoker set search_path to 'public'
as $$
declare
  v_side text;
  v_purchase_price numeric;
  v_threshold numeric;
  v_case text;
begin
  select ds.side, d.purchase_price
    into v_side, v_purchase_price
    from public.outgoing_invoices oi
    join public.deal_parties dp on dp.id = oi.deal_party_id
    join public.deal_sides ds on ds.id = dp.deal_side_id
    join public.deals d on d.id = oi.deal_id
   where oi.id = p_invoice_id and oi.kind = 'commission';

  if v_side is null then
    return;
  end if;

  select threshold_amount into v_threshold from public.donation_settings;

  v_case := case
    when v_side = 'buyer' then 'buyer'
    when v_purchase_price is not null and v_purchase_price >= coalesce(v_threshold, 500000)
      then 'seller_over_threshold'
    else 'seller_under_threshold'
  end;

  return query
    select t.case_key, t.subject, t.body
      from public.invoice_mail_templates t
     where t.case_key = v_case;
end;
$$;

revoke execute on function public.outgoing_invoice_mail_text(uuid) from public, anon;
grant execute on function public.outgoing_invoice_mail_text(uuid) to authenticated;

commit;
