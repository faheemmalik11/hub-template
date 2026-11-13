-- The scorer returns 0..1 (_shared/matching.ts), and every reader's own fallback was already a
-- fraction, but the column defaults shipped as 60.00 and 95.00, so `score < candidate_threshold`
-- was always true and the nightly sync never wrote a match for anybody.

begin;

update public.matching_settings
   set candidate_threshold = candidate_threshold / 100
 where candidate_threshold > 1;

update public.matching_settings
   set auto_match_threshold = auto_match_threshold / 100
 where auto_match_threshold > 1;

alter table public.matching_settings
    alter column candidate_threshold type numeric(4, 3),
    alter column auto_match_threshold type numeric(4, 3),
    alter column candidate_threshold set default 0.6,
    alter column auto_match_threshold set default 0.95;

alter table public.matching_settings
    drop constraint if exists matching_settings_thresholds_are_fractions;

alter table public.matching_settings
    add constraint matching_settings_thresholds_are_fractions
        check (candidate_threshold between 0 and 1 and auto_match_threshold between 0 and 1);

commit;
