-- Onboarding practice seeds real rows marked is_demo, in documents/companies/suppliers/properties/
-- bank_transactions. Finishing or restarting the tutorial discards the ones from that run, but
-- only those two actions ever do, and both are a soft delete (deleted_at), never a real one -- so
-- a session that is simply abandoned (closed tab, navigated away) leaves rows behind forever, and
-- nothing in this app ever removes a soft-deleted row either way. That is correct for a client's
-- own trashed documents (bookkeeping retention law applies), but is_demo data is synthetic and
-- reproducible on demand, so there is no reason to keep it once nobody is coming back to resume.
--
-- A practice run finishes in minutes, so 48 hours is a generous margin before treating one as
-- abandoned, not an attempt to guess an exact session length.

begin;

create or replace function public.purge_stale_demo_data() returns void
    language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cutoff timestamptz := now() - interval '48 hours';
begin
  alter table public.document_history disable trigger trg_guard_document_history_row;
  delete from public.document_history
   where document_id in (select id from public.documents where is_demo and created_at < v_cutoff);
  alter table public.document_history enable trigger trg_guard_document_history_row;

  delete from public.documents where is_demo and created_at < v_cutoff;
  delete from public.bank_transactions where is_demo and created_at < v_cutoff;
  delete from public.suppliers where is_demo and created_at < v_cutoff;
  delete from public.properties where is_demo and created_at < v_cutoff;
  delete from public.companies where is_demo and created_at < v_cutoff;
end;
$$;

revoke execute on function public.purge_stale_demo_data() from public, anon, authenticated;

-- Direct pg_cron, not the scheduled_jobs/Edge Function pattern (0013_scheduled_jobs.sql): this is
-- pure database work with no external call to make and no vault credential to resolve, so routing
-- it through an Edge Function would only add a network hop for nothing. Shipped on for every
-- client, unlike that table's own rows -- there is no client who would want abandoned practice
-- data kept forever, so this is not a per-tenant choice.
do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'purge-stale-demo-data') then
      perform cron.unschedule('purge-stale-demo-data');
    end if;
    perform cron.schedule('purge-stale-demo-data', '0 3 * * *',
                          'select public.purge_stale_demo_data()');
  end if;
end
$$;

commit;
