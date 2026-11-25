-- A referrer only gets a credit note's amount once they reply with their own IBAN, and that reply
-- can take a while. Before this, a suggested bonus could be marked paid the moment its payout stage
-- was reached, with no way to say "the credit note is out, we're just waiting on their bank
-- details" in between. mark_referrer_bonus_paid() now only fires from that waiting state, not
-- straight from suggested, so a bonus cannot be marked paid before someone has actually said the
-- bank details came in.

begin;

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

commit;
