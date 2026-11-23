-- Adds a third demo customer, "TEST Co-Buyer", so the buyer side of the practice deal can have two
-- payers and the Share % field has something real to split, instead of staying locked at 100%.

begin;

create or replace function public.seed_commission_deal_practice_data() returns uuid[]
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_user_id uuid := public.current_app_user_id();
  v_tag text;
  v_company_id uuid;
  v_property_id uuid;
  v_buyer_id uuid;
  v_co_buyer_id uuid;
  v_seller_id uuid;
begin
  if v_user_id is null then
    raise exception 'seed_commission_deal_practice_data: no signed-in app user';
  end if;

  v_tag := substr(replace(v_user_id::text, '-', ''), 1, 8);

  select id into v_company_id from public.companies
   where is_demo and demo_owner_user_id = v_user_id and code = 'DEMO-' || v_tag;
  if v_company_id is null then
    raise exception 'seed_commission_deal_practice_data: no demo company for user %, seedPracticeData should have run first', v_user_id;
  end if;

  select id into v_property_id from public.properties
   where is_demo and demo_owner_user_id = v_user_id and code = 'DEMO-' || v_tag || '-P1';
  if v_property_id is null then
    raise exception 'seed_commission_deal_practice_data: no demo property for user %, seedPracticeData should have run first', v_user_id;
  end if;

  select id into v_buyer_id from public.customers
   where company_id = v_company_id and name = 'TEST Buyer';
  if v_buyer_id is not null then
    update public.customers set deleted_at = null where id = v_buyer_id and deleted_at is not null;
  else
    insert into public.customers (company_id, is_company, name)
    values (v_company_id, false, 'TEST Buyer')
    returning id into v_buyer_id;
  end if;

  select id into v_co_buyer_id from public.customers
   where company_id = v_company_id and name = 'TEST Co-Buyer';
  if v_co_buyer_id is not null then
    update public.customers set deleted_at = null where id = v_co_buyer_id and deleted_at is not null;
  else
    insert into public.customers (company_id, is_company, name)
    values (v_company_id, false, 'TEST Co-Buyer')
    returning id into v_co_buyer_id;
  end if;

  select id into v_seller_id from public.customers
   where company_id = v_company_id and name = 'TEST Seller';
  if v_seller_id is not null then
    update public.customers set deleted_at = null where id = v_seller_id and deleted_at is not null;
  else
    insert into public.customers (company_id, is_company, name)
    values (v_company_id, false, 'TEST Seller')
    returning id into v_seller_id;
  end if;

  update public.deals
     set status = 'cancelled'
   where property_id = v_property_id
     and deleted_at is null
     and status not in ('cancelled', 'settled');

  return array[v_buyer_id, v_seller_id, v_co_buyer_id];
end $$;

revoke execute on function public.seed_commission_deal_practice_data() from public, anon;
grant execute on function public.seed_commission_deal_practice_data() to authenticated;

commit;
