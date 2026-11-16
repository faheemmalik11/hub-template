begin;

create or replace function public.create_deals_for_sold_properties(
    p_sold_statuses text[] default array['Verkauft', 'Abgeschlossen']
)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_switched_on timestamptz;
  v_created integer := 0;
  v_deal record;
begin
  if not exists (select 1 from public.live_features() f where f.key = 'deals.from_crm') then
    return 0;
  end if;

  select updated_at into v_switched_on
    from public.feature_settings where feature_key = 'deals.from_crm' and enabled;
  if v_switched_on is null then
    return 0;
  end if;

  for v_deal in
    with opened as (
      insert into public.deals (
          company_id, property_id, property_label, source, external_id, status,
          notarised_on, purchase_price, acquired_by, handled_by, created_by)
      select (select c.id from public.companies c where c.deleted_at is null order by c.created_at limit 1),
             p.id,
             concat_ws(', ', coalesce(p.name, p.code), p.address),
             p.source, p.external_id, 'incomplete',
             coalesce(p.sold_on, (p.became_sold_at at time zone 'Europe/Berlin')::date),
             nullif(p.sold_price, 0),
             b.id, b.id, 'crm'
        from public.properties p
        left join public.app_users b
               on b.crm_external_id = p.broker_external_id and b.is_active
       where p.deleted_at is null
         and p.crm_status = any(p_sold_statuses)
         and p.became_sold_at >= v_switched_on
         and p.external_id is not null
      on conflict (source, external_id) where external_id is not null do nothing
      returning id, property_id, property_label, acquired_by
    )
    select * from opened
  loop
    v_created := v_created + 1;

    insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
    select v_deal.id, side.name,
           case when side.gross_rate is null and side.gross_amount is not null then 'fixed'
                else 'percent' end,
           case when side.gross_rate is not null or side.gross_amount is null
                then public.crm_net_rate(side.gross_rate, d.vat_rate) end,
           case when side.gross_rate is null and side.gross_amount is not null
                then public.crm_net_amount(side.gross_amount, d.vat_rate) end
      from public.deals d
      join public.properties p on p.id = v_deal.property_id
      cross join lateral (values
        ('buyer',
         public.crm_rate(p.crm_data ->> 'external_commission_percentage'),
         public.crm_rate(p.crm_data ->> 'external_commission')),
        ('seller',
         public.crm_rate(p.crm_data ->> 'internal_commission_percentage'),
         public.crm_rate(p.crm_data ->> 'internal_commission'))
      ) as side(name, gross_rate, gross_amount)
     where d.id = v_deal.id;

    update public.deals
       set note = 'Provisionssätze aus dem CRM übernommen (Bruttosätze auf netto umgerechnet). Bitte prüfen.'
     where id = v_deal.id;

    perform public.notify_administrators(
      'Verkauft im CRM: ' || coalesce(v_deal.property_label, 'Objekt')
        || '. Die Provision wartet auf Vervollständigung.',
      '/commission-deals/' || v_deal.id, 'crm', v_deal.acquired_by);
    if v_deal.acquired_by is not null then
      perform public.send_system_ping(
        v_deal.acquired_by, 'Hub',
        'Verkauft im CRM: ' || coalesce(v_deal.property_label, 'Objekt')
          || '. Die Provision wartet auf Vervollständigung.',
        '/commission-deals/' || v_deal.id, 'crm');
    end if;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.create_deals_for_sold_properties(text[]) from public, anon, authenticated;
grant execute on function public.create_deals_for_sold_properties(text[]) to service_role;

commit;
