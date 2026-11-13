-- agent_commission_report is re-created here rather than edited in 0049: it reads a column this
-- file introduces, and Postgres will not replace a function whose output columns have changed.

begin;

alter table public.bonus_settings
    add column if not exists broker_bonus_counts_status text not null default 'approved_and_paid';

alter table public.bonus_settings
    drop constraint if exists bonus_settings_broker_bonus_counts_status_check;

alter table public.bonus_settings
    add constraint bonus_settings_broker_bonus_counts_status_check
        check (broker_bonus_counts_status in ('paid', 'approved_and_paid', 'separate'));

-- bonus_settings is readable only to bonuses.review/bonuses.submit holders, which a deals.report_all
-- holder need not be, so the invoker-rights report reads the rule through this definer wrapper.
create or replace function public.broker_bonus_counting_rule() returns text
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select broker_bonus_counts_status from public.bonus_settings), 'approved_and_paid');
$$;

revoke all on function public.broker_bonus_counting_rule() from public, anon;
grant execute on function public.broker_bonus_counting_rule() to authenticated;

drop function if exists public.agent_commission_report(date);

create function public.agent_commission_report(p_cutoff date)
returns table (
    agent_user_id uuid,
    agent_name text,
    closings_current integer,
    closings_previous integer,
    volume_current numeric,
    volume_previous numeric,
    commission_current numeric,
    commission_previous numeric,
    bonuses_current numeric,
    bonuses_previous numeric,
    bonuses_approved_current numeric,
    bonuses_approved_previous numeric
)
language sql stable
set search_path to 'public'
as $$
  with window_bounds as (
    select p_cutoff as cutoff_current,
           (p_cutoff - interval '1 year')::date as cutoff_previous,
           date_trunc('year', p_cutoff)::date as year_start_current,
           (date_trunc('year', p_cutoff) - interval '1 year')::date as year_start_previous
  ),
  bonus_counting as (
    select public.broker_bonus_counting_rule() as counts_status
  ),
  -- A deal can carry a buyer side, a seller side, or both (unique(deal_id, side)). Every side that
  -- exists is the agency's own earned commission on that deal, so all of them count, summed once
  -- per deal rather than counting the closing twice if both sides belong to the same agent.
  deal_commission as (
    select
      d.id as deal_id,
      coalesce(d.handled_by, d.acquired_by, public.property_broker_user_id(d.property_id))
        as agent_user_id,
      d.notarised_on,
      d.purchase_price,
      sum(
        case
          when s.fee_kind = 'percent' and s.fee_net_rate is not null and d.purchase_price is not null
            then d.purchase_price * s.fee_net_rate / 100
          when s.fee_kind = 'fixed' then s.fee_net_amount
          else 0
        end
      ) as commission_amount
    from public.deals d
    join public.deal_sides s on s.deal_id = d.id
    where d.deleted_at is null
      and d.status not in ('cancelled', 'settled')
      and d.notarised_on is not null
    group by d.id, d.handled_by, d.acquired_by, d.property_id, d.notarised_on, d.purchase_price
  ),
  -- An agent qualifies by having a deal OR a bonus inside either window -- a bonus with no deal
  -- attached (e.g. a Google-review bonus) must not silently drop that agent's whole row, bonus
  -- figures included.
  relevant_agents as (
    select distinct dc.agent_user_id
      from deal_commission dc, window_bounds wb
     where dc.agent_user_id is not null
       and ((dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current)
         or (dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous))
    union
    select distinct b.broker_user_id
      from public.broker_bonuses b, window_bounds wb, bonus_counting bc
     where (case bc.counts_status
              when 'paid' then b.status = 'paid'
              else b.status in ('approved', 'paid')
            end)
       and ((b.earned_on >= wb.year_start_current and b.earned_on <= wb.cutoff_current)
         or (b.earned_on >= wb.year_start_previous and b.earned_on <= wb.cutoff_previous))
  )
  select
    au.id,
    coalesce(au.name, au.email),
    count(*) filter (
      where dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current
    )::integer,
    count(*) filter (
      where dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous
    )::integer,
    coalesce(sum(dc.purchase_price) filter (
      where dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current
    ), 0),
    coalesce(sum(dc.purchase_price) filter (
      where dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous
    ), 0),
    coalesce(sum(dc.commission_amount) filter (
      where dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current
    ), 0),
    coalesce(sum(dc.commission_amount) filter (
      where dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous
    ), 0),
    coalesce((
      select sum(b.amount) from public.broker_bonuses b
       where b.broker_user_id = au.id
         and (case bc.counts_status
                when 'approved_and_paid' then b.status in ('approved', 'paid')
                else b.status = 'paid'
              end)
         and b.earned_on >= date_trunc('year', p_cutoff)::date and b.earned_on <= p_cutoff
    ), 0),
    coalesce((
      select sum(b.amount) from public.broker_bonuses b
       where b.broker_user_id = au.id
         and (case bc.counts_status
                when 'approved_and_paid' then b.status in ('approved', 'paid')
                else b.status = 'paid'
              end)
         and b.earned_on >= (date_trunc('year', p_cutoff) - interval '1 year')::date
         and b.earned_on <= (p_cutoff - interval '1 year')::date
    ), 0),
    coalesce((
      select sum(b.amount) from public.broker_bonuses b
       where b.broker_user_id = au.id and b.status = 'approved'
         and b.earned_on >= date_trunc('year', p_cutoff)::date and b.earned_on <= p_cutoff
    ), 0),
    coalesce((
      select sum(b.amount) from public.broker_bonuses b
       where b.broker_user_id = au.id and b.status = 'approved'
         and b.earned_on >= (date_trunc('year', p_cutoff) - interval '1 year')::date
         and b.earned_on <= (p_cutoff - interval '1 year')::date
    ), 0)
  from public.app_users au
  join relevant_agents ra on ra.agent_user_id = au.id
  cross join window_bounds wb
  cross join bonus_counting bc
  left join deal_commission dc on dc.agent_user_id = au.id
  where au.id = public.current_app_user_id() or public.has_permission('deals.report_all')
  group by au.id, au.name, au.email, bc.counts_status;
$$;

revoke all on function public.agent_commission_report(date) from public, anon;
grant execute on function public.agent_commission_report(date) to authenticated;

commit;
