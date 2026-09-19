-- Who made the payment. Pleo reports it per entry; it only ever reached raw_data, so nothing could
-- show, sort or filter by it. Null for banksapi/manual rows, which carry no such field.

alter table public.bank_transactions
  add column if not exists spender_name text,
  add column if not exists spender_email text;

comment on column public.bank_transactions.spender_name is
  'Person who made the payment (Pleo employee). Null when the source does not report one.';
comment on column public.bank_transactions.spender_email is
  'Stable key for spender_name. Matches app_users.email when that person also has a Hub account.';

create index if not exists bank_transactions_spender_email_idx
  on public.bank_transactions (spender_email)
  where spender_email is not null;

update public.bank_transactions
   set spender_name = nullif(
         trim(
           coalesce(raw_data -> 'employee' ->> 'first_name', '') || ' ' ||
           coalesce(raw_data -> 'employee' ->> 'last_name', '')
         ),
         ''
       ),
       spender_email = nullif(trim(coalesce(raw_data -> 'employee' ->> 'email', '')), '')
 where source = 'pleo'
   and raw_data -> 'employee' is not null
   and spender_email is null;

create or replace function public.upsert_external_transactions(p_rows jsonb, p_account_id uuid default null)
returns table (inserted_count int, updated_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_external_transactions: p_rows must be a JSON array';
  end if;

  with incoming as (
    select
      r->>'source'              as source,
      r->>'external_id'         as external_id,
      (r->>'amount')::numeric   as amount,
      r->>'currency'            as currency,
      nullif(r->>'booking_date','')::date as booking_date,
      nullif(r->>'value_date','')::date   as value_date,
      r->>'booking_text'        as booking_text,
      r->>'payment_reference'   as payment_reference,
      r->>'counterparty_holder' as counterparty_holder,
      r->>'counterparty_iban'   as counterparty_iban,
      r->>'counterparty_bic'    as counterparty_bic,
      nullif(trim(coalesce(r->>'spender_name','')),'')  as spender_name,
      nullif(trim(coalesce(r->>'spender_email','')),'') as spender_email,
      coalesce((r->>'is_sandbox')::boolean, false) as is_sandbox,
      r->>'transaction_type'    as transaction_type,
      coalesce(r->>'transaction_type_source','auto') as transaction_type_source,
      coalesce(r->'raw_data','{}'::jsonb) as raw_data,
      p_account_id as account_id
    from jsonb_array_elements(p_rows) as r
  ),
  deduped as (
    select distinct on (source, external_id) *
      from incoming
     where external_id is not null and source is not null
     order by source, external_id
  ),
  upserted as (
    insert into public.bank_transactions as bt (
      source, external_id, amount, currency, booking_date, value_date,
      booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
      spender_name, spender_email,
      is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
    )
    select source, external_id, amount, currency, booking_date, value_date,
           booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
           spender_name, spender_email,
           is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
      from deduped
    on conflict (source, external_id) do update set
      amount              = excluded.amount,
      currency            = excluded.currency,
      booking_date        = excluded.booking_date,
      value_date          = excluded.value_date,
      booking_text        = excluded.booking_text,
      payment_reference   = excluded.payment_reference,
      counterparty_holder = excluded.counterparty_holder,
      counterparty_iban   = excluded.counterparty_iban,
      counterparty_bic    = excluded.counterparty_bic,
      spender_name        = coalesce(excluded.spender_name, bt.spender_name),
      spender_email       = coalesce(excluded.spender_email, bt.spender_email),
      is_sandbox          = excluded.is_sandbox,
      transaction_type    = excluded.transaction_type,
      account_id          = coalesce(excluded.account_id, bt.account_id),
      raw_data            = coalesce(bt.raw_data, '{}'::jsonb) || excluded.raw_data
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return query select v_inserted, v_updated;
end $$;

revoke all on function public.upsert_external_transactions(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.upsert_external_transactions(jsonb, uuid) to service_role;
