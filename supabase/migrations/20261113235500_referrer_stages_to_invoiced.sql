begin;

update public.bonus_settings
   set referrer_tier_counts_status = 'invoiced',
       referrer_payout_timing = 'invoiced'
 where referrer_tier_counts_status = 'notarised'
    or referrer_payout_timing = 'notarised';

commit;
