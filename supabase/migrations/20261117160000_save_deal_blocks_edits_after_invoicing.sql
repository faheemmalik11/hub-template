-- save_deal was missing the guard that stops editing a deal once it has moved past the normal
-- incomplete/ready/approved flow. Without it, editing an already-invoiced deal and saving ran
-- straight into delete from deal_parties, which then failed with a raw foreign-key violation
-- (outgoing_invoices still references those rows) instead of a clean, readable error. Approved
-- stays an allowed source status, since save_deal's own update clears approved_by/approved_at on
-- every save, which only makes sense if re-editing an approved-but-not-yet-invoiced deal is meant
-- to work (it resets it back to ready, same as the UI's own re-approval prompt already expects).

begin;

CREATE OR REPLACE FUNCTION public.save_deal(p_deal_id uuid, p_deal jsonb, p_sides jsonb, p_status text, p_costs jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
declare
  v_side jsonb;
  v_side_id uuid;
  v_party jsonb;
  v_cost jsonb;
  v_position integer;
  v_current_status text;
begin
  if p_status not in ('incomplete', 'ready') then
    raise exception 'save_deal: a saved deal is incomplete or ready, not %', p_status
      using errcode = 'check_violation';
  end if;

  select status into v_current_status from public.deals where id = p_deal_id;
  if v_current_status not in ('incomplete', 'ready', 'approved') then
    raise exception 'save_deal: deal % is % and can no longer be edited this way', p_deal_id, v_current_status
      using errcode = 'check_violation';
  end if;

  update public.deals
     set company_id = nullif(p_deal->>'company_id', '')::uuid,
         notarised_on = nullif(p_deal->>'notarised_on', '')::date,
         purchase_price = (p_deal->>'purchase_price')::numeric,
         vat_rate = coalesce((p_deal->>'vat_rate')::numeric, 19),
         note = nullif(p_deal->>'note', ''),
         acquired_by = nullif(p_deal->>'acquired_by', '')::uuid,
         handled_by = nullif(p_deal->>'handled_by', '')::uuid,
         own_lead = coalesce((p_deal->>'own_lead')::boolean, false),
         from_viewing = coalesce((p_deal->>'from_viewing')::boolean, false),
         referrer_customer_id = nullif(p_deal->>'referrer_customer_id', '')::uuid,
         costs_closed_at = case when coalesce((p_deal->>'costs_closed')::boolean, false)
                                then coalesce(costs_closed_at, now()) end,
         ready_for_bookkeeping_at = case when coalesce((p_deal->>'ready_for_bookkeeping')::boolean, false)
                                         then coalesce(ready_for_bookkeeping_at, now()) end,
         status = p_status,
         approved_by = null,
         approved_at = null
   where id = p_deal_id and deleted_at is null;
  if not found then
    raise exception 'save_deal: deal % not found', p_deal_id using errcode = 'no_data_found';
  end if;

  delete from public.deal_sides
   where deal_id = p_deal_id
     and side not in (select value->>'side' from jsonb_array_elements(p_sides));

  for v_side in select value from jsonb_array_elements(p_sides) loop
    insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
    values (p_deal_id, v_side->>'side', v_side->>'fee_kind', (v_side->>'fee_net_rate')::numeric,
            (v_side->>'fee_net_amount')::numeric)
    on conflict (deal_id, side) do update
       set fee_kind = excluded.fee_kind,
           fee_net_rate = excluded.fee_net_rate,
           fee_net_amount = excluded.fee_net_amount
    returning id into v_side_id;

    delete from public.deal_parties where deal_side_id = v_side_id;
    v_position := 0;
    for v_party in select value from jsonb_array_elements(coalesce(v_side->'parties', '[]'::jsonb)) loop
      insert into public.deal_parties
          (deal_side_id, customer_id, share_percent, discount_gross, discount_reason, position)
      values (v_side_id, (v_party->>'customer_id')::uuid, (v_party->>'share_percent')::numeric,
              coalesce((v_party->>'discount_gross')::numeric, 0),
              nullif(v_party->>'discount_reason', ''), v_position);
      v_position := v_position + 1;
    end loop;
  end loop;

  delete from public.deal_costs where deal_id = p_deal_id;
  for v_cost in select value from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb)) loop
    insert into public.deal_costs (deal_id, kind, description, amount, incurred_on)
    values (p_deal_id, v_cost->>'kind', nullif(v_cost->>'description', ''),
            (v_cost->>'amount')::numeric, nullif(v_cost->>'incurred_on', '')::date);
  end loop;
end;
$$;

commit;
