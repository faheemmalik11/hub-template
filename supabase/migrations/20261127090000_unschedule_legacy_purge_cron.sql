-- 0046_purge_demo_data.sql used to schedule purge-stale-demo-data straight into pg_cron, on top of
-- (and unaware of) the scheduled_jobs row of the same job the 20 November cutover
-- (scheduled-jobs-cutover-for-an-existing-client.sql) already moved it to -- so every re-apply of
-- that schema file recreated the direct cron entry the cutover had just unscheduled, leaving two
-- cron jobs running the same function on the same schedule. 0046 no longer schedules anything
-- directly; this removes the stale entry a database that already ran the old version of that file
-- may still have.

begin;

do $$
begin
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'purge-stale-demo-data') then
    perform cron.unschedule('purge-stale-demo-data');
  end if;
end
$$;

commit;
