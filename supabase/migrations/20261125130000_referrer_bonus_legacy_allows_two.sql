begin;

drop index if exists public.deal_referrer_bonuses_one_active_per_deal;

create unique index deal_referrer_bonuses_one_active_per_deal
    on public.deal_referrer_bonuses (deal_id)
    where status <> 'cancelled' and not is_legacy_payout;

commit;
