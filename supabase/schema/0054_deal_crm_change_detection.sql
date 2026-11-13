-- A deal is seeded from the CRM once and then completed by a person here, so a plain live
-- comparison cannot tell a CRM change from a human correction. The snapshot is what the CRM said
-- when the deal was opened or last acknowledged, so the comparison is CRM-then against CRM-now and
-- a person's own edits never register as a conflict.

begin;

alter table public.deals
    add column if not exists crm_snapshot jsonb;

alter table public.deals
    add column if not exists crm_changes_acknowledged_at timestamptz;

create or replace function public.crm_facts_of(p_property_id uuid) returns jsonb
    language sql stable set search_path to 'public'
as $$
  select jsonb_build_object(
      'sold_on', p.sold_on,
      'sold_price', nullif(p.sold_price, 0),
      'buyer_rate', public.crm_rate(p.crm_data ->> 'external_commission_percentage'),
      'seller_rate', public.crm_rate(p.crm_data ->> 'internal_commission_percentage'))
    from public.properties p
   where p.id = p_property_id;
$$;

create or replace function public.stamp_deal_crm_snapshot() returns trigger
    language plpgsql set search_path to 'public'
as $$
begin
  if new.crm_snapshot is null and new.property_id is not null then
    new.crm_snapshot := public.crm_facts_of(new.property_id);
  end if;
  return new;
end;
$$;

drop trigger if exists deals_stamp_crm_snapshot on public.deals;
create trigger deals_stamp_crm_snapshot
    before insert on public.deals
    for each row execute function public.stamp_deal_crm_snapshot();

update public.deals
   set crm_snapshot = public.crm_facts_of(property_id)
 where crm_snapshot is null
   and property_id is not null;

create or replace function public.deal_crm_changes(p_deal_id uuid)
returns table(field text, was text, became text)
    language sql stable set search_path to 'public'
as $$
  with deal as (
    select d.crm_snapshot as before, public.crm_facts_of(d.property_id) as after
      from public.deals d
     where d.id = p_deal_id
       and d.property_id is not null
       and d.crm_snapshot is not null
  )
  select each_field,
         nullif(deal.before ->> each_field, ''),
         nullif(deal.after ->> each_field, '')
    from deal
    cross join lateral unnest(array['sold_on', 'sold_price', 'buyer_rate', 'seller_rate'])
      as each_field
   where deal.before ->> each_field is distinct from deal.after ->> each_field;
$$;

revoke execute on function public.crm_facts_of(uuid) from public, anon;
revoke execute on function public.deal_crm_changes(uuid) from public, anon;
grant execute on function public.crm_facts_of(uuid) to authenticated, service_role;
grant execute on function public.deal_crm_changes(uuid) to authenticated, service_role;

create or replace function public.acknowledge_deal_crm_changes(p_deal_id uuid) returns void
    language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.owns_deal(p_deal_id) and not public.has_permission('invoices.approve') then
    raise exception 'not allowed to acknowledge this deal' using errcode = '42501';
  end if;
  update public.deals
     set crm_snapshot = public.crm_facts_of(property_id),
         crm_changes_acknowledged_at = now()
   where id = p_deal_id
     and property_id is not null;
end;
$$;

revoke execute on function public.acknowledge_deal_crm_changes(uuid) from public, anon;
grant execute on function public.acknowledge_deal_crm_changes(uuid) to authenticated;

-- Same guard as 0011_functions.sql, plus the refusal to invoice a deal whose CRM figures moved
-- after it was approved: the amount on the invoice would no longer be the amount that was agreed.
CREATE OR REPLACE FUNCTION public.create_deal_invoices(p_deal_id uuid, p_invoices jsonb)
    RETURNS SETOF public.outgoing_invoices
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
declare
  v_deal public.deals;
  v_due_date date;
  v_item jsonb;
  v_changed text;
begin
  select * into v_deal from public.deals where id = p_deal_id and deleted_at is null;
  if not found then
    raise exception 'create_deal_invoices: deal % not found', p_deal_id;
  end if;
  if v_deal.status <> 'approved' then
    raise exception 'create_deal_invoices: deal % is not approved', p_deal_id
      using errcode = 'check_violation';
  end if;

  select string_agg(field, ', ' order by field) into v_changed
    from public.deal_crm_changes(p_deal_id);
  if v_changed is not null then
    raise exception 'create_deal_invoices: the CRM changed % since this deal was approved', v_changed
      using errcode = 'check_violation';
  end if;

  select p.payment_due_date into v_due_date
    from public.properties p where p.id = v_deal.property_id;

  for v_item in select * from jsonb_array_elements(p_invoices) loop
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
      coalesce(v_deal.notarised_on, current_date),
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
