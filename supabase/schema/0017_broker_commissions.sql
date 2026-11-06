-- A broker enters their own commissions, and an administrator reviews and approves them.
--
-- Everything here is inert until a role holds `deals.submit`, which no role does by default: the
-- permission is off in the catalogue, and a policy that asks for it denies everyone who lacks it.
-- Re-runnable, so the same file builds a new database and upgrades one that already exists.
--
-- A person holding `deals.submit` may create a deal on a property the CRM says is theirs, and edit it
-- while it is incomplete or ready. They may not approve it, change what it is about to somebody
-- else's property, or touch it once it is approved: approving is `documents.write`, as before.

begin;

-- Who created a customer, so a person can read back the customers they entered and nobody else's.
alter table public.customers
    add column if not exists created_by uuid references public.app_users(id)
        default public.current_app_user_id();

create or replace function public.is_own_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.properties p
     where p.id = p_property_id
       and p.deleted_at is null
       and p.broker_external_id is not null
       and p.broker_external_id = public.current_crm_external_id()
  );
$$;

create or replace function public.may_edit_own_deal(p_deal_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.has_permission('deals.submit')
     and exists (
       select 1 from public.deals d
        where d.id = p_deal_id
          and d.deleted_at is null
          and d.status in ('incomplete', 'ready')
          and public.owns_deal(d.id)
     );
$$;

create or replace function public.may_edit_own_deal_side(p_side_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.deal_sides s
                  where s.id = p_side_id and public.may_edit_own_deal(s.deal_id));
$$;

revoke execute on function public.is_own_property(uuid) from public, anon;
revoke execute on function public.may_edit_own_deal(uuid) from public, anon;
revoke execute on function public.may_edit_own_deal_side(uuid) from public, anon;
grant execute on function public.is_own_property(uuid) to authenticated;
grant execute on function public.may_edit_own_deal(uuid) to authenticated;
grant execute on function public.may_edit_own_deal_side(uuid) to authenticated;

drop policy if exists deals_submit_insert on public.deals;
create policy deals_submit_insert on public.deals for insert to authenticated
    with check (public.has_permission('deals.submit')
                and public.is_own_property(property_id)
                and status = 'incomplete'
                and approved_by is null and approved_at is null
                and deleted_at is null);

-- Read from the row's own property, not through a function that looks the deal up again: a row being
-- inserted cannot be seen by a second query in the same statement, so the insert would be refused
-- when it tries to hand the new row back.
drop policy if exists deals_submit_read on public.deals;
create policy deals_submit_read on public.deals for select to authenticated
    using (public.has_permission('deals.submit') and public.is_own_property(property_id));

drop policy if exists deals_submit_update on public.deals;
create policy deals_submit_update on public.deals for update to authenticated
    using (public.may_edit_own_deal(id))
    with check (public.has_permission('deals.submit')
                and public.is_own_property(property_id)
                and status in ('incomplete', 'ready')
                and approved_by is null and approved_at is null
                and deleted_at is null);

drop policy if exists deal_sides_submit on public.deal_sides;
create policy deal_sides_submit on public.deal_sides for all to authenticated
    using (public.may_edit_own_deal(deal_id))
    with check (public.may_edit_own_deal(deal_id));

-- A payer must be a customer the person can themselves see, so somebody else's customer cannot be
-- attached by knowing its id.
drop policy if exists deal_parties_submit on public.deal_parties;
create policy deal_parties_submit on public.deal_parties for all to authenticated
    using (public.may_edit_own_deal_side(deal_side_id))
    with check (public.may_edit_own_deal_side(deal_side_id)
                and exists (select 1 from public.customers c where c.id = customer_id));

drop policy if exists customers_submit_insert on public.customers;
create policy customers_submit_insert on public.customers for insert to authenticated
    with check (public.has_permission('deals.submit')
                and source = 'app'
                and created_by = public.current_app_user_id());

drop policy if exists customers_submit_read on public.customers;
create policy customers_submit_read on public.customers for select to authenticated
    using (public.has_permission('deals.submit')
           and created_by = public.current_app_user_id());

commit;
