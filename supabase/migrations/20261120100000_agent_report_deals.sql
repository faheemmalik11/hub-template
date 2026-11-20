begin;

-- A deal can carry a buyer side, a seller side, or both (unique(deal_id, side)). Every side that
-- exists is the agency's own earned commission on that deal, so all of them count, summed once
-- per deal rather than counting the closing twice if both sides belong to the same agent.
create or replace view public.v_deal_commission
with (security_invoker = true) as
  select
    d.id as deal_id,
    coalesce(d.handled_by, d.acquired_by, public.property_broker_user_id(d.property_id))
      as agent_user_id,
    d.notarised_on,
    d.purchase_price,
    d.property_label,
    d.status,
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
  group by d.id, d.handled_by, d.acquired_by, d.property_id, d.notarised_on, d.purchase_price,
           d.property_label, d.status;

revoke all on public.v_deal_commission from anon;
grant select on public.v_deal_commission to authenticated;

create or replace function public.agent_commission_report(
    p_cutoff date,
    p_search text default '',
    p_sort text default 'closings',
    p_ascending boolean default false,
    p_limit integer default 25,
    p_offset integer default 0
)
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
    bonuses_approved_previous numeric,
    total_count bigint,
    all_closings_current integer,
    all_closings_previous integer,
    all_volume_current numeric,
    all_volume_previous numeric,
    all_commission_current numeric,
    all_commission_previous numeric,
    all_bonuses_current numeric,
    all_bonuses_previous numeric,
    all_bonuses_approved_current numeric,
    all_bonuses_approved_previous numeric
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
  deal_commission as (
    select v.deal_id,
           v.agent_user_id,
           v.notarised_on,
           v.purchase_price,
           v.commission_amount
      from public.v_deal_commission v
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
  ),
  agent_totals as (
    select
      au.id as agent_user_id,
      coalesce(au.name, au.email) as agent_name,
      count(*) filter (
        where dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current
      )::integer as closings_current,
      count(*) filter (
        where dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous
      )::integer as closings_previous,
      coalesce(sum(dc.purchase_price) filter (
        where dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current
      ), 0) as volume_current,
      coalesce(sum(dc.purchase_price) filter (
        where dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous
      ), 0) as volume_previous,
      coalesce(sum(dc.commission_amount) filter (
        where dc.notarised_on >= wb.year_start_current and dc.notarised_on <= wb.cutoff_current
      ), 0) as commission_current,
      coalesce(sum(dc.commission_amount) filter (
        where dc.notarised_on >= wb.year_start_previous and dc.notarised_on <= wb.cutoff_previous
      ), 0) as commission_previous,
      coalesce((
        select sum(b.amount) from public.broker_bonuses b
         where b.broker_user_id = au.id
           and (case bc.counts_status
                  when 'approved_and_paid' then b.status in ('approved', 'paid')
                  else b.status = 'paid'
                end)
           and b.earned_on >= date_trunc('year', p_cutoff)::date and b.earned_on <= p_cutoff
      ), 0) as bonuses_current,
      coalesce((
        select sum(b.amount) from public.broker_bonuses b
         where b.broker_user_id = au.id
           and (case bc.counts_status
                  when 'approved_and_paid' then b.status in ('approved', 'paid')
                  else b.status = 'paid'
                end)
           and b.earned_on >= (date_trunc('year', p_cutoff) - interval '1 year')::date
           and b.earned_on <= (p_cutoff - interval '1 year')::date
      ), 0) as bonuses_previous,
      coalesce((
        select sum(b.amount) from public.broker_bonuses b
         where b.broker_user_id = au.id and b.status = 'approved'
           and b.earned_on >= date_trunc('year', p_cutoff)::date and b.earned_on <= p_cutoff
      ), 0) as bonuses_approved_current,
      coalesce((
        select sum(b.amount) from public.broker_bonuses b
         where b.broker_user_id = au.id and b.status = 'approved'
           and b.earned_on >= (date_trunc('year', p_cutoff) - interval '1 year')::date
           and b.earned_on <= (p_cutoff - interval '1 year')::date
      ), 0) as bonuses_approved_previous
    from public.app_users au
    join relevant_agents ra on ra.agent_user_id = au.id
    cross join window_bounds wb
    cross join bonus_counting bc
    left join deal_commission dc on dc.agent_user_id = au.id
    where au.id = public.current_app_user_id() or public.has_permission('deals.report_all')
    group by au.id, au.name, au.email, bc.counts_status
  ),
  everyone as (
    select sum(closings_current)::integer as all_closings_current,
           sum(closings_previous)::integer as all_closings_previous,
           sum(volume_current) as all_volume_current,
           sum(volume_previous) as all_volume_previous,
           sum(commission_current) as all_commission_current,
           sum(commission_previous) as all_commission_previous,
           sum(bonuses_current) as all_bonuses_current,
           sum(bonuses_previous) as all_bonuses_previous,
           sum(bonuses_approved_current) as all_bonuses_approved_current,
           sum(bonuses_approved_previous) as all_bonuses_approved_previous
      from agent_totals
  ),
  searched as (
    select t.*,
           case when p_sort = 'agent' then t.agent_name end as sort_text,
           case p_sort
             when 'agent' then null::numeric
             when 'volume' then t.volume_current
             when 'commission' then t.commission_current
             when 'bonuses' then t.bonuses_current
             else t.closings_current::numeric
           end as sort_number
      from agent_totals t
     where btrim(coalesce(p_search, '')) = ''
        or t.agent_name ilike '%' || btrim(p_search) || '%'
  )
  select
    agent_user_id,
    agent_name,
    closings_current,
    closings_previous,
    volume_current,
    volume_previous,
    commission_current,
    commission_previous,
    bonuses_current,
    bonuses_previous,
    bonuses_approved_current,
    bonuses_approved_previous,
    count(*) over () as total_count,
    coalesce(e.all_closings_current, 0),
    coalesce(e.all_closings_previous, 0),
    coalesce(e.all_volume_current, 0),
    coalesce(e.all_volume_previous, 0),
    coalesce(e.all_commission_current, 0),
    coalesce(e.all_commission_previous, 0),
    coalesce(e.all_bonuses_current, 0),
    coalesce(e.all_bonuses_previous, 0),
    coalesce(e.all_bonuses_approved_current, 0),
    coalesce(e.all_bonuses_approved_previous, 0)
  from searched
  cross join everyone e
  order by
    case when p_ascending then sort_text end asc nulls last,
    case when not p_ascending then sort_text end desc nulls last,
    case when p_ascending then sort_number end asc nulls last,
    case when not p_ascending then sort_number end desc nulls last,
    agent_user_id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.agent_commission_report(date, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.agent_commission_report(date, text, text, boolean, integer, integer) to authenticated;

create or replace function public.agent_report_deals(
    p_agent_user_id uuid,
    p_cutoff date,
    p_limit integer default 10,
    p_offset integer default 0
)
returns table (
    deal_id uuid,
    property_label text,
    notarised_on date,
    status text,
    commission_amount numeric,
    total_count bigint
)
language sql stable security invoker
set search_path to 'public'
as $$
  select
    v.deal_id,
    v.property_label,
    v.notarised_on,
    v.status,
    v.commission_amount,
    count(*) over () as total_count
  from public.v_deal_commission v
  where v.agent_user_id = p_agent_user_id
    and v.notarised_on >= date_trunc('year', p_cutoff)::date
    and v.notarised_on <= p_cutoff
    and (p_agent_user_id = public.current_app_user_id()
         or public.has_permission('deals.report_all'))
  order by v.notarised_on desc, v.deal_id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

revoke all on function public.agent_report_deals(uuid, date, integer, integer) from public, anon;
grant execute on function public.agent_report_deals(uuid, date, integer, integer) to authenticated;

commit;
