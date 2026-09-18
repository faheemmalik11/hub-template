-- 0080_single_ingest_cron — one scheduled job for every transaction source.
--
-- WHY: transactions arrive from three places (banksapi, pleo, manual upload) but only ONE was
-- scheduled. `bank-sync-hourly` pulled BANKSapi every hour; Pleo had no cron at all and synced
-- only when somebody invoked it by hand. There was no single answer to "did ingestion run, and
-- did it work?" — the logs held unrelated entries from different jobs.
--
-- The ingest function fans out to each source in its own invocation (so one slow provider cannot
-- starve another) and writes one run_id, so a run is a single line in bank_sync_logs.
--
-- Manual upload is NOT scheduled: someone uploads a file. Nothing to poll.
--
-- Same guarded pattern as the job it replaces: both vault secrets must exist, otherwise the job
-- logs a visible error instead of POSTing into the void once an hour, forever.

begin;

-- Retire the BANKSapi-only job. ingest now covers it.
select cron.unschedule('bank-sync-hourly')
 where exists (select 1 from cron.job where jobname = 'bank-sync-hourly');

select cron.unschedule('ingest-hourly')
 where exists (select 1 from cron.job where jobname = 'ingest-hourly');

select cron.schedule(
  'ingest-hourly',
  '0 * * * *',
  $cron$
  do $job$
  declare
    v_key text;
    v_url text;
  begin
    -- Guarded: if the vault extension is not enabled the select itself raises, and an unhandled
    -- error here would leave no trace anywhere the cockpit can show.
    begin
      select decrypted_secret into v_key
        from vault.decrypted_secrets where name = 'service_role_key';
    exception when others then
      v_key := null;
    end;

    begin
      select decrypted_secret into v_url
        from vault.decrypted_secrets where name = 'project_url';
    exception when others then
      v_url := null;
    end;

    if v_key is null or v_key = '' or v_url is null or v_url = '' then
      insert into public.bank_sync_logs (run_id, event, level, message, counts)
      values (
        gen_random_uuid(), 'error', 'error',
        'Automatischer Abgleich nicht gestartet: Vault-Secret "service_role_key" oder "project_url" fehlt.',
        '{}'::jsonb
      );
      return;
    end if;

    perform net.http_post(
      -- No ?source: the cron pulls every scheduled source. A UI button passes ?source=pleo or
      -- ?source=banksapi to the same endpoint.
      url := rtrim(v_url, '/') || '/functions/v1/ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- The Edge runtime enforces verify_jwt, so a real JWT is required; the shared secret
        -- alone would be rejected at the gateway before the function runs.
        'Authorization', 'Bearer ' || v_key
      ),
      body := '{}'::jsonb,
      -- ingest runs sources sequentially, each with its own budget, so allow for all of them.
      timeout_milliseconds := 600000
    );
  end;
  $job$;
  $cron$
);

commit;
