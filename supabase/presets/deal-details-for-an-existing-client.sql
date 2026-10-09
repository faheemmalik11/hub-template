-- Deals: the discount belongs to the person who pays it, and a deal keeps its costs.
-- For a database that already holds deals. Paste into the Supabase SQL editor; safe to run twice.

begin;

alter table public.deals add column if not exists own_lead boolean not null default false;
alter table public.deals add column if not exists from_viewing boolean not null default false;
alter table public.deals add column if not exists costs_closed_at timestamptz;
alter table public.deals add column if not exists ready_for_bookkeeping_at timestamptz;
alter table public.deals add column if not exists referrer_customer_id uuid references public.customers(id);

alter table public.deal_parties add column if not exists discount_gross numeric(14, 2) not null default 0;
alter table public.deal_parties add column if not exists discount_reason text;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'deal_sides' and column_name = 'discount_gross') then
    update public.deal_parties p
       set discount_gross = round(s.discount_gross * coalesce(p.share_percent, 100.0 / n.parties) / 100, 2),
           discount_reason = s.discount_reason
      from public.deal_sides s
      join (select deal_side_id, count(*) as parties from public.deal_parties group by deal_side_id) n
        on n.deal_side_id = s.id
     where p.deal_side_id = s.id and s.discount_gross > 0 and p.discount_gross = 0;
  end if;
end
$$;

alter table public.deal_sides drop constraint if exists deal_sides_discount_not_negative;
alter table public.deal_sides drop column if exists discount_gross;
alter table public.deal_sides drop column if exists discount_reason;
alter table public.deal_parties drop constraint if exists deal_parties_discount_not_negative;
alter table public.deal_parties add constraint deal_parties_discount_not_negative check (discount_gross >= 0);
-- What the agency paid out of its own pocket for one sale: city fees, photos, the energy certificate,
-- a voucher. A broker's bonus is worked out on the fee less these. Re-runnable.


create table if not exists public.deal_costs (
    id uuid primary key default gen_random_uuid(),
    deal_id uuid not null references public.deals(id) on delete cascade,
    kind text not null,
    description text,
    amount numeric(14, 2) not null,
    incurred_on date,
    created_at timestamptz not null default now(),
    constraint deal_costs_kind_known
        check (kind in ('city_fee', 'photos', 'energy_certificate', 'voucher', 'other')),
    constraint deal_costs_amount_positive check (amount > 0)
);

create index if not exists deal_costs_deal on public.deal_costs (deal_id);

alter table public.deal_costs enable row level security;

drop policy if exists deal_costs_read on public.deal_costs;
create policy deal_costs_read on public.deal_costs for select to authenticated
    using (public.may_read('documents.read'));

drop policy if exists deal_costs_write on public.deal_costs;
create policy deal_costs_write on public.deal_costs for all to authenticated
    using (public.may_write('documents.write'))
    with check (public.may_write('documents.write'));

drop policy if exists deal_costs_own_read on public.deal_costs;
create policy deal_costs_own_read on public.deal_costs for select to authenticated
    using (public.owns_deal(deal_id));

drop policy if exists deal_costs_submit on public.deal_costs;
create policy deal_costs_submit on public.deal_costs for all to authenticated
    using (public.may_edit_own_deal(deal_id))
    with check (public.may_edit_own_deal(deal_id));


drop function if exists public.save_deal(uuid, jsonb, jsonb, text);

-- Saves a deal with its sides, payers and costs in one transaction, as the caller. Any edit withdraws
-- an approval, because what was approved is no longer what is saved.
CREATE OR REPLACE FUNCTION public.save_deal(p_deal_id uuid, p_deal jsonb, p_sides jsonb, p_status text, p_costs jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
declare
  v_side jsonb;
  v_side_id uuid;
  v_party jsonb;
  v_cost jsonb;
  v_position integer;
begin
  if p_status not in ('incomplete', 'ready') then
    raise exception 'save_deal: a saved deal is incomplete or ready, not %', p_status
      using errcode = 'check_violation';
  end if;

  update public.deals
     set company_id = nullif(p_deal->>'company_id', '')::uuid,
         notarised_on = nullif(p_deal->>'notarised_on', '')::date,
         purchase_price = (p_deal->>'purchase_price')::numeric,
         vat_rate = coalesce((p_deal->>'vat_rate')::numeric, 19),
         note = nullif(p_deal->>'note', ''),
         acquired_by = nullif(p_deal->>'acquired_by', '')::uuid,
         handled_by = nullif(p_deal->>'handled_by', '')::uuid,
         own_lead = coalesce((p_deal->>'own_lead')::boolean, false),
         from_viewing = coalesce((p_deal->>'from_viewing')::boolean, false),
         referrer_customer_id = nullif(p_deal->>'referrer_customer_id', '')::uuid,
         costs_closed_at = case when coalesce((p_deal->>'costs_closed')::boolean, false)
                                then coalesce(costs_closed_at, now()) end,
         ready_for_bookkeeping_at = case when coalesce((p_deal->>'ready_for_bookkeeping')::boolean, false)
                                         then coalesce(ready_for_bookkeeping_at, now()) end,
         status = p_status,
         approved_by = null,
         approved_at = null
   where id = p_deal_id and deleted_at is null;
  if not found then
    raise exception 'save_deal: deal % not found', p_deal_id using errcode = 'no_data_found';
  end if;

  delete from public.deal_sides
   where deal_id = p_deal_id
     and side not in (select value->>'side' from jsonb_array_elements(p_sides));

  for v_side in select value from jsonb_array_elements(p_sides) loop
    insert into public.deal_sides (deal_id, side, fee_kind, fee_net_rate, fee_net_amount)
    values (p_deal_id, v_side->>'side', v_side->>'fee_kind', (v_side->>'fee_net_rate')::numeric,
            (v_side->>'fee_net_amount')::numeric)
    on conflict (deal_id, side) do update
       set fee_kind = excluded.fee_kind,
           fee_net_rate = excluded.fee_net_rate,
           fee_net_amount = excluded.fee_net_amount
    returning id into v_side_id;

    delete from public.deal_parties where deal_side_id = v_side_id;
    v_position := 0;
    for v_party in select value from jsonb_array_elements(coalesce(v_side->'parties', '[]'::jsonb)) loop
      insert into public.deal_parties
          (deal_side_id, customer_id, share_percent, discount_gross, discount_reason, position)
      values (v_side_id, (v_party->>'customer_id')::uuid, (v_party->>'share_percent')::numeric,
              coalesce((v_party->>'discount_gross')::numeric, 0),
              nullif(v_party->>'discount_reason', ''), v_position);
      v_position := v_position + 1;
    end loop;
  end loop;

  delete from public.deal_costs where deal_id = p_deal_id;
  for v_cost in select value from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb)) loop
    insert into public.deal_costs (deal_id, kind, description, amount, incurred_on)
    values (p_deal_id, v_cost->>'kind', nullif(v_cost->>'description', ''),
            (v_cost->>'amount')::numeric, nullif(v_cost->>'incurred_on', '')::date);
  end loop;
end;
$$;

commit;
