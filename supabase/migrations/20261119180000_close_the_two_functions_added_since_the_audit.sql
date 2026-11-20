-- 20261119120000 closed the anon surface as a list of the functions that existed that day, not as a
-- standing rule, so every function created since carries Postgres's default PUBLIC execute again.
-- Two already do. Both return trigger, which PostgREST does not expose as an RPC endpoint, so
-- neither is reachable today -- but the next definer function that returns something else would be.

begin;

revoke execute on function public.feature_settings_audit() from public, anon;
revoke execute on function public.referrer_bonus_earned_on() from public, anon;

commit;
