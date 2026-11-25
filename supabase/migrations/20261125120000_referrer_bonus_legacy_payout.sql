begin;

alter table public.deal_referrer_bonuses
    alter column tier drop not null;

alter table public.deal_referrer_bonuses
    add column if not exists is_legacy_payout boolean not null default false;

alter table public.deal_referrer_bonuses
    add column if not exists note text;

alter table public.deal_referrer_bonuses
    drop constraint if exists deal_referrer_bonuses_tier_unless_legacy;

alter table public.deal_referrer_bonuses
    add constraint deal_referrer_bonuses_tier_unless_legacy
    check (is_legacy_payout or tier is not null);

comment on column public.deal_referrer_bonuses.is_legacy_payout is
    'Paid under the percentage model the fixed tiers replaced. Kept for the record, excluded from referrer_bonus_tier()''s count.';

create or replace function public.referrer_bonus_tier(p_referrer_customer_id uuid, p_earned_on date)
returns integer
language sql stable security definer set search_path to 'public'
as $$
  select count(*)::integer + 1
    from public.deal_referrer_bonuses
   where referrer_customer_id = p_referrer_customer_id
     and status <> 'cancelled'
     and not is_legacy_payout
     and extract(year from earned_on) = extract(year from p_earned_on);
$$;

revoke execute on function public.referrer_bonus_tier(uuid, date) from public, anon;
grant execute on function public.referrer_bonus_tier(uuid, date) to authenticated;

commit;
