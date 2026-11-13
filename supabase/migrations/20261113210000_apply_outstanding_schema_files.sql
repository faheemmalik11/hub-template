begin;

drop function if exists public.agent_commission_report(date);

-- A historic sale entered for statistics only; approve_deal, create_deal_invoices and save_deal
-- are all gated to other status values, so none of them can ever touch a settled deal.


alter table public.deals
    drop constraint deals_status_known,
    add constraint deals_status_known
        check (status in ('incomplete', 'ready', 'approved', 'invoiced', 'cancelled', 'settled'));


-- deals_read/broker_bonuses_approved_read are gated on documents.read/bonuses.read, which ordinary
-- staff already hold -- RLS alone would not stop them seeing every agent's figures here just
-- because they lack deals.report_all. The own-agent-or-report-all check below is this function's
-- own, deliberate gate, not something left to row level security to enforce incidentally.
-- property_broker_user_id IS security definer, so a caller without master_data.read still gets a
-- correct agent_user_id for a deal attributed only through the CRM-assigned property broker.


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


-- A view built on select d.* freezes its column list when it is created, so the lexoffice_*
-- columns added to documents afterwards never appeared here and a filter on them failed.
-- create or replace cannot widen a view, so the three are dropped and rebuilt in order.


drop view if exists public.v_documents_review;
drop view if exists public.v_documents_search;
drop view if exists public.v_documents_list;

create or replace view public.v_documents_list with (security_invoker = true) as
select d.*,
       coalesce(s.name, d.issuer) as issuer_sort,
       -- Every failed check adds its own weight, and low confidence adds a little more. Both come
       -- from tables, so a client can reorder their own review list without a deploy.
       (
         coalesce((
           select sum(r.weight)
             from public.review_score_rules r
            where r.is_active
              and (r.applies_to_small_amounts or coalesce(d.is_small_amount, false) = false)
              and d.validation ->> r.check_key = 'false'
         ), 0)
         +
         coalesce((
           select case
                    when lowest is null then 0
                    when lowest < b.low_below then b.low_weight
                    when lowest < b.medium_below then b.medium_weight
                    else 0
                  end
             from public.review_confidence_bands b
             cross join lateral (
               select min(e.value::numeric) as lowest
                 from jsonb_each_text(coalesce(d.extracted -> b.confidence_key, '{}'::jsonb)) e
                where e.value ~ '^[0-9.]+$'
             ) c
         ), 0)
       )::integer as review_score,
       exists (
         select 1 from public.document_transaction_matches m
          where m.document_id = d.id and m.status in ('candidate', 'auto')
       ) as has_suggested_bank_match,
       exists (
         select 1 from public.document_transaction_matches m
          where m.document_id = d.id and m.status = 'confirmed'
       ) as has_confirmed_bank_match
  from public.documents d
  left join public.suppliers s on s.id = d.supplier_id
 where d.deleted_at is null
   -- A document that was split into its parts is represented by those parts, not by itself.
   and coalesce(d.status, '') <> 'split';

create or replace view public.v_documents_search with (security_invoker = true) as
select l.*,
       lower(concat_ws(' ',
           l.issuer,
           l.invoice_number,
           l.service_description,
           l.cost_category,
           to_char(l.amount_gross, 'FM9999999990.00'),
           replace(to_char(l.amount_gross, 'FM9999999990.00'), '.', ','),
           to_char(l.amount_gross, 'FM9,999,999,990.00'),
           translate(to_char(l.amount_gross, 'FM9,999,999,990.00'), ',.', '.,')
       )) as search_text
  from public.v_documents_list l;

create or replace view public.v_documents_review with (security_invoker = true) as
select *
  from public.v_documents_search
 where workflow_status in ('received', 'in_review', 'query')
    or review_score > 0
    or traffic_light in ('yellow', 'red');



-- The scorer returns 0..1 (_shared/matching.ts), and every reader's own fallback was already a
-- fraction, but the column defaults shipped as 60.00 and 95.00, so `score < candidate_threshold`
-- was always true and the nightly sync never wrote a match for anybody.


update public.matching_settings
   set candidate_threshold = candidate_threshold / 100
 where candidate_threshold > 1;

update public.matching_settings
   set auto_match_threshold = auto_match_threshold / 100
 where auto_match_threshold > 1;

alter table public.matching_settings
    alter column candidate_threshold type numeric(4, 3),
    alter column auto_match_threshold type numeric(4, 3),
    alter column candidate_threshold set default 0.6,
    alter column auto_match_threshold set default 0.95;

alter table public.matching_settings
    drop constraint if exists matching_settings_thresholds_are_fractions;

alter table public.matching_settings
    add constraint matching_settings_thresholds_are_fractions
        check (candidate_threshold between 0 and 1 and auto_match_threshold between 0 and 1);


-- agent_commission_report is re-created here rather than edited in 0049: it reads a column this
-- file introduces, and Postgres will not replace a function whose output columns have changed.


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
