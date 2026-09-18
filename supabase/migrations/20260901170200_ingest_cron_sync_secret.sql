-- 20260901170200_ingest_cron_sync_secret — fix the ingest-hourly cron's auth.
--
-- WHY: ingest-hourly has been POSTing to /functions/v1/ingest with
-- `Authorization: Bearer <vault service_role_key>` every hour since migration 0080, but every
-- single call has come back 401 {"error":"unauthorized"} (checked net._http_response — 6/6 in the
-- last 48h; bank_sync_logs has zero ingest_start/ingest_pleo/ingest_done rows ever). Confirmed by
-- hash comparison that the vault's `service_role_key` does NOT match what Supabase currently
-- injects as SUPABASE_SERVICE_ROLE_KEY into the deployed functions (the function actually ran —
-- x-deno-execution-id was present on the response — so this is ingest's own authorized() check
-- failing, not the API gateway). Redeploying ingest/pleo-sync did not fix it, ruling out a stale
-- deploy snapshot. Net effect: pleo-sync has never run on schedule; every Pleo row in
-- bank_transactions came from manual backfills/button clicks, not the hourly cron.
--
-- FIX: ingest's authorized() already accepts an `x-sync-secret` header as an alternative to the
-- service-role bearer match (see ingest/index.ts). SYNC_SECRET is already set as a function
-- secret project-wide (deployed since 2026-08-05) — the cron just needs the same value in vault
-- so it can send it, and needs to actually send it. The Authorization header stays: it's still
-- needed to clear the API gateway's verify_jwt check even though the function's own string-match
-- on it does not succeed.
--
-- ONE-TIME SETUP BEFORE THIS DOES ANYTHING (run once in the SQL editor, never commit the value —
-- same convention as migration 0035's service_role_key setup):
--
--   select vault.create_secret(
--     '<SYNC_SECRET, same value as the SYNC_SECRET function secret>',
--     'sync_secret',
--     'Shared secret for cron -> ingest/pleo-sync/pleo-receipts auth (mirrors the SYNC_SECRET function secret).'
--   );

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
    -- bearer no longer matches what the deployed function sees -- see this file's header comment).
    -- Authorization is kept: it still satisfies the API gateway's verify_jwt in front of the
    -- function.
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/ingest',
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
