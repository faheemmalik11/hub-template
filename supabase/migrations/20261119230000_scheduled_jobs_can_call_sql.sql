-- Three jobs were scheduled straight into pg_cron instead of as rows here, so nobody could see them
-- run or switch them off from the Hub, and one of them wrote this project's own host into the cron
-- line -- the exact thing 0013's header forbids, because a clone then calls another client's
-- project. Two of the three call a Postgres function rather than an Edge Function, which this table
-- could not express until now.

begin;

alter table public.scheduled_jobs
    add column if not exists sql_function text;

alter table public.scheduled_jobs
    alter column edge_function drop not null;

alter table public.scheduled_jobs
    drop constraint if exists scheduled_jobs_one_target;

alter table public.scheduled_jobs
    add constraint scheduled_jobs_one_target
        check (num_nonnulls(edge_function, sql_function) = 1);

create or replace function public.run_scheduled_job(p_key text) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_job public.scheduled_jobs;
  v_url text;
  v_key text;
begin
  select * into v_job from public.scheduled_jobs where key = p_key and enabled;
  if not found then
    return;
  end if;

  if v_job.sql_function is not null then
    execute format('select %s()', v_job.sql_function);
    update public.scheduled_jobs
       set last_run_at = now(), last_status = 'ran', last_message = null
     where key = p_key;
    return;
  end if;

  v_url := public.deployment_secret('project_url');
  v_key := public.deployment_secret('service_role_key');
  if v_url is null or v_key is null then
    update public.scheduled_jobs
       set last_run_at = now(), last_status = 'skipped',
           last_message = 'project_url or service_role_key is missing from the vault'
     where key = p_key;
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || v_job.edge_function,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);

  update public.scheduled_jobs
     set last_run_at = now(), last_status = 'sent', last_message = null
   where key = p_key;
end;
$$;

revoke execute on function public.run_scheduled_job(text) from public, anon, authenticated;

commit;
