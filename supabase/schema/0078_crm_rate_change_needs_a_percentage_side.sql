-- A rate change the CRM reports cannot be applied to a side billed as a fixed amount: there is no
-- percentage on that side to overwrite. It used to be skipped silently while the deal was still
-- stamped as reconciled, so the change left the screen without ever being applied.

begin;

create or replace function public.acknowledge_deal_crm_changes(p_deal_id uuid) returns void
    language plpgsql security definer set search_path to 'public'
as $$
declare
  v_deal public.deals;
  v_change record;
  v_invoices text;
begin
  if not public.owns_deal(p_deal_id) and not public.has_permission('invoices.approve') then
    raise exception 'not allowed to acknowledge this deal' using errcode = '42501';
  end if;

  select * into v_deal from public.deals where id = p_deal_id and property_id is not null;
  if not found then
    return;
  end if;

  select string_agg(coalesce(invoice_number, id::text), ', ' order by invoice_number)
    into v_invoices
    from public.outgoing_invoices
   where deal_id = p_deal_id and kind = 'commission' and deleted_at is null;

  if v_invoices is not null then
    raise exception
      'acknowledge_deal_crm_changes: commission invoices % already exist for this deal', v_invoices
      using errcode = 'check_violation';
  end if;

  for v_change in select * from public.deal_crm_changes(p_deal_id) loop
    if v_change.field in ('buyer_rate', 'seller_rate')
       and exists (
         select 1 from public.deal_sides s
          where s.deal_id = p_deal_id
            and s.side = (case v_change.field when 'buyer_rate' then 'buyer' else 'seller' end)
            and s.fee_kind <> 'percent'
       ) then
      raise exception
        'acknowledge_deal_crm_changes: the % side is billed as a fixed amount, so the new rate cannot be applied', 
        (case v_change.field when 'buyer_rate' then 'buyer' else 'seller' end)
        using errcode = 'check_violation';
    end if;
  end loop;

  for v_change in select * from public.deal_crm_changes(p_deal_id) loop
    if v_change.field = 'sold_on' then
      update public.deals set notarised_on = nullif(v_change.became, '')::date
       where id = p_deal_id;
    elsif v_change.field = 'sold_price' then
      update public.deals set purchase_price = nullif(v_change.became, '')::numeric
       where id = p_deal_id;
    elsif v_change.field in ('buyer_rate', 'seller_rate') then
      update public.deal_sides
         set fee_net_rate = public.crm_net_rate(nullif(v_change.became, '')::numeric, v_deal.vat_rate)
       where deal_id = p_deal_id
         and side = (case v_change.field when 'buyer_rate' then 'buyer' else 'seller' end)
         and fee_kind = 'percent';
    end if;
  end loop;

  update public.deals
     set crm_snapshot = public.crm_facts_of(property_id),
         crm_changes_acknowledged_at = now()
   where id = p_deal_id
     and property_id is not null;
end;
$$;

revoke execute on function public.acknowledge_deal_crm_changes(uuid) from public, anon;
grant execute on function public.acknowledge_deal_crm_changes(uuid) to authenticated;

commit;
