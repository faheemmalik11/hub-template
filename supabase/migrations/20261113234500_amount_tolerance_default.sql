-- 0055 made the thresholds honour their stored value, which also removed the code floor that had
-- quietly turned the shipped 0.00 into a cent. Exact-match-only is a real choice, not a default.

begin;

alter table public.matching_settings
    alter column amount_tolerance set default 0.01;

update public.matching_settings
   set amount_tolerance = 0.01
 where amount_tolerance = 0.00;

commit;
