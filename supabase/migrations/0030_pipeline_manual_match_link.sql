-- 0019_manual_match_link — link ONE invoice to ONE bank transaction by hand, atomically.
--
-- WHY (Briefing Screen 8, "Receipt-↔-transaction reconciliation"): "Link receipt and transaction — and
-- unlink again, if the assignment was wrong." The Hub could confirm or reject a match the MATCHER had
-- proposed, but there was no way to link a pair the matcher never suggested — and the open-items list is
-- exactly where a human spots those.
--
-- Everything below has to happen together or not at all, which is why it is one function and not three
-- client round-trips:
--   1. release an OPOS whitelist hide on the transaction — if a receipt is being linked, the "this can
--      never have a receipt" verdict was wrong (and the 0001 sync trigger refuses to touch an
--      'ignoriert' row, so the hide would otherwise silently block step 2);
--   2. record the pair as 'bestaetigt' — INSERT, or UPDATE when the matcher already proposed this exact
--      pair. The table has UNIQUE (invoice_id, transaction_id), so a plain INSERT fails on any pair that
--      already has a suggestion;
--   3. withdraw every OTHER pending suggestion touching either side. Once this invoice is paid by this
--      transaction, a suggestion pairing either of them with something else is stale and must stop being
--      offered.
-- The existing triggers own the rest: a 'bestaetigt' match flips bank_transactions.matching_status to
-- 'zugeordnet' (so it leaves the open items) and, at full-cent coverage, stamps invoices.paid_at.
--
-- Withdrawn suggestions are set to 'abgelehnt' with a reason, NOT deleted: this project keeps an audit
-- trail everywhere (GoBD, Briefing Screen 18), the Hub has no delete policy on the table, and 'abgelehnt'
-- is already the status the reject flow uses. They stop being offered, which is what matters.
--
-- 1:1 ONLY, deliberately: collective and partial payments are out of scope (Task 08 follow-ups), so a
-- second confirmed partner on either side raises instead of quietly creating a many-to-many.
--
-- OWNERSHIP: invoice_transaction_matches is Hub-owned (immonetz 0001). This migration only ADDS a
-- function; the table, its policies and its triggers are untouched. Additive + idempotent.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0019_manual_match_link.sql

begin;

create or replace function public.link_invoice_transaction(
  p_invoice_id     uuid,
  p_transaction_id uuid,
  p_score          numeric default null,
  p_reasons        jsonb   default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      text := coalesce(nullif(auth.jwt() ->> 'email', ''), 'hub');
  v_match_id   uuid;
  v_withdrawn  int;
  v_released   boolean := false;
  v_other      uuid;
begin
  if p_invoice_id is null or p_transaction_id is null then
    raise exception 'link_invoice_transaction: invoice and transaction are both required';
  end if;

  -- Both sides must exist (and the invoice must not be soft-deleted).
  if not exists (select 1 from public.invoices where id = p_invoice_id and deleted_at is null) then
    raise exception 'link_invoice_transaction: invoice % not found', p_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  -- 1:1 guard — refuse a second confirmed partner on either side.
  select m.transaction_id into v_other
    from public.invoice_transaction_matches m
   where m.invoice_id = p_invoice_id and m.status = 'bestaetigt'
     and m.transaction_id <> p_transaction_id
   limit 1;
  if v_other is not null then
    raise exception 'link_invoice_transaction: invoice % is already linked to transaction %',
      p_invoice_id, v_other;
  end if;

  select m.invoice_id into v_other
    from public.invoice_transaction_matches m
   where m.transaction_id = p_transaction_id and m.status = 'bestaetigt'
     and m.invoice_id <> p_invoice_id
   limit 1;
  if v_other is not null then
    raise exception 'link_invoice_transaction: transaction % is already linked to invoice %',
      p_transaction_id, v_other;
  end if;

  -- 1. A receipt is being linked, so "no receipt expected" was wrong — release the hide first, or the
  --    sync trigger's "matching_status <> 'ignoriert'" guard (0008) would leave the row hidden.
  update public.bank_transactions
     set matching_status   = 'offen',
         no_receipt_reason = null,
         whitelist_rule_id = null,
         no_receipt_set_by = null,
         no_receipt_set_at = null
   where id = p_transaction_id
     and matching_status = 'ignoriert';
  v_released := found;

  -- 2. Record the pair. ON CONFLICT covers the case where the matcher already proposed exactly this
  --    pair as auto/kandidat (or a human rejected it earlier and is now changing their mind).
  insert into public.invoice_transaction_matches
         (invoice_id, transaction_id, status, score, match_reasons,
          matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_invoice_id, p_transaction_id, 'bestaetigt', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)),
          v_actor, v_actor, now(), now())
  on conflict (invoice_id, transaction_id) do update
     set status        = 'bestaetigt',
         score         = coalesce(excluded.score, public.invoice_transaction_matches.score),
         match_reasons = coalesce(excluded.match_reasons, public.invoice_transaction_matches.match_reasons),
         confirmed_by  = excluded.confirmed_by,
         confirmed_at  = excluded.confirmed_at,
         rejected_by   = null,          -- clear a previous rejection: this is now a confirmed link
         rejected_at   = null,
         reject_reason = null,
         updated_at    = now()
  returning id into v_match_id;

  -- 3. Withdraw every other still-pending suggestion touching either side.
  update public.invoice_transaction_matches
     set status        = 'abgelehnt',
         rejected_by   = v_actor,
         rejected_at   = now(),
         reject_reason = 'superseded by a manual link',
         updated_at    = now()
   where id <> v_match_id
     and status in ('kandidat', 'auto')
     and (invoice_id = p_invoice_id or transaction_id = p_transaction_id);
  get diagnostics v_withdrawn = row_count;

  insert into public.invoice_history (invoice_id, type, text, actor, data)
  values (p_invoice_id, 'zuordnung',
          'Banktransaktion manuell zugeordnet'
            || case when p_score is not null then format(' (Konfidenz %s)', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s Vorschlag/Vorschläge zurückgezogen', v_withdrawn) else '' end
            || case when v_released then ', Ausblendung "kein Beleg zu erwarten" aufgehoben' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released));

  return v_match_id;
end;
$$;

comment on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb) is
  'Manually link one invoice to one bank transaction (Briefing Screen 8). Confirms the pair, withdraws '
  'competing suggestions on both sides, releases an OPOS whitelist hide, and logs to invoice_history. '
  '1:1 only — raises if either side already has a different confirmed partner.';

revoke all on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb) to authenticated;

commit;

-- Sanity:
--   select public.link_invoice_transaction('<invoice-uuid>', '<txn-uuid>', 0.73,
--            '{"amount":true,"reference":true}'::jsonb);
--   -- the transaction leaves the open items:
--   select matching_status from bank_transactions where id = '<txn-uuid>';           -- zugeordnet
--   -- the invoice leaves the open items (it now has a bestaetigt match):
--   select status, reject_reason from invoice_transaction_matches where invoice_id = '<invoice-uuid>';
