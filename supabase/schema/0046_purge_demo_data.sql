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
  v_demo_deal_ids uuid[];
  v_demo_customer_ids uuid[];
begin
  -- deals/customers/outgoing_invoices/manual_bookings carry no is_demo column of their own
  -- (0010_access.sql's company_demo_visible() reads the parent's instead), but a practice run
  -- creates them tied to a demo property/company all the same, and they block deleting that
  -- property/company (NO ACTION foreign keys) if left behind. Collected once so every statement
  -- below agrees on the same set.
  select array_agg(d.id) into v_demo_deal_ids
    from public.deals d join public.properties p on p.id = d.property_id
   where p.is_demo and p.created_at < v_cutoff;
  select array_agg(c.id) into v_demo_customer_ids
    from public.customers c join public.companies co on co.id = c.company_id
   where co.is_demo and co.created_at < v_cutoff;

  delete from public.outgoing_invoices
   where deal_id = any (v_demo_deal_ids) or customer_id = any (v_demo_customer_ids);
  delete from public.broker_bonuses where deal_id = any (v_demo_deal_ids);
  delete from public.deal_donations where deal_id = any (v_demo_deal_ids);
  delete from public.deal_referrer_bonuses
   where deal_id = any (v_demo_deal_ids) or referrer_customer_id = any (v_demo_customer_ids);
  delete from public.deal_parties where customer_id = any (v_demo_customer_ids);
  delete from public.deals where id = any (v_demo_deal_ids);
  delete from public.customers where id = any (v_demo_customer_ids);

  delete from public.manual_bookings mb
   where exists (select 1 from public.properties p where p.id = mb.property_id and p.is_demo and p.created_at < v_cutoff)
      or exists (select 1 from public.companies co where co.id = mb.company_id and co.is_demo and co.created_at < v_cutoff);

  alter table public.document_history disable trigger trg_guard_document_history_row;
  delete from public.document_history
   where document_id in (select id from public.documents where is_demo and created_at < v_cutoff);
  alter table public.document_history enable trigger trg_guard_document_history_row;

  delete from public.documents where is_demo and created_at < v_cutoff;
  delete from public.bank_transactions where is_demo and created_at < v_cutoff;

  -- Same reasoning as document_history above: refuse_deleting_default_bank_account protects a
  -- real supplier from losing its default account with no replacement, which does not apply when
  -- the supplier itself is being removed in the same statement.
  alter table public.supplier_bank_accounts disable trigger trg_refuse_deleting_default_bank_account;
  delete from public.suppliers where is_demo and created_at < v_cutoff;
  alter table public.supplier_bank_accounts enable trigger trg_refuse_deleting_default_bank_account;

  delete from public.properties where is_demo and created_at < v_cutoff;
  delete from public.companies where is_demo and created_at < v_cutoff;
exception
  -- A row this can't reach yet fails loudly to an administrator instead of silently every night.
  when others then
    perform public.notify_administrators(
      'The nightly demo-data cleanup failed: ' || sqlerrm,
      '/administration', 'purge_stale_demo_data');
end;
$$;

revoke execute on function public.purge_stale_demo_data() from public, anon, authenticated;

-- Scheduling lives in scheduled_jobs (0013_scheduled_jobs.sql, extended by
-- 0080_scheduled_jobs_can_call_sql.sql to call a Postgres function directly, not only an Edge
-- Function), not here. An earlier version of this file scheduled it straight into pg_cron instead
-- -- exactly the pattern 0080 retired, because a direct cron.schedule line can end up carrying
-- this project's own host, which is how a clone calls another client's project. The catalogue
-- seed (supabase/catalogue.sql) ships this one row enabled by default, unlike every other
-- scheduled_jobs row: it is pure internal hygiene with nothing to call out to, so there is no
-- client who would want abandoned practice data kept forever.

commit;
