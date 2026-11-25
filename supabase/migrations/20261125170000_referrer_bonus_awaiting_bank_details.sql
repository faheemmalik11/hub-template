begin;

alter table public.deal_referrer_bonuses
    drop constraint if exists deal_referrer_bonuses_status_check;

alter table public.deal_referrer_bonuses
    add constraint deal_referrer_bonuses_status_check
    check (status in ('suggested', 'awaiting_bank_details', 'paid', 'cancelled'));

create or replace function public.mark_referrer_bonus_awaiting_bank_details(p_bonus_id uuid) returns void
language plpgsql security invoker set search_path to 'public'
as $$
declare
  v_bonus public.deal_referrer_bonuses;
begin
  select * into v_bonus from public.deal_referrer_bonuses where id = p_bonus_id;
  if not found then
    raise exception 'mark_referrer_bonus_awaiting_bank_details: bonus % not found', p_bonus_id;
  end if;
  if v_bonus.status <> 'suggested' then
    raise exception 'mark_referrer_bonus_awaiting_bank_details: bonus % is not suggested', p_bonus_id
      using errcode = 'check_violation';
  end if;

  update public.deal_referrer_bonuses set status = 'awaiting_bank_details' where id = p_bonus_id;
end;
$$;

revoke execute on function public.mark_referrer_bonus_awaiting_bank_details(uuid) from public, anon;
grant execute on function public.mark_referrer_bonus_awaiting_bank_details(uuid) to authenticated;

create or replace function public.mark_referrer_bonus_paid(p_bonus_id uuid) returns void
language plpgsql security invoker set search_path to 'public'
as $$
declare
  v_bonus public.deal_referrer_bonuses;
  v_stage text;
begin
  select * into v_bonus from public.deal_referrer_bonuses where id = p_bonus_id;
  if not found then
    raise exception 'mark_referrer_bonus_paid: bonus % not found', p_bonus_id;
  end if;
  if v_bonus.status <> 'awaiting_bank_details' then
    raise exception 'mark_referrer_bonus_paid: bonus % is not awaiting bank details', p_bonus_id
      using errcode = 'check_violation';
  end if;

  select referrer_payout_timing into v_stage from public.bonus_settings;
  if not public.deal_stage_reached(v_bonus.deal_id, v_stage) then
    raise exception 'mark_referrer_bonus_paid: deal % has not reached the % stage yet',
      v_bonus.deal_id, v_stage using errcode = 'check_violation';
  end if;

  update public.deal_referrer_bonuses set status = 'paid' where id = p_bonus_id;
end;
$$;

revoke execute on function public.mark_referrer_bonus_paid(uuid) from public, anon;
grant execute on function public.mark_referrer_bonus_paid(uuid) to authenticated;

commit;
