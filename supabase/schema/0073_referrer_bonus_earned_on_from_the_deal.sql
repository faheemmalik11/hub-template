-- deal_referrer_bonuses is written by a plain insert from the browser, so earned_on was whatever the
-- client sent. The card fell back to the current date when the deal had no notary date yet, and that
-- date is what referrer_bonus_tier() windows the yearly tier reset on -- a referral suggested in
-- January on a sale notarised the previous December counted in the wrong year, permanently.
--
-- The deal's own notarised_on is the only right answer, so the database takes it from there rather
-- than trusting the caller.

begin;

create or replace function public.referrer_bonus_earned_on() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_notarised_on date;
begin
  select notarised_on into v_notarised_on from public.deals where id = new.deal_id;
  if v_notarised_on is null then
    raise exception 'referrer bonus: deal % has no notary date yet', new.deal_id
      using errcode = 'check_violation';
  end if;
  new.earned_on := v_notarised_on;
  return new;
end;
$$;

drop trigger if exists referrer_bonus_earned_on on public.deal_referrer_bonuses;
create trigger referrer_bonus_earned_on before insert on public.deal_referrer_bonuses
    for each row execute function public.referrer_bonus_earned_on();

commit;
