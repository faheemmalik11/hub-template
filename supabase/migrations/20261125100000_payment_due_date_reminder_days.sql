begin;

alter table public.invoice_settings
    add column if not exists payment_due_date_reminder_days integer not null default 42;

alter table public.invoice_settings
    drop constraint if exists invoice_settings_payment_due_date_reminder_days_sane;

alter table public.invoice_settings
    add constraint invoice_settings_payment_due_date_reminder_days_sane
    check (payment_due_date_reminder_days >= 0 and payment_due_date_reminder_days <= 365);

comment on column public.invoice_settings.payment_due_date_reminder_days is
    'Days after notarisation before administrators are reminded that a property still has no payment due date.';

create or replace function public.notify_missing_payment_dates() returns integer
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_ids uuid[];
  v_count integer;
  v_reminder_days integer;
begin
  select payment_due_date_reminder_days into v_reminder_days
    from public.invoice_settings where id = true;

  select array_agg(d.id) into v_ids
    from public.deals d
    join public.properties p on p.id = d.property_id
   where d.deleted_at is null
     and d.notarised_on < current_date - v_reminder_days
     and p.payment_due_date is null
     and p.payment_due_date_note is null
     and p.payment_due_date_notified_at is null;
  v_count := coalesce(cardinality(v_ids), 0);
  if v_count = 0 then
    return 0;
  end if;

  perform public.notify_administrators(
    case when v_count = 1
           then format('Eine Provision wartet seit mehr als %s Tagen auf ein Zahlungsziel', v_reminder_days)
         else format('%s Provisionen warten seit mehr als %s Tagen auf ein Zahlungsziel', v_count, v_reminder_days)
    end,
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
