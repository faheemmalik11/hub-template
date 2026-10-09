-- Seller commission invoices get an expected payment date (notary date + 8 weeks) and the
-- administrators are told once when it passes. Run in the Supabase SQL editor; re-runnable.

begin;

alter table public.outgoing_invoices add column if not exists overdue_notified_at timestamptz;

create or replace function public.seller_payment_wait_days() returns integer
language sql immutable as $$ select 56 $$;

create or replace function public.expected_payment_for_party(p_deal_party_id uuid) returns date
language sql stable security definer set search_path to 'public'
as $$
  select d.notarised_on + public.seller_payment_wait_days()
    from public.deal_parties dp
    join public.deal_sides s on s.id = dp.deal_side_id
    join public.deals d on d.id = s.deal_id
   where dp.id = p_deal_party_id and s.side = 'seller';
$$;

create or replace function public.set_expected_payment_on() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.expected_payment_on is null and new.due_date is null
     and new.deal_party_id is not null and new.kind is distinct from 'referral_credit' then
    new.expected_payment_on := public.expected_payment_for_party(new.deal_party_id);
  end if;
  return new;
end;
$$;

drop trigger if exists outgoing_invoices_set_expected_payment on public.outgoing_invoices;
create trigger outgoing_invoices_set_expected_payment
    before insert or update of deal_party_id, due_date on public.outgoing_invoices
    for each row execute function public.set_expected_payment_on();

create or replace function public.notify_overdue_payments() returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select array_agg(id) into v_ids
    from public.outgoing_invoices
   where deleted_at is null
     and status in ('sent', 'overdue')
     and due_date is null
     and expected_payment_on < current_date
     and overdue_notified_at is null;
  v_count := coalesce(cardinality(v_ids), 0);
  if v_count = 0 then
    return 0;
  end if;

  perform public.notify_administrators(
    case when v_count = 1 then 'Eine Provisionsrechnung ist überfällig'
         else v_count || ' Provisionsrechnungen sind überfällig' end,
    '/outgoing-invoices', 'payment');
  update public.outgoing_invoices set overdue_notified_at = now() where id = any (v_ids);
  return v_count;
end;
$$;

revoke execute on function public.notify_overdue_payments() from public, anon, authenticated;
grant execute on function public.notify_overdue_payments() to service_role;
revoke execute on function public.expected_payment_for_party(uuid) from public, anon, authenticated;
revoke execute on function public.set_expected_payment_on() from public, anon, authenticated;

update public.outgoing_invoices
   set expected_payment_on = public.expected_payment_for_party(deal_party_id)
 where expected_payment_on is null and due_date is null and deal_party_id is not null
   and kind is distinct from 'referral_credit';

do $cron$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'overdue-payments') then
      perform cron.unschedule('overdue-payments');
    end if;
    perform cron.schedule('overdue-payments', '0 6 * * *', 'select public.notify_overdue_payments()');
  end if;
end
$cron$;

commit;
