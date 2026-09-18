-- 20260827130000_notification_dispatch_cron.sql
-- Schedules the notification dispatcher (docs/NOTIFICATIONS.md phase 3): every 15 minutes
-- pg_net calls the notify-dispatch Edge Function, which delivers undelivered
-- notification_events and any daily briefings whose local send time has passed. The function
-- itself dedupes (per-channel stamps on events, per-day stamp on briefings), so the schedule
-- can fire as often as it likes without double-sending.
--
-- Same auth pattern as bank-sync (migration 0016): the service key comes from Vault
-- ('service_role_key' secret, already present on this project), because the Edge gateway
-- enforces verify_jwt.
--
-- PORTING NOTE: the function URL below carries THIS project's ref. When copying the
-- notification system to another Hub, replace the host with that project's
-- https://<ref>.supabase.co. Everything else is project-neutral.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notify-dispatch-15min') then
    perform cron.unschedule('notify-dispatch-15min');
  end if;
end;
$$;

select cron.schedule(
  'notify-dispatch-15min',
  '*/15 * * * *',
  $cron$
  do $job$
  declare
    v_key text;
  begin
    begin
      select decrypted_secret into v_key
        from vault.decrypted_secrets
       where name = 'service_role_key';
    exception when others then
      v_key := null;
    end;

    -- Without the key the POST would be rejected at the gateway. Nothing to log into here
    -- (the dispatcher has no run log yet); the bank-sync job already surfaces the same missing
    -- secret loudly every hour, so this stays a silent skip rather than a duplicate alarm.
    if v_key is null or v_key = '' then
      return;
    end if;

    perform net.http_post(
      url := 'https://xsgbdtdwhrrhoeximeon.supabase.co/functions/v1/notify-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  end;
  $job$;
  $cron$
);
