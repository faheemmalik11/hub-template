-- Brings jobs that were scheduled straight into pg_cron under scheduled_jobs, so the Hub can show
-- and switch them. Run supabase/migrations/20261119230000_scheduled_jobs_can_call_sql.sql first.
-- Paste into the Supabase SQL editor as the database owner; safe to run twice.
--
-- The rows are enabled here on purpose: these three jobs are already running on this project, and
-- the point is to move them, not to stop them. Check the output of the last statement before
-- leaving: cron.job should hold a 'hub:' line for each and none of the three originals.

begin;

insert into public.scheduled_jobs (key, sql_function, schedule, enabled, description) values
  ('overdue_payments', 'public.notify_overdue_payments', '0 6 * * *', true,
   'Tells administrators which commission invoices are past the moment the money was expected. Daily at 6am.'),
  ('purge_stale_demo_data', 'public.purge_stale_demo_data', '0 3 * * *', true,
   'Removes practice data nobody came back to. Daily at 3am.')
on conflict (key) do update
   set sql_function = excluded.sql_function, schedule = excluded.schedule,
       enabled = true, description = excluded.description;

update public.scheduled_jobs set enabled = true where key = 'propstack_sync';

commit;

begin;

select cron.unschedule('overdue-payments')
 where exists (select 1 from cron.job where jobname = 'overdue-payments');

select cron.unschedule('purge-stale-demo-data')
 where exists (select 1 from cron.job where jobname = 'purge-stale-demo-data');

select cron.unschedule('propstack-hourly-sync')
 where exists (select 1 from cron.job where jobname = 'propstack-hourly-sync');

commit;

select jobname, schedule from cron.job order by jobname;
