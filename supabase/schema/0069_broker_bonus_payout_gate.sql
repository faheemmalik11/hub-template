-- Mark-paid had no stage gate at all before this, the same gap mark_referrer_bonus_paid closed for
-- referrer bonuses in 0043_referrer_bonus_stage_timing.sql: any approved bonus could be marked paid
-- the moment it was approved, regardless of whether the deal had actually reached the stage its
-- bonus type is due at. An RPC, not a plain update, so the check runs where it cannot be skipped.
--
-- Unlike referrer bonuses, the triggers here are fixed per bonus type rather than configurable in
-- bonus_settings: the flat follow-up bonus is due once the deal is invoiced, while the handover
-- bonus and the percentage-share bonuses (company-lead, own-lead) are due only once every
-- commission invoice on the deal is paid. Bonus types with no deal_id (google_review, other,
-- financing_referral, predating the deal_id column added in 0022_bonus_suggestions.sql) have no
-- stage to check and are left alone.

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
