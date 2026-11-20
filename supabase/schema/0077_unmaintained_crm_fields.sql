-- The four fields section 4.4 names: the realised price, the sale date and either commission rate.
-- One list, read by the overview screen as the caller and by the reminder as the service role, so
-- the screen and the reminder can never disagree about what counts as unmaintained.

begin;

alter table public.deals
    add column if not exists crm_fields_notified_at timestamptz;

create or replace function public.deal_unmaintained_fields(p_deal_id uuid) returns text[]
language sql stable security invoker set search_path to 'public'
as $$
  select coalesce(array_agg(field order by field), '{}')
    from (
      select 'purchase_price' as field
        from public.deals d where d.id = p_deal_id and d.purchase_price is null
      union all
      select 'notarised_on'
        from public.deals d where d.id = p_deal_id and d.notarised_on is null
      union all
      select case s.side when 'buyer' then 'buyer_rate' else 'seller_rate' end
        from public.deal_sides s
       where s.deal_id = p_deal_id and s.fee_kind = 'percent' and s.fee_net_rate is null
    ) missing;
$$;

revoke execute on function public.deal_unmaintained_fields(uuid) from public, anon;
grant execute on function public.deal_unmaintained_fields(uuid) to authenticated;

create or replace view public.v_deals_with_unmaintained_fields
with (security_invoker = true) as
  select d.id as deal_id,
         d.property_id,
         d.property_label,
         p.external_id as property_external_id,
         d.notarised_on,
         d.status,
         public.deal_unmaintained_fields(d.id) as missing_fields
    from public.deals d
    left join public.properties p on p.id = d.property_id
   where d.deleted_at is null
     and cardinality(public.deal_unmaintained_fields(d.id)) > 0;

revoke all on public.v_deals_with_unmaintained_fields from anon;
grant select on public.v_deals_with_unmaintained_fields to authenticated;

create or replace function public.notify_unmaintained_crm_fields() returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select array_agg(d.id) into v_ids
    from public.deals d
   where d.deleted_at is null
     and d.crm_fields_notified_at is null
     and cardinality(public.deal_unmaintained_fields(d.id)) > 0;
  v_count := coalesce(cardinality(v_ids), 0);
  if v_count = 0 then
    return 0;
  end if;

  perform public.notify_administrators(
    case when v_count = 1 then 'Bei einem Verkauf fehlen Felder aus PropStack'
         else 'Bei ' || v_count || ' Verkäufen fehlen Felder aus PropStack' end,
    '/unmaintained-fields', 'reminder');

  update public.deals set crm_fields_notified_at = now() where id = any (v_ids);

  return v_count;
end;
$$;

revoke execute on function public.notify_unmaintained_crm_fields() from public, anon, authenticated;
grant execute on function public.notify_unmaintained_crm_fields() to service_role;

commit;
