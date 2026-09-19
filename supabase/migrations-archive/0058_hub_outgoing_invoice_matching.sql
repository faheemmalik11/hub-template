-- 0045_outgoing_invoice_matching.sql
-- Bank-matching for outgoing invoices (money coming IN), the follow-up migration 0039 itself
-- deferred: "Real bank-matching for outgoing invoices ... is a clean, independently buildable
-- follow-up." Mirrors the incoming-invoice model (0001, 0024) as closely as the data allows:
--
--   invoice_transaction_matches          <->  outgoing_invoice_transaction_matches
--   invoice_matched_sum / transaction_allocated_sum  <->  outgoing_invoice_matched_sum / outgoing_transaction_allocated_sum
--   link_invoice_transaction             <->  link_outgoing_invoice_transaction
--
-- Deliberately NOT mirrored:
--   * No paid_at/paid_source sync onto outgoing_invoices. LexOffice is the source of truth for
--     voucher_status (0039's own rule) -- reconciliation state lives entirely in the new match
--     table, independent of voucher_status. So there is no equivalent of
--     sync_invoice_paid_from_matches() here, and no trigger touches outgoing_invoices at all.
--   * No invoice_history equivalent -- outgoing_invoices has no FK'd audit table. change_history
--     (generic table_name/record_id log, already used elsewhere) is used instead.
--   * customers has no iban/bic (unlike suppliers), so scoreMatch()'s IBAN signal never fires for
--     this direction. That's a frontend/edge-function concern (matching.ts), not a schema one --
--     nothing to add here for it.
--
-- A given bank_transactions row can only ever be linked in ONE of the two match tables in
-- practice: incoming matching only considers amount < 0 (debits), outgoing matching only
-- amount > 0 (credits), so summing "confirmed allocation" across both tables for a single
-- transaction is a safe union, never a real ambiguity.

begin;

-- ---------------------------------------------------------------------------
-- 1. outgoing_invoice_transaction_matches
-- ---------------------------------------------------------------------------
create table if not exists public.outgoing_invoice_transaction_matches (
  id                  uuid primary key default gen_random_uuid(),
  outgoing_invoice_id uuid not null references public.outgoing_invoices(id),
  transaction_id      uuid not null references public.bank_transactions(id) on delete cascade,
  status              text not null default 'kandidat'
                        check (status in ('kandidat', 'auto', 'bestaetigt', 'abgelehnt')),
  score               numeric,
  match_reasons       jsonb,
  amount_matched      numeric not null check (amount_matched > 0),
  matched_by          text,
  matched_at          timestamptz not null default now(),
  confirmed_by        text,
  confirmed_at        timestamptz,
  rejected_by         text,
  rejected_at         timestamptz,
  reject_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (outgoing_invoice_id, transaction_id)
);

comment on table public.outgoing_invoice_transaction_matches is
  'Outgoing-invoice side of bank matching: an outgoing invoice (revenue) linked to an incoming '
  '(credit) bank transaction. Same m:n/partial-amount model as invoice_transaction_matches, '
  'mirrored for the opposite direction.';

create index if not exists outgoing_matches_invoice_idx
  on public.outgoing_invoice_transaction_matches (outgoing_invoice_id);
create index if not exists outgoing_matches_transaction_idx
  on public.outgoing_invoice_transaction_matches (transaction_id);
create index if not exists outgoing_matches_status_idx
  on public.outgoing_invoice_transaction_matches (status);
create index if not exists outgoing_matches_transaction_confirmed_idx
  on public.outgoing_invoice_transaction_matches (transaction_id) where status = 'bestaetigt';
create index if not exists outgoing_matches_invoice_confirmed_idx
  on public.outgoing_invoice_transaction_matches (outgoing_invoice_id) where status = 'bestaetigt';

alter table public.outgoing_invoice_transaction_matches enable row level security;

drop policy if exists "outgoing_matches_read" on public.outgoing_invoice_transaction_matches;
create policy "outgoing_matches_read" on public.outgoing_invoice_transaction_matches
  for select to authenticated using (true);

drop policy if exists "outgoing_matches_insert" on public.outgoing_invoice_transaction_matches;
create policy "outgoing_matches_insert" on public.outgoing_invoice_transaction_matches
  for insert to authenticated with check (true);

drop policy if exists "outgoing_matches_update" on public.outgoing_invoice_transaction_matches;
create policy "outgoing_matches_update" on public.outgoing_invoice_transaction_matches
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. Confirmed allocation helpers (mirror invoice_matched_sum/transaction_allocated_sum)
-- ---------------------------------------------------------------------------
create or replace function public.outgoing_invoice_matched_sum(p_outgoing_invoice uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount_matched), 0)
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = p_outgoing_invoice and status = 'bestaetigt';
$$;

create or replace function public.outgoing_transaction_allocated_sum(p_transaction uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount_matched), 0)
    from public.outgoing_invoice_transaction_matches
   where transaction_id = p_transaction and status = 'bestaetigt';
$$;

grant execute on function public.outgoing_invoice_matched_sum(uuid) to authenticated;
grant execute on function public.outgoing_transaction_allocated_sum(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Extend sync_transaction_matching_status() to see BOTH tables' confirmed allocation, and
--    attach it to the new table too. A debit transaction only ever has incoming rows, a credit
--    only ever has outgoing rows, so adding the two sums is safe for every transaction.
-- ---------------------------------------------------------------------------
create or replace function public.sync_transaction_matching_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx    uuid := coalesce(new.transaction_id, old.transaction_id);
  v_total numeric;
  v_alloc numeric;
begin
  select abs(amount) into v_total from public.bank_transactions where id = v_tx;
  if v_total is null then
    return null;
  end if;

  v_alloc := public.transaction_allocated_sum(v_tx) + public.outgoing_transaction_allocated_sum(v_tx);

  update public.bank_transactions t
     set matching_status = case
           when v_alloc > 0 and v_alloc >= v_total - 0.01 then 'zugeordnet'
           else 'offen'
         end
   where t.id = v_tx
     and t.matching_status <> 'ignoriert';

  return null;
end;
$$;

drop trigger if exists trg_sync_outgoing_transaction_matching_status
  on public.outgoing_invoice_transaction_matches;
create trigger trg_sync_outgoing_transaction_matching_status
  after insert or update or delete on public.outgoing_invoice_transaction_matches
  for each row execute function public.sync_transaction_matching_status();

-- ---------------------------------------------------------------------------
-- 4. Over-allocation guard (mirror check_match_allocation)
-- ---------------------------------------------------------------------------
create or replace function public.check_outgoing_match_allocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_total  numeric;
  v_tx_other  numeric;
  v_inv_gross numeric;
  v_inv_other numeric;
begin
  if new.status is distinct from 'bestaetigt' then
    return new;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = new.transaction_id;
  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.outgoing_invoice_transaction_matches
   where transaction_id = new.transaction_id and status = 'bestaetigt' and id <> new.id;

  if v_tx_total is not null and v_tx_other + new.amount_matched > v_tx_total + 0.01 then
    raise exception
      'outgoing match allocation: transaction total %, already allocated %, requested % -- would over-allocate',
      v_tx_total, v_tx_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  select abs(amount_gross) into v_inv_gross
    from public.outgoing_invoices where id = new.outgoing_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = new.outgoing_invoice_id and status = 'bestaetigt' and id <> new.id;

  if v_inv_gross is not null and v_inv_gross > 0
     and v_inv_other + new.amount_matched > v_inv_gross + 0.01 then
    raise exception
      'outgoing match allocation: invoice gross %, already allocated %, requested % -- would over-allocate',
      v_inv_gross, v_inv_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_outgoing_match_allocation on public.outgoing_invoice_transaction_matches;
create trigger trg_check_outgoing_match_allocation
  before insert or update on public.outgoing_invoice_transaction_matches
  for each row execute function public.check_outgoing_match_allocation();

-- ---------------------------------------------------------------------------
-- 5. link_outgoing_invoice_transaction: manual confirm, m:n with a per-pair amount.
--    Mirrors link_invoice_transaction. Logs to change_history (table_name='outgoing_invoices')
--    since there is no invoice_history-equivalent FK'd to outgoing_invoices.
-- ---------------------------------------------------------------------------
create or replace function public.link_outgoing_invoice_transaction(
  p_outgoing_invoice_id uuid,
  p_transaction_id      uuid,
  p_score               numeric default null,
  p_reasons             jsonb   default null,
  p_amount              numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_now        timestamptz := now();
  v_match_id   uuid;
  v_withdrawn  int := 0;
  v_batch      int;
  v_released   boolean := false;
  v_tx_total   numeric;
  v_tx_other   numeric;
  v_tx_rest    numeric;
  v_inv_gross  numeric;
  v_inv_other  numeric;
  v_inv_rest   numeric;
  v_amount     numeric;
begin
  if p_outgoing_invoice_id is null or p_transaction_id is null then
    raise exception 'link_outgoing_invoice_transaction: invoice and transaction are both required';
  end if;

  if not exists (select 1 from public.outgoing_invoices where id = p_outgoing_invoice_id) then
    raise exception 'link_outgoing_invoice_transaction: outgoing invoice % not found', p_outgoing_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_outgoing_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.outgoing_invoices where id = p_outgoing_invoice_id;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_outgoing_invoice_transaction: invoice % has no gross amount to allocate against',
      p_outgoing_invoice_id;
  end if;

  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.outgoing_invoice_transaction_matches
   where transaction_id = p_transaction_id and status = 'bestaetigt'
     and outgoing_invoice_id <> p_outgoing_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.outgoing_invoice_transaction_matches
   where outgoing_invoice_id = p_outgoing_invoice_id and status = 'bestaetigt'
     and transaction_id <> p_transaction_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  v_amount := coalesce(p_amount, least(v_tx_rest, v_inv_rest));

  if v_amount is null or v_amount <= 0 then
    raise exception
      'link_outgoing_invoice_transaction: nothing left to allocate (transaction free %, invoice open %)',
      v_tx_rest, v_inv_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_tx_rest + 0.01 then
    raise exception 'link_outgoing_invoice_transaction: amount % exceeds the transaction remainder %',
      v_amount, v_tx_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_inv_rest + 0.01 then
    raise exception 'link_outgoing_invoice_transaction: amount % exceeds the invoice remainder %',
      v_amount, v_inv_rest using errcode = 'check_violation';
  end if;

  -- A credit is being linked, so "no receipt expected" was wrong -- release the hide first, same
  -- as the incoming side.
  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
  v_released := found;

  insert into public.outgoing_invoice_transaction_matches
         (outgoing_invoice_id, transaction_id, status, score, match_reasons, amount_matched,
          matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_outgoing_invoice_id, p_transaction_id, 'bestaetigt', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          v_actor, v_actor, v_now, v_now)
  on conflict (outgoing_invoice_id, transaction_id) do update
     set status         = 'bestaetigt',
         amount_matched = excluded.amount_matched,
         score          = coalesce(excluded.score, public.outgoing_invoice_transaction_matches.score),
         match_reasons  = coalesce(excluded.match_reasons, public.outgoing_invoice_transaction_matches.match_reasons),
         confirmed_by   = excluded.confirmed_by,
         confirmed_at   = excluded.confirmed_at,
         rejected_by    = null,
         rejected_at    = null,
         reject_reason  = null,
         updated_at     = v_now
  returning id into v_match_id;

  if public.outgoing_transaction_allocated_sum(p_transaction_id) >= v_tx_total - 0.01 then
    update public.outgoing_invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: transaction fully allocated',
           updated_at    = v_now
     where transaction_id = p_transaction_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  if public.outgoing_invoice_matched_sum(p_outgoing_invoice_id) >= v_inv_gross - 0.01 then
    update public.outgoing_invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: invoice fully allocated',
           updated_at    = v_now
     where outgoing_invoice_id = p_outgoing_invoice_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  insert into public.change_history (table_name, record_id, type, text, actor, data, at)
  values ('outgoing_invoices', p_outgoing_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when v_amount < v_tx_total - 0.01
                    then format(' (%s EUR von %s EUR)',
                                to_char(v_amount, 'FM999G999G990D00'),
                                to_char(v_tx_total, 'FM999G999G990D00'))
                    else format(' (%s EUR)', to_char(v_amount, 'FM999G999G990D00')) end
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s Vorschlag/Vorschläge zurückgezogen', v_withdrawn) else '' end
            || case when v_released then ', Ausblendung "kein Beleg zu erwarten" aufgehoben' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released),
          v_now);

  return v_match_id;
end;
$$;

grant execute on function public.link_outgoing_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- declare
--   v_company  uuid;
--   v_customer uuid;
--   v_account  uuid;
--   v_conn     uuid;
--   v_invoice  uuid;
--   v_tx       uuid;
--   v_match_id uuid;
--   v_status   text;
-- begin
--   select id into v_company from public.companies limit 1;
--   select id into v_conn from public.bank_connections limit 1;
--   select id into v_account from public.bank_accounts limit 1;
--
--   insert into public.customers (company_id, name) values (v_company, 'Selbsttest GmbH')
--     returning id into v_customer;
--   insert into public.outgoing_invoices (company_id, customer_id, lexoffice_voucher_id, amount_net, amount_gross)
--     values (v_company, v_customer, gen_random_uuid(), 100, 119)
--     returning id into v_invoice;
--   insert into public.bank_transactions (account_id, connection_id, banksapi_hash, amount, matching_status)
--     values (v_account, v_conn, 'selftest-outgoing-045', 119, 'offen')
--     returning id into v_tx;
--
--   v_match_id := public.link_outgoing_invoice_transaction(v_invoice, v_tx);
--   assert public.outgoing_invoice_matched_sum(v_invoice) = 119, 'coverage not recorded';
--
--   select matching_status into v_status from public.bank_transactions where id = v_tx;
--   assert v_status = 'zugeordnet', 'transaction not flipped to zugeordnet';
--
--   -- old incoming-side machinery must be untouched
--   assert public.transaction_allocated_sum(v_tx) = 0, 'incoming sum leaked into a credit-only transaction';
--
--   delete from public.outgoing_invoice_transaction_matches where id = v_match_id;
--   delete from public.bank_transactions where id = v_tx;
--   delete from public.outgoing_invoices where id = v_invoice;
--   delete from public.customers where id = v_customer;
--
--   raise notice 'self-check ok';
-- end $$;
