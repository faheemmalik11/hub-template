-- Mirrors company_demo_visible (0010_access.sql), for deals and customers, which have no is_demo column of their own.

begin;

create or replace function public.deal_demo_visible(p_property_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case when public.practice_mode_active()
              then exists (
                  select 1 from public.properties p
                   where p.id = p_property_id and p.is_demo
                     and p.demo_owner_user_id = public.current_app_user_id()
              )
              else not exists (
                  select 1 from public.properties p where p.id = p_property_id and p.is_demo
              )
         end;
$$;

revoke execute on function public.deal_demo_visible(uuid) from public, anon;
grant execute on function public.deal_demo_visible(uuid) to authenticated;

create or replace function public.customer_demo_visible(p_company_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case when public.practice_mode_active()
              then exists (
                  select 1 from public.companies c
                   where c.id = p_company_id and c.is_demo
                     and c.demo_owner_user_id = public.current_app_user_id()
              )
              else not exists (
                  select 1 from public.companies c where c.id = p_company_id and c.is_demo
              )
         end;
$$;

revoke execute on function public.customer_demo_visible(uuid) from public, anon;
grant execute on function public.customer_demo_visible(uuid) to authenticated;

drop policy if exists deals_demo_owner_read on public.deals;
create policy deals_demo_owner_read on public.deals as restrictive for select to authenticated
    using (public.deal_demo_visible(property_id));
drop policy if exists deals_demo_owner_write on public.deals;
create policy deals_demo_owner_write on public.deals as restrictive for insert to authenticated
    with check (public.deal_demo_visible(property_id));
drop policy if exists deals_demo_owner_write_update on public.deals;
create policy deals_demo_owner_write_update on public.deals as restrictive for update to authenticated
    using (public.deal_demo_visible(property_id))
    with check (public.deal_demo_visible(property_id));

drop policy if exists customers_demo_owner_read on public.customers;
create policy customers_demo_owner_read on public.customers as restrictive for select to authenticated
    using (public.customer_demo_visible(company_id));
drop policy if exists customers_demo_owner_write on public.customers;
create policy customers_demo_owner_write on public.customers as restrictive for insert to authenticated
    with check (public.customer_demo_visible(company_id));
drop policy if exists customers_demo_owner_write_update on public.customers;
create policy customers_demo_owner_write_update on public.customers as restrictive for update to authenticated
    using (public.customer_demo_visible(company_id))
    with check (public.customer_demo_visible(company_id));

commit;
