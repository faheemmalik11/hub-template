-- The list is searched, sorted and paged in the database, so the number of missing fields has to be
-- a column that can be ordered on rather than something the browser counts after fetching.

begin;

create or replace view public.v_deals_with_unmaintained_fields
with (security_invoker = true) as
  select d.id as deal_id,
         d.property_id,
         d.property_label,
         p.external_id as property_external_id,
         d.notarised_on,
         d.status,
         public.deal_unmaintained_fields(d.id) as missing_fields,
         cardinality(public.deal_unmaintained_fields(d.id)) as missing_count
    from public.deals d
    left join public.properties p on p.id = d.property_id
   where d.deleted_at is null
     and cardinality(public.deal_unmaintained_fields(d.id)) > 0;

revoke all on public.v_deals_with_unmaintained_fields from anon;
grant select on public.v_deals_with_unmaintained_fields to authenticated;

commit;
