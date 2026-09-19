-- 20260910170000_matching_threshold_and_difference_reason.sql
-- Add difference_reason column to match link tables and create matching_settings table.

-- 1. Columns for difference_reason
alter table public.invoice_transaction_matches
  add column if not exists difference_reason text null;

alter table public.outgoing_invoice_transaction_matches
  add column if not exists difference_reason text null;

-- 2. matching_settings singleton table
create table if not exists public.matching_settings (
  id bool primary key default true check (id),
  amount_tolerance numeric not null default 0.01,
  auto_match_threshold numeric not null default 0.90,
  candidate_threshold numeric not null default 0.60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.matching_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.matching_settings enable row level security;

drop policy if exists "matching_settings_select" on public.matching_settings;
create policy "matching_settings_select" on public.matching_settings
  for select using (true);

-- ADMINS ONLY. This was `auth.role() = 'authenticated'`, i.e. anybody with a login could widen the
-- amount tolerance for the whole company -- and this one row decides what the nightly sync accepts
-- as a match without asking anyone. Every other write on the bank screens is permission-gated;
-- this is the setting that governs them, so it cannot be the loosest thing on the page.
--
-- is_admin() rather than a new permission key: the row is global, not per company or per invoice,
-- and the permission model (migration 20260829150000) already treats settings of that shape as
-- administrative.
drop policy if exists "matching_settings_update" on public.matching_settings;
create policy "matching_settings_update" on public.matching_settings
  for update to authenticated
  using (is_admin()) with check (is_admin());

-- 3. Update link_invoice_transaction RPC to accept difference_reason
create or replace function public.link_invoice_transaction(
  p_invoice_id        uuid,
  p_transaction_id    uuid,
  p_score             numeric default null,
  p_reasons           jsonb   default null,
  p_amount            numeric default null,
  p_difference_reason text    default null
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
  if p_invoice_id is null or p_transaction_id is null then
    raise exception 'link_invoice_transaction: invoice and transaction are both required';
  end if;

  if not exists (select 1 from public.invoices where id = p_invoice_id and deleted_at is null) then
    raise exception 'link_invoice_transaction: invoice % not found', p_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.invoices where id = p_invoice_id and deleted_at is null;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_invoice_transaction: invoice % has no gross amount to allocate against',
      p_invoice_id;
  end if;

  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.invoice_transaction_matches
   where transaction_id = p_transaction_id and status = 'bestaetigt' and invoice_id <> p_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.invoice_transaction_matches
   where invoice_id = p_invoice_id and status = 'bestaetigt' and transaction_id <> p_invoice_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  v_amount := coalesce(p_amount, least(v_tx_rest, v_inv_rest));

  if v_amount is null or v_amount <= 0 then
    raise exception
      'link_invoice_transaction: nothing left to allocate (transaction free %, invoice open %)',
      v_tx_rest, v_inv_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_tx_rest + 0.01 then
    raise exception 'link_invoice_transaction: amount % exceeds the transaction remainder %',
      v_amount, v_tx_rest using errcode = 'check_violation';
  end if;
  if v_amount > v_inv_rest + 0.01 then
    raise exception 'link_invoice_transaction: amount % exceeds the invoice remainder %',
      v_amount, v_inv_rest using errcode = 'check_violation';
  end if;

  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
  v_released := found;

  insert into public.invoice_transaction_matches
         (invoice_id, transaction_id, status, score, match_reasons, amount_matched,
          difference_reason, matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_invoice_id, p_transaction_id, 'bestaetigt', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          p_difference_reason, v_actor, v_actor, v_now, v_now)
  on conflict (invoice_id, transaction_id) do update
     set status            = 'bestaetigt',
         amount_matched    = excluded.amount_matched,
         score             = coalesce(excluded.score, public.invoice_transaction_matches.score),
         match_reasons     = coalesce(excluded.match_reasons, public.invoice_transaction_matches.match_reasons),
         difference_reason = coalesce(excluded.difference_reason, public.invoice_transaction_matches.difference_reason),
         confirmed_by      = excluded.confirmed_by,
         confirmed_at      = excluded.confirmed_at,
         rejected_by       = null,
         rejected_at       = null,
         reject_reason     = null,
         updated_at        = v_now
  returning id into v_match_id;

  if public.transaction_allocated_sum(p_transaction_id) >= v_tx_total - 0.01 then
    update public.invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: transaction fully allocated',
           updated_at    = v_now
     where transaction_id = p_transaction_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  if public.invoice_matched_sum(p_invoice_id)
     >= v_inv_gross - public.payment_tolerance(v_inv_gross) then
    update public.invoice_transaction_matches
       set status        = 'abgelehnt',
           rejected_by   = v_actor,
           rejected_at   = v_now,
           reject_reason = 'superseded: invoice fully allocated',
           updated_at    = v_now
     where invoice_id = p_invoice_id and status in ('kandidat', 'auto');
    get diagnostics v_batch = row_count;
    v_withdrawn := v_withdrawn + v_batch;
  end if;

  insert into public.invoice_history (invoice_id, type, text, actor, data)
  values (p_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when v_amount < v_tx_total - 0.01
                    then format(' (%s EUR von %s EUR)',
                                to_char(v_amount, 'FM999G999G990D00'),
                                to_char(v_tx_total, 'FM999G999G990D00'))
                    else format(' (%s EUR)', to_char(v_amount, 'FM999G999G990D00')) end
            || case when p_difference_reason is not null then format(', Differenzgrund: %s', p_difference_reason) else '' end
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s Vorschlag/Vorschläge zurückgezogen', v_withdrawn) else '' end
            || case when v_released then ', Ausblendung "kein Beleg zu erwarten" aufgehoben' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'difference_reason', p_difference_reason,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released));

  return v_match_id;
end $$;

revoke execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric, text) from anon, public;
grant execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric, text) to authenticated;
