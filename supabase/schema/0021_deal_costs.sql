-- What the agency paid out of its own pocket for one sale: city fees, photos, the energy certificate,
-- a voucher. A broker's bonus is worked out on the fee less these. Re-runnable.

begin;

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

commit;
