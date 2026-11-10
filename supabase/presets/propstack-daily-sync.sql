-- Gives the Propstack reconciliation sync somewhere to record its result. The timer itself is the
-- cron job created in the Supabase dashboard (Integrations, Cron) that calls the Edge Function
-- `propstack-sync`. Enabled stays false on purpose: enabling it would add a second timer from this
-- table.
--
-- Daily, not hourly: property create/update events now reach the Hub through `propstack-webhook`
-- in near-real-time. This sync stays as a safety net for any webhook delivery that never arrives.

insert into public.scheduled_jobs (key, edge_function, schedule, enabled, description) values
  ('propstack_sync', 'propstack-sync', '0 3 * * *', false,
   'Daily Propstack reconciliation sync, backing up propstack-webhook. Timed by the cron job in the Supabase dashboard; this row only shows the last result.')
on conflict (key) do nothing;
