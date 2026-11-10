-- Turns a paid referrer bonus (deal_referrer_bonuses, migration 0032) into the accounting record of
-- that payout: an outgoing_invoices row with kind = 'referral_credit', the kind the table already
-- anticipated (0008_workspace.sql) for exactly this — "paid out to whoever recommended the
-- customer, so it names the deal that earned it rather than another invoice". No VAT split: the
-- client's figures are flat euro amounts with no VAT ever mentioned, so net and gross are the same.
-- Re-runnable.

begin;

create or replace function public.create_referrer_credit_note(p_bonus_id uuid)
    returns public.outgoing_invoices
    language plpgsql security invoker
    set search_path to 'public'
    as $$
declare
  v_bonus public.deal_referrer_bonuses;
  v_deal public.deals;
  v_invoice public.outgoing_invoices;
begin
  select * into v_bonus from public.deal_referrer_bonuses where id = p_bonus_id;
  if not found then
    raise exception 'create_referrer_credit_note: bonus % not found', p_bonus_id;
  end if;
  if v_bonus.status <> 'paid' then
    raise exception 'create_referrer_credit_note: bonus % is not paid', p_bonus_id
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.outgoing_invoices
     where deal_id = v_bonus.deal_id and kind = 'referral_credit' and deleted_at is null
  ) then
    raise exception 'create_referrer_credit_note: a credit note already exists for deal %',
      v_bonus.deal_id using errcode = 'unique_violation';
  end if;

  select * into v_deal from public.deals where id = v_bonus.deal_id and deleted_at is null;
  if not found then
    raise exception 'create_referrer_credit_note: deal % not found', v_bonus.deal_id;
  end if;

  insert into public.outgoing_invoices (
    company_id, customer_id, kind, deal_id,
    status, invoice_date, amount_net, amount_gross
  ) values (
    v_deal.company_id, v_bonus.referrer_customer_id, 'referral_credit', v_bonus.deal_id,
    'draft', coalesce(v_bonus.paid_at::date, current_date), v_bonus.amount, v_bonus.amount
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke execute on function public.create_referrer_credit_note(uuid) from public, anon;
grant execute on function public.create_referrer_credit_note(uuid) to authenticated;

commit;
