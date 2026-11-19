-- The flat 500 euro bonus on a notarised sale is due once every commission invoice on the deal has
-- been paid, not once the invoices have merely been issued. This reverses
-- 20261117130200_broker_bonus_payout_gate.sql's stage for this one bonus type; the follow-up bonus
-- for a sale out of a viewing still goes at invoicing, so the two no longer share a stage.

begin;

create or replace function public.mark_broker_bonus_paid(p_bonus_id uuid) returns void
language plpgsql security invoker set search_path to 'public'
as $$
declare
  v_bonus public.broker_bonuses;
  v_stage text;
begin
  select * into v_bonus from public.broker_bonuses where id = p_bonus_id;
  if not found then
    raise exception 'mark_broker_bonus_paid: bonus % not found', p_bonus_id;
  end if;
  if v_bonus.status <> 'approved' then
    raise exception 'mark_broker_bonus_paid: bonus % is not approved', p_bonus_id
      using errcode = 'check_violation';
  end if;

  if v_bonus.deal_id is not null then
    v_stage := case v_bonus.bonus_type
      when 'notary' then 'commission_received'
      when 'company_lead_share' then 'commission_received'
      when 'own_job_share' then 'commission_received'
      else 'invoiced'
    end;
    if not public.deal_stage_reached(v_bonus.deal_id, v_stage) then
      raise exception 'mark_broker_bonus_paid: deal % has not reached the % stage yet',
        v_bonus.deal_id, v_stage using errcode = 'check_violation';
    end if;
  end if;

  update public.broker_bonuses set status = 'paid' where id = p_bonus_id;
end;
$$;

revoke execute on function public.mark_broker_bonus_paid(uuid) from public, anon;
grant execute on function public.mark_broker_bonus_paid(uuid) to authenticated;

commit;
