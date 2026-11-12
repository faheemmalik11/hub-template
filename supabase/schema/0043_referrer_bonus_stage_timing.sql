-- referrer_payout_timing and referrer_tier_counts_status used to be two hard-wired cases each
-- (on_suggestion/after_commission_paid, suggested/paid). Both now pick from the same three stages a
-- deal already passes through: notarised_on is set, the deal is invoiced (create_deal_invoices sets
-- deals.status = 'invoiced' only once every party's invoice in the batch exists), or every commission
-- invoice on the deal is paid. Column names kept: what they hold hasn't changed, only how precisely.

begin;

alter table public.bonus_settings
    drop constraint if exists bonus_settings_referrer_payout_timing_check,
    drop constraint if exists bonus_settings_referrer_tier_counts_status_check;

update public.bonus_settings set referrer_payout_timing = case referrer_payout_timing
    when 'on_suggestion' then 'notarised'
    when 'after_commission_paid' then 'commission_received'
    else referrer_payout_timing
end;

update public.bonus_settings set referrer_tier_counts_status = case referrer_tier_counts_status
    when 'suggested' then 'notarised'
    when 'paid' then 'commission_received'
    else referrer_tier_counts_status
end;

alter table public.bonus_settings
    alter column referrer_payout_timing set default 'invoiced',
    alter column referrer_tier_counts_status set default 'invoiced',
    add constraint bonus_settings_referrer_payout_timing_check
        check (referrer_payout_timing in ('notarised', 'invoiced', 'commission_received')),
    add constraint bonus_settings_referrer_tier_counts_status_check
        check (referrer_tier_counts_status in ('notarised', 'invoiced', 'commission_received'));

create or replace function public.deal_stage_reached(p_deal_id uuid, p_stage text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select case p_stage
    when 'notarised' then exists (
        select 1 from public.deals where id = p_deal_id and notarised_on is not null
    )
    when 'invoiced' then exists (
        select 1 from public.deals where id = p_deal_id and status = 'invoiced'
    )
    when 'commission_received' then
        exists (
            select 1 from public.outgoing_invoices
             where deal_id = p_deal_id and kind = 'commission' and deleted_at is null
        )
        and not exists (
            select 1 from public.outgoing_invoices
             where deal_id = p_deal_id and kind = 'commission' and deleted_at is null
               and status <> 'paid'
        )
    else false
  end;
$$;

revoke execute on function public.deal_stage_reached(uuid, text) from public, anon;
grant execute on function public.deal_stage_reached(uuid, text) to authenticated;

create or replace function public.referrer_bonus_tier(p_referrer_customer_id uuid, p_earned_on date)
returns integer
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_settings public.bonus_settings;
  v_count integer;
begin
  select * into v_settings from public.bonus_settings;

  select count(*) into v_count
    from public.deal_referrer_bonuses b
   where (
     case v_settings.referrer_tier_scope
       when 'company_wide' then true
       else b.referrer_customer_id = p_referrer_customer_id
     end
   )
     and b.status <> 'cancelled'
     and public.deal_stage_reached(b.deal_id, v_settings.referrer_tier_counts_status)
     and (
       case v_settings.referrer_tier_reset
         when 'never' then true
         else extract(year from b.earned_on) = extract(year from p_earned_on)
       end
     );

  return v_count + 1;
end;
$$;

-- Mark-paid had no stage gate at all before this: any bonus could be marked paid the moment it was
-- suggested, regardless of referrer_payout_timing. An RPC, not a plain update, so the check runs
-- where it cannot be skipped, the same way create_deal_invoices and create_referrer_credit_note
-- validate their own preconditions server-side rather than trusting the caller.
create or replace function public.mark_referrer_bonus_paid(p_bonus_id uuid) returns void
language plpgsql security invoker set search_path to 'public'
as $$
declare
  v_bonus public.deal_referrer_bonuses;
  v_stage text;
begin
  select * into v_bonus from public.deal_referrer_bonuses where id = p_bonus_id;
  if not found then
    raise exception 'mark_referrer_bonus_paid: bonus % not found', p_bonus_id;
  end if;
  if v_bonus.status <> 'suggested' then
    raise exception 'mark_referrer_bonus_paid: bonus % is not suggested', p_bonus_id
      using errcode = 'check_violation';
  end if;

  select referrer_payout_timing into v_stage from public.bonus_settings;
  if not public.deal_stage_reached(v_bonus.deal_id, v_stage) then
    raise exception 'mark_referrer_bonus_paid: deal % has not reached the % stage yet',
      v_bonus.deal_id, v_stage using errcode = 'check_violation';
  end if;

  update public.deal_referrer_bonuses set status = 'paid' where id = p_bonus_id;
end;
$$;

revoke execute on function public.mark_referrer_bonus_paid(uuid) from public, anon;
grant execute on function public.mark_referrer_bonus_paid(uuid) to authenticated;

commit;
