-- What runs on a timer, per client.
--
-- WHY THIS IS A TABLE. Every Hub schedules a different set: one runs three jobs, another eight,
-- two run none at all. Writing them into the schema would make the schema client-specific, which is
-- the fork this template exists to prevent. So the jobs are rows: a client turns one on, changes
-- when it runs, and nothing is deployed.
--
-- NO HOST IS EVER WRITTEN DOWN. A job posts to this project's own Edge Functions, and the project's
-- URL and service key come from the vault at run time. A literal host is how a clone ends up calling
-- another client's project, which is exactly what happened in the Hub this template came from.
--
-- Everything ships OFF. A clone that is not finished being set up must not start calling out.

begin;

-- pg_cron may only be installed in the database called postgres, which is what a real Supabase
-- project is. A scratch database used for testing the schema is not, so this must not abort there:
-- the table and the functions still install, and scheduling simply has nothing to talk to.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is unavailable here, so nothing will be scheduled: %', sqlerrm;
end
$$;

create extension if not exists pg_net;

create table if not exists public.scheduled_jobs (
    key text primary key,
    -- Which Edge Function to post to. Never a URL: the host is resolved at run time.
    edge_function text not null,
    -- Standard five-field cron. Checked when it is applied, not here, because Postgres has no
    -- opinion about cron syntax and a wrong line should fail loudly at the moment somebody sets it.
    schedule text not null,
    enabled boolean not null default false,
    description text,
    -- What happened last time, so a client can see a job failing without reading a server log.
    last_run_at timestamptz,
    last_status text,
    last_message text,
    updated_at timestamptz not null default now(),
    updated_by text
);

comment on table public.scheduled_jobs is
    'What this client runs on a timer. Rows, not migrations, because every client differs.';

alter table public.scheduled_jobs enable row level security;

drop policy if exists scheduled_jobs_read on public.scheduled_jobs;
create policy scheduled_jobs_read on public.scheduled_jobs for select to authenticated
    using (public.may_read('settings.manage'));

drop policy if exists scheduled_jobs_write on public.scheduled_jobs;
create policy scheduled_jobs_write on public.scheduled_jobs for all to authenticated
    using (public.may_write('settings.manage')) with check (public.may_write('settings.manage'));

-- This project's own address and key, from the vault. Null when the deployment has not been given
-- them yet, which is a normal state for a clone nobody has finished setting up.
create or replace function public.deployment_secret(p_name text) returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_value text;
begin
  begin
    select decrypted_secret into v_value from vault.decrypted_secrets where name = p_name;
  exception when others then
    -- The vault extension may not be enabled at all. A missing secret is not an error here: the
    -- caller decides what to do without one, and every caller here decides to skip.
    v_value := null;
  end;
  return nullif(v_value, '');
end;
$$;

-- The body every scheduled job runs: post to one of this project's own Edge Functions, and write
-- down what happened. One function, so a new job is a row rather than another copy of this.
create or replace function public.run_scheduled_job(p_key text) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_job public.scheduled_jobs;
  v_url text := public.deployment_secret('project_url');
  v_key text := public.deployment_secret('service_role_key');
begin
  select * into v_job from public.scheduled_jobs where key = p_key and enabled;
  if not found then
    return;
  end if;

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

-- Makes pg_cron agree with the table: every enabled row is scheduled with its own line, every
-- disabled or deleted row is unscheduled. Run after any change; the trigger below does it for you.
create or replace function public.apply_scheduled_jobs() returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_job public.scheduled_jobs;
  v_existing text;
begin
  -- Without pg_cron there is nothing to keep in agreement. Saying so once is better than failing
  -- every write to the table.
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed, so no job was scheduled';
    return;
  end if;

  for v_existing in
    select jobname from cron.job where jobname like 'hub:%'
  loop
    if not exists (
      select 1 from public.scheduled_jobs j
       where j.enabled and 'hub:' || j.key = v_existing
    ) then
      perform cron.unschedule(v_existing);
    end if;
  end loop;

  for v_job in select * from public.scheduled_jobs where enabled loop
    if exists (select 1 from cron.job where jobname = 'hub:' || v_job.key) then
      perform cron.unschedule('hub:' || v_job.key);
    end if;
    perform cron.schedule('hub:' || v_job.key, v_job.schedule,
                          format('select public.run_scheduled_job(%L)', v_job.key));
  end loop;
end;
$$;

create or replace function public.scheduled_jobs_apply() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public.apply_scheduled_jobs();
  return null;
end;
$$;

drop trigger if exists scheduled_jobs_apply on public.scheduled_jobs;
create trigger scheduled_jobs_apply after insert or update or delete on public.scheduled_jobs
    for each statement execute function public.scheduled_jobs_apply();

revoke execute on function public.deployment_secret(text) from public, anon, authenticated;
revoke execute on function public.run_scheduled_job(text) from public, anon, authenticated;
revoke execute on function public.apply_scheduled_jobs() from public, anon;
grant execute on function public.apply_scheduled_jobs() to authenticated;

commit;
