begin;

alter table public.bonus_settings
    add column if not exists referrer_tier_counts_status text not null default 'suggested'
        check (referrer_tier_counts_status in ('suggested', 'paid')),
    add column if not exists referrer_tier_reset text not null default 'yearly'
        check (referrer_tier_reset in ('yearly', 'never')),
    add column if not exists referrer_tier_scope text not null default 'per_referrer'
        check (referrer_tier_scope in ('per_referrer', 'company_wide')),
    add column if not exists referrer_payout_timing text not null default 'on_suggestion'
        check (referrer_payout_timing in ('on_suggestion', 'after_commission_paid'));

create or replace function public.referrer_bonus_tier(p_referrer_customer_id uuid, p_earned_on date)
returns integer
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_settings public.bonus_settings;
  v_count integer;
begin
  select * into v_settings from public.bonus_settings;

  select count(*) into v_count
    from public.deal_referrer_bonuses b
   where (
     case v_settings.referrer_tier_scope
       when 'company_wide' then true
       else b.referrer_customer_id = p_referrer_customer_id
     end
   )
     and (
       case v_settings.referrer_tier_counts_status
         when 'paid' then b.status = 'paid'
         else b.status <> 'cancelled'
       end
     )
     and (
       case v_settings.referrer_tier_reset
         when 'never' then true
         else extract(year from b.earned_on) = extract(year from p_earned_on)
       end
     );

  return v_count + 1;
end;
$$;

revoke execute on function public.referrer_bonus_tier(uuid, date) from public, anon;
grant execute on function public.referrer_bonus_tier(uuid, date) to authenticated;

commit;
