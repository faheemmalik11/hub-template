-- A practice run that walks the commission tutorial creates a deals row against the demo property,
-- and deals_property_id_fkey is NO ACTION. purge_stale_demo_data() is one transaction, so the
-- properties delete raised a foreign-key violation and took the whole nightly purge down with it,
-- documents and suppliers included. The deal and everything hanging off it have to go first.

begin;

create or replace function public.purge_stale_demo_data() returns void
    language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cutoff timestamptz := now() - interval '48 hours';
  v_demo_deals uuid[];
begin
  select coalesce(array_agg(d.id), '{}')
    into v_demo_deals
    from public.deals d
    join public.properties p on p.id = d.property_id
   where p.is_demo and p.created_at < v_cutoff;

  delete from public.broker_bonuses
   where deal_id = any(v_demo_deals)
      or property_id in (select id from public.properties where is_demo and created_at < v_cutoff);
  delete from public.deal_donations where deal_id = any(v_demo_deals);
  delete from public.deal_referrer_bonuses where deal_id = any(v_demo_deals);
  delete from public.outgoing_invoices where deal_id = any(v_demo_deals);
  delete from public.deals where id = any(v_demo_deals);

  delete from public.documents where is_demo and created_at < v_cutoff;
  delete from public.bank_transactions where is_demo and created_at < v_cutoff;
  delete from public.suppliers where is_demo and created_at < v_cutoff;
  delete from public.properties where is_demo and created_at < v_cutoff;
  delete from public.companies where is_demo and created_at < v_cutoff;
end;
$$;

revoke execute on function public.purge_stale_demo_data() from public, anon, authenticated;

commit;
