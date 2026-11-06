-- Gives the hourly Propstack sync somewhere to record its result. The timer itself is the cron job
-- created in the Supabase dashboard (Integrations, Cron) that calls the Edge Function `propstack-sync`.
-- Enabled stays false on purpose: enabling it would add a second timer from this table.

insert into public.scheduled_jobs (key, edge_function, schedule, enabled, description) values
  ('propstack_sync', 'propstack-sync', '0 * * * *', false,
   'Hourly Propstack sync. Timed by the cron job in the Supabase dashboard; this row only shows the last result.')
on conflict (key) do nothing;
