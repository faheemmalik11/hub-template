-- 0022_schedule_bank_sync — actually schedule the bank sync.
--
-- THE GAP: bank-sync/index.ts says "Trigger: pg_cron (scheduled) or manual invoke from the cockpit",
-- but pg_cron was never installed and no job existed, so only the manual path was real — bank
-- transactions arrived solely when somebody pressed "Sync now" in the Hub. Meanwhile the pipeline calls
-- the function in **match-only** mode after every ingest (pipeline/match_payment.py), which matches an
-- invoice against transactions ALREADY on file but never fetches new ones. Net effect: a freshly
-- extracted invoice could not be matched to its payment until a human clicked the button.
--
-- This adds the missing half: a scheduled FULL sync (BANKSapi import + matching pass).
--
-- SECRETS ARE NOT IN THIS FILE. The URL and the service-role key live in Supabase Vault under fixed
-- names, and run_bank_sync() reads them at call time. Migrations are committed to git, so putting the
-- key in the cron command (where it would also sit in plain sight in cron.job.command) is not an option.
-- Load them once with:
--     .venv/bin/python pipeline/set_bank_sync_secrets.py --apply
-- run_bank_sync() raises a clear error until that is done, rather than failing silently every hour.
--
-- WHY pg_net AND NOT http: pg_net is async — it queues the request and returns an id, so a slow bank
-- API cannot block the cron worker. The response lands in net._http_response, and bank-sync writes its
-- own bank_sync_logs rows either way, which is where you actually look.
--
-- SCHEDULE: hourly at minute 7 (off the top-of-hour stampede). Bank postings appear a few times a day
-- at most, so hourly is fresh enough without hammering BANKSapi. To change it, just re-run
-- cron.schedule with the same job name — it replaces the existing job.
--
-- Matching still ALSO runs right after each ingest, which is the fast path for an invoice whose payment
-- is already imported. The two are complementary and both idempotent.
--
-- Applied to the dev project `txxqvvpvrylnqbpscmpv`, the only database in scope (same as 0014/0018).
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0022_schedule_bank_sync.sql

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reads its credentials from Vault so nothing secret is stored in the job definition.
-- p_mode null -> full sync (import + match); 'match' -> matching only, same as the pipeline's call.
create or replace function public.run_bank_sync(p_mode text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url  text;
  v_key  text;
  v_body jsonb;
  v_req  bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'bank_sync_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_sync_service_key';

  if v_url is null or v_key is null then
    raise exception 'run_bank_sync: Vault secrets bank_sync_url / bank_sync_service_key are missing. '
                    'Load them with: .venv/bin/python pipeline/set_bank_sync_secrets.py --apply';
  end if;

  v_body := case when p_mode is null then '{}'::jsonb else jsonb_build_object('mode', p_mode) end;

  select net.http_post(
           url                  := rtrim(v_url, '/') || '/functions/v1/bank-sync',
           body                 := v_body,
           headers              := jsonb_build_object(
                                     'Content-Type', 'application/json',
                                     'Authorization', 'Bearer ' || v_key,
                                     'apikey', v_key),
           timeout_milliseconds := 60000
         )
    into v_req;

  return v_req;
end;
$$;

comment on function public.run_bank_sync(text) is
  'Invoke the bank-sync Edge Function over pg_net, credentials from Vault. Called hourly by the '
  'pg_cron job "bank-sync-hourly". p_mode null = full sync (import + match), ''match'' = matching only.';

-- Not callable by the API roles: the Hub already triggers a sync through supabase.functions.invoke
-- (useTriggerSync), and this one carries the service-role key.
revoke all on function public.run_bank_sync(text) from public, anon, authenticated;

-- cron.schedule upserts on the job name, so re-applying this migration re-points the same job
-- instead of stacking duplicates.
select cron.schedule('bank-sync-hourly', '7 * * * *', $job$select public.run_bank_sync()$job$);

commit;

-- Sanity:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'bank-sync-hourly';
--   -- fire it by hand once the Vault secrets are loaded:
--   select public.run_bank_sync();
--   -- the async response (pg_net):
--   select id, status_code, left(content, 200) from net._http_response order by id desc limit 3;
--   -- what the function itself recorded:
--   select event, created_at from bank_sync_logs order by created_at desc limit 5;
--   -- run history:
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='bank-sync-hourly')
--    order by start_time desc limit 5;
