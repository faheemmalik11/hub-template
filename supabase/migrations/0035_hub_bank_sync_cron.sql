-- ---------------------------------------------------------------------------
-- 0016 — hourly bank-sync schedule
--
-- Runs the bank-sync Edge Function once an hour so transactions keep arriving
-- without anyone pressing a button. bank-sync is idempotent (transactions dedupe on
-- (account_id, banksapi_hash), matches on (invoice_id, transaction_id)), so a repeat run
-- that finds nothing new is a cheap no-op.
--
-- ONE-TIME SETUP BEFORE THIS DOES ANYTHING (run once in the SQL editor, never commit the key):
--
--   select vault.create_secret(
--     '<SUPABASE_SERVICE_ROLE_KEY>',
--     'service_role_key',
--     'Used by the bank-sync cron job to authenticate against the Edge Function'
--   );
--
-- The key lives in Vault, not in this file, because migrations are in git.
-- To rotate it later: select vault.update_secret(id, '<new key>') from vault.secrets
--                     where name = 'service_role_key';
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running this migration must not stack duplicate jobs.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bank-sync-hourly') then
    perform cron.unschedule('bank-sync-hourly');
  end if;
end;
$$;

-- Top of every hour. pg_net fires the request from a background worker and does not block
-- the scheduler, so a long sync cannot hold up other cron jobs.
select cron.schedule(
  'bank-sync-hourly',
  '0 * * * *',
  $cron$
  do $job$
  declare
    v_key text;
    v_url text;
  begin
    -- Guarded: if the vault extension is not enabled the select itself raises, and an
    -- unhandled error here would leave no trace anywhere the cockpit can show.
    begin
      select decrypted_secret into v_key
        from vault.decrypted_secrets
       where name = 'service_role_key';
    exception when others then
      v_key := null;
    end;

    -- The project URL comes from the vault as well, so this migration stays portable:
    -- a hard-coded project ref would aim the hourly POST at a foreign backend.
    begin
      select decrypted_secret into v_url
        from vault.decrypted_secrets
       where name = 'project_url';
    exception when others then
      v_url := null;
    end;

    -- Without the secret the POST would go out as "Bearer " and be rejected at the gateway,
    -- silently, once an hour, forever. Surface it in the sync log the cockpit already shows.
    if v_key is null or v_key = '' then
      insert into public.bank_sync_logs (run_id, event, level, message, counts)
      values (
        gen_random_uuid(),
        'error',
        'error',
        'Automatischer Abgleich nicht gestartet: Das Vault-Secret "service_role_key" fehlt.',
        '{}'::jsonb
      );
      return;
    end if;

    -- Same treatment as the missing key: without a URL the POST would silently go nowhere.
    if v_url is null or v_url = '' then
      insert into public.bank_sync_logs (run_id, event, level, message, counts)
      values (
        gen_random_uuid(),
        'error',
        'error',
        'Automatischer Abgleich nicht gestartet: Das Vault-Secret "project_url" fehlt.',
        '{}'::jsonb
      );
      return;
    end if;

    perform net.http_post(
      -- rtrim guards against a trailing slash in the stored URL producing a double slash
      url := rtrim(v_url, '/') || '/functions/v1/bank-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- The Edge runtime enforces verify_jwt on bank-sync, so a real JWT is required here;
        -- x-sync-secret alone would be rejected at the gateway before the function runs.
        'Authorization', 'Bearer ' || v_key
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000  -- a full-history sync far exceeds pg_net's 5s default
    );
  end;
  $job$;
  $cron$
);
