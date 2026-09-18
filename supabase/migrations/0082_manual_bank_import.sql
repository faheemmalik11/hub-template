-- 0082_manual_bank_import — extend upsert_external_transactions for manual XML/CSV/Excel imports.
--
-- WHY: the client confirmed three transaction inflows (communication thread
-- 2026-08-04-scope-clarification, migration 0071): banksapi, pleo, manual. The manual path lets a
-- user upload account data for bank accounts BANKSapi cannot reach. Unlike pleo, a manual upload
-- targets one specific bank_accounts row chosen by the user in the wizard -- upsert_external_
-- transactions (0073) has no way to carry that, so every manual row would land with account_id
-- null, which also means the company_id trigger (0025) never fires.
--
-- account_id must be a parameter, not a per-row jsonb field: one manual upload = one account, and
-- keeping it out of the row payload means the Edge Function cannot be tricked into writing an
-- account_id the caller doesn't own by smuggling it into a row.
--
-- Also carries counterparty_iban/counterparty_bic through, which 0073 dropped silently -- without
-- it, manual rows can never benefit from IBAN-based auto-categorisation (0069) or OPOS whitelist
-- iban-scope matching (0029).
--
-- Signature changes, so this must DROP then CREATE (create or replace rejects a changed parameter
-- list) and re-issue the grants, since they do not survive a drop.

begin;

drop function if exists public.upsert_external_transactions(jsonb);

create function public.upsert_external_transactions(p_rows jsonb, p_account_id uuid default null)
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
      coalesce((r->>'is_sandbox')::boolean, false) as is_sandbox,
      r->>'transaction_type'    as transaction_type,
      coalesce(r->>'transaction_type_source','auto') as transaction_type_source,
      coalesce(r->'raw_data','{}'::jsonb) as raw_data,
      p_account_id as account_id
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
      booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
      is_sandbox, transaction_type, transaction_type_source, raw_data, account_id
    )
    select source, external_id, amount, currency, booking_date, value_date,
           booking_text, payment_reference, counterparty_holder, counterparty_iban, counterparty_bic,
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
      is_sandbox          = excluded.is_sandbox,
      transaction_type    = excluded.transaction_type,
      -- Pleo never passes p_account_id (stays null), so coalesce leaves an existing account_id
      -- untouched on re-sync. A manual re-upload against the (now believed correct) account can
      -- still correct a mis-attributed row by re-uploading against the right one.
      account_id          = coalesce(excluded.account_id, bt.account_id),
      -- MERGE, do not replace. Keys already present survive unless the provider sets them, so
      -- receipt metadata captured once is never lost to a later, thinner payload.
      raw_data            = coalesce(bt.raw_data, '{}'::jsonb) || excluded.raw_data
      -- matching_status, category_id, category_source, no_receipt_reason, company_id and
      -- whitelist_rule_id are DELIBERATELY absent: a sync must never undo a user's work.
      -- company_id is also absent here on purpose -- it is derived from account_id by the trigger
      -- in 0025, which fires on this same INSERT/UPDATE and keeps it in sync automatically.
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
    into v_inserted, v_updated
    from upserted;

  return query select v_inserted, v_updated;
end $$;

comment on function public.upsert_external_transactions(jsonb, uuid) is
  'Merge-safe upsert for provider syncs (pleo, manual, banksapi). Merges raw_data instead of '
  'replacing it and never writes user-owned columns. p_account_id applies to the whole batch '
  '(manual imports only; pleo omits it) and is coalesced on conflict so it is never cleared by a '
  're-sync. Use this rather than a PostgREST upsert.';

revoke all on function public.upsert_external_transactions(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.upsert_external_transactions(jsonb, uuid) to service_role;

commit;
