-- Let the hourly ingest download Pleo receipt files.
--
-- WHY. ingest treats receipt FILES as opt-in behind `?receipts=1`:
--
--   const withReceipts = url.searchParams.get("receipts") === "1";
--   if (withReceipts && keys.includes("pleo")) { ... "pleo-receipts", "?batch=50" }
--
-- The reasoning in that comment is "opt-in because it is long-running, the caller decides, the
-- cron normally does not". The consequence is that nobody ever decided: the cron has always POSTed
-- to /functions/v1/ingest with no query string, so the downloader never ran on a schedule.
--
-- Measured on 11.09.2026. Every month from 2022-07 to 2026-06 was missing 0 to 5 percent of its
-- receipts. Then 2026-07 was missing 33 percent and 2026-08 and 2026-09 were missing ALL of them.
-- That cliff is not employees going quiet: the newest stored file was written 2026-08-05 07:09,
-- by the last manual run. 103 transactions were sitting on receipts that Pleo had all along, which
-- pleo-receipts then downloaded in three batches with zero failures.
--
-- The "long-running" worry was about the original ~2,000 file backlog, which is now cleared. Steady
-- state is single digits per hour, and pleo-receipts is bounded per call (batch=50) and reports
-- what remains, so a burst simply continues on the next tick rather than running long.
--
-- Only the URL changes. Everything else is migration 20260901170200 unchanged, including the
-- x-sync-secret header that is what actually clears ingest's own authorized() check.

begin;

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
    v_sync_secret text;
  begin
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

    begin
      select decrypted_secret into v_sync_secret
        from vault.decrypted_secrets where name = 'sync_secret';
    exception when others then
      v_sync_secret := null;
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

    -- x-sync-secret is what actually clears ingest's own authorized() check (the service-role
    -- bearer no longer matches what the deployed function sees -- see migration 20260901170200).
    -- Authorization is kept: it still satisfies the API gateway's verify_jwt in front of the
    -- function.
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/ingest?receipts=1',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ) || case when v_sync_secret is not null and v_sync_secret <> ''
             then jsonb_build_object('x-sync-secret', v_sync_secret)
             else '{}'::jsonb
           end,
      body := '{}'::jsonb,
      timeout_milliseconds := 600000
    );
  end;
  $job$;
  $cron$
);

commit;
