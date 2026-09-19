-- 0073_upsert_external_transaction — merge-safe upsert for provider syncs.
--
-- WHY: a plain PostgREST upsert REPLACES raw_data. The Pleo backfill stored rich receipt
-- metadata there (mime_type, size_bytes, storage_ref) taken from the old pleo_receipt table,
-- but Pleo's accounting-entries search response does not return those fields. So every re-sync
-- overwrote good data with less data -- verified: 6 re-synced rows lost their receipt metadata,
-- and a ?full=1 run would have wiped all ~1,974.
--
-- This function merges instead: existing raw_data keys survive unless the new payload sets them.
-- It also leaves locally-owned columns (matching_status, category_id, no_receipt_reason, ...)
-- untouched on update -- those belong to the user, never to the provider.

begin;

create or replace function public.upsert_external_transactions(p_rows jsonb)
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
      coalesce((r->>'is_sandbox')::boolean, false) as is_sandbox,
      r->>'transaction_type'    as transaction_type,
      coalesce(r->>'transaction_type_source','auto') as transaction_type_source,
      coalesce(r->'raw_data','{}'::jsonb) as raw_data
    from jsonb_array_elements(p_rows) as r
  ),
  -- Collapse duplicates inside one call: Postgres refuses an ON CONFLICT statement that touches
  -- the same row twice ("cannot affect row a second time"), which would abort the whole batch.
  deduped as (
    select distinct on (source, external_id) *
      from incoming
     where external_id is not null and source is not null
     order by source, external_id
  ),
  upserted as (
    insert into public.bank_transactions as bt (
      source, external_id, amount, currency, booking_date, value_date,
      booking_text, payment_reference, counterparty_holder,
      is_sandbox, transaction_type, transaction_type_source, raw_data
    )
    select source, external_id, amount, currency, booking_date, value_date,
           booking_text, payment_reference, counterparty_holder,
           is_sandbox, transaction_type, transaction_type_source, raw_data
      from deduped
    on conflict (source, external_id) do update set
      amount              = excluded.amount,
      currency            = excluded.currency,
      booking_date        = excluded.booking_date,
      value_date          = excluded.value_date,
      booking_text        = excluded.booking_text,
      payment_reference   = excluded.payment_reference,
      counterparty_holder = excluded.counterparty_holder,
      is_sandbox          = excluded.is_sandbox,
      transaction_type    = excluded.transaction_type,
      -- MERGE, do not replace. Keys already present survive unless the provider sets them, so
      -- receipt metadata captured once is never lost to a later, thinner payload.
      raw_data            = coalesce(bt.raw_data, '{}'::jsonb) || excluded.raw_data
      -- matching_status, category_id, category_source, no_receipt_reason, company_id and
      -- whitelist_rule_id are DELIBERATELY absent: a sync must never undo a user's work.
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return query select v_inserted, v_updated;
end $$;

comment on function public.upsert_external_transactions(jsonb) is
  'Merge-safe upsert for provider syncs (pleo, manual, banksapi). Merges raw_data instead of '
  'replacing it and never writes user-owned columns. Use this rather than a PostgREST upsert.';

revoke all on function public.upsert_external_transactions(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_external_transactions(jsonb) to service_role;

commit;
