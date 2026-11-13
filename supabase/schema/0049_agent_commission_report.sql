-- deals_read/broker_bonuses_approved_read are gated on documents.read/bonuses.read, which ordinary
-- staff already hold -- RLS alone would not stop them seeing every agent's figures here just
-- because they lack deals.report_all. The own-agent-or-report-all check below is this function's
-- own, deliberate gate, not something left to row level security to enforce incidentally.
-- property_broker_user_id IS security definer, so a caller without master_data.read still gets a
-- correct agent_user_id for a deal attributed only through the CRM-assigned property broker.

begin;

create or replace function public.property_broker_user_id(p_property_id uuid) returns uuid
language sql stable security definer set search_path to 'public'
as $$
  select au.id
    from public.properties p
    join public.app_users au on au.crm_external_id = p.broker_external_id and au.is_active
   where p.id = p_property_id;
$$;

revoke all on function public.property_broker_user_id(uuid) from public, anon;
grant execute on function public.property_broker_user_id(uuid) to authenticated;

create or replace function public.agent_commission_report(p_cutoff date)
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
    bonuses_previous numeric
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
      from public.broker_bonuses b, window_bounds wb
     where b.status in ('approved', 'paid')
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
       where b.broker_user_id = au.id and b.status in ('approved', 'paid')
         and b.earned_on >= date_trunc('year', p_cutoff)::date and b.earned_on <= p_cutoff
    ), 0),
    coalesce((
      select sum(b.amount) from public.broker_bonuses b
       where b.broker_user_id = au.id and b.status in ('approved', 'paid')
         and b.earned_on >= (date_trunc('year', p_cutoff) - interval '1 year')::date
         and b.earned_on <= (p_cutoff - interval '1 year')::date
    ), 0)
  from public.app_users au
  join relevant_agents ra on ra.agent_user_id = au.id
  cross join window_bounds wb
  left join deal_commission dc on dc.agent_user_id = au.id
  where au.id = public.current_app_user_id() or public.has_permission('deals.report_all')
  group by au.id, au.name, au.email;
$$;

revoke all on function public.agent_commission_report(date) from public, anon;
grant execute on function public.agent_commission_report(date) to authenticated;

commit;
