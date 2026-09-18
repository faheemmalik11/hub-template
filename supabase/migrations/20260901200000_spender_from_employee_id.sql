-- 176 Pleo rows carry only raw_data->>'employeeId' and no resolved employee object, so the first
-- backfill left them without a spender. The same person is resolved on other rows, so the id is
-- enough to fill them. Emails are lower-cased here and on write so they match app_users.

update public.bank_transactions t
   set spender_name  = coalesce(t.spender_name, k.spender_name),
       spender_email = coalesce(t.spender_email, k.spender_email)
  from (
    select distinct on (raw_data ->> 'employeeId')
           raw_data ->> 'employeeId' as employee_id,
           nullif(trim(
             coalesce(raw_data -> 'employee' ->> 'first_name', '') || ' ' ||
             coalesce(raw_data -> 'employee' ->> 'last_name', '')
           ), '') as spender_name,
           lower(nullif(trim(coalesce(raw_data -> 'employee' ->> 'email', '')), '')) as spender_email
      from public.bank_transactions
     where source = 'pleo'
       and jsonb_typeof(raw_data -> 'employee') = 'object'
       and nullif(trim(coalesce(raw_data ->> 'employeeId', '')), '') is not null
     order by raw_data ->> 'employeeId', imported_at desc
  ) k
 where t.source = 'pleo'
   and t.spender_email is null
   and t.raw_data ->> 'employeeId' = k.employee_id;

update public.bank_transactions
   set spender_email = lower(spender_email)
 where spender_email is not null
   and spender_email <> lower(spender_email);

create or replace function public.set_transaction_spender()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.spender_email := lower(nullif(trim(coalesce(new.spender_email, '')), ''));
  new.spender_name := nullif(trim(coalesce(new.spender_name, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_set_transaction_spender on public.bank_transactions;
create trigger trg_set_transaction_spender
  before insert or update of spender_email, spender_name on public.bank_transactions
  for each row execute function public.set_transaction_spender();
