begin;

create or replace function public.deals_with_crm_changes() returns table(deal_id uuid)
    language sql stable set search_path to 'public'
as $$
  select d.id
    from public.deals d
    join public.properties p on p.id = d.property_id
   where d.deleted_at is null
     and d.crm_snapshot is not null
     and d.crm_snapshot is distinct from public.crm_facts_of(p.id)
$$;

revoke execute on function public.deals_with_crm_changes() from public, anon;
grant execute on function public.deals_with_crm_changes() to authenticated;

commit;
