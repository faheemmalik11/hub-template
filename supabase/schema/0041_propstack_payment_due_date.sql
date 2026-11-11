begin;

-- Both columns stay null until the real PropStack sync reads them: the two custom fields this
-- depends on do not exist in PropStack yet, so nothing writes here today except manual test data
-- and, eventually, the sync itself.
alter table public.properties
    add column if not exists payment_due_date date,
    add column if not exists payment_due_date_note text,
    add column if not exists payment_due_date_notified_at timestamptz;

-- Six weeks after the notary date, if a deal still has no payment due date on its property,
-- someone should be asked to chase it or enter the note explaining why there is none. Modelled
-- directly on notify_overdue_payments() (0023_expected_payment.sql): date math, a scan for the
-- still-missing case, one notification, a stamp column so it never fires twice for the same deal.
create or replace function public.notify_missing_payment_dates() returns integer
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  select array_agg(d.id) into v_ids
    from public.deals d
    join public.properties p on p.id = d.property_id
   where d.deleted_at is null
     and d.notarised_on < current_date - 42
     and p.payment_due_date is null
     and p.payment_due_date_note is null
     and p.payment_due_date_notified_at is null;
  v_count := coalesce(cardinality(v_ids), 0);
  if v_count = 0 then
    return 0;
  end if;

  perform public.notify_administrators(
    case when v_count = 1 then 'Eine Provision wartet seit über sechs Wochen auf ein Zahlungsziel'
         else v_count || ' Provisionen warten seit über sechs Wochen auf ein Zahlungsziel' end,
    '/commission-deals', 'reminder');

  update public.properties
     set payment_due_date_notified_at = now()
   where id in (select d.property_id from public.deals d where d.id = any (v_ids));

  return v_count;
end;
$$;

revoke execute on function public.notify_missing_payment_dates() from public, anon, authenticated;
grant execute on function public.notify_missing_payment_dates() to service_role;

commit;
