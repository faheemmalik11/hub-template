-- 0024_match_amounts_m_to_n.sql
-- Collective and partial matching (m:n) with a matched amount per pair.
--
-- Appendix A8 of the functional briefing, "In bank matching":
--   Collective transfer (n:m)       one payment = several receipts -> form partial sums
--   Partial payment / installment   several transactions, one receipt -> paid only when the sum
--                                   is correct
--   Discount tolerance              invoice 1.000, paid 980 -> tolerance window
--   Returned direct debit           receipt back to "open"
--
-- The join table was already m:n capable (its own id, unique only on the PAIR). What was missing
-- is the amount carried by each link. Every coverage calculation used abs(transaction amount),
-- which is only ever right for a 1:1 match: one transfer of 3.000 paying three invoices of 1.000
-- counted as 3.000 against EACH of them, so none reached "paid" and the totals were nonsense.
--
-- Numbering note: files here stop at 0016 but the live database also carries changes the code
-- calls "migration 0018/0019/0020/0022" (the English rename of invoices -> invoices, the OPOS
-- whitelist, link_invoice_transaction). This file is written against the LIVE English schema, not
-- against the German names still visible in 0001/0009.

begin;

-- ---------------------------------------------------------------------------
-- 1. The matched amount per pair
-- ---------------------------------------------------------------------------
alter table public.invoice_transaction_matches
  add column if not exists amount_matched numeric;

-- Backfill. Existing links are all effectively 1:1, where the matched amount is the transaction
-- amount capped by what the invoice is worth. least() also repairs any pair that was already
-- over-covered, so the NOT NULL and the guard below can be applied without a data cleanup first.
update public.invoice_transaction_matches m
   set amount_matched = least(abs(t.amount), coalesce(abs(i.amount_gross), abs(t.amount)))
  from public.bank_transactions t, public.invoices i
 where t.id = m.transaction_id
   and i.id = m.invoice_id
   and m.amount_matched is null;

-- Orphan safety: a link whose invoice or transaction row is gone would still be null above.
update public.invoice_transaction_matches
   set amount_matched = 0.01
 where amount_matched is null;

alter table public.invoice_transaction_matches
  alter column amount_matched set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoice_transaction_matches'::regclass
       and conname = 'invoice_transaction_matches_amount_matched_positive'
  ) then
    alter table public.invoice_transaction_matches
      add constraint invoice_transaction_matches_amount_matched_positive
      check (amount_matched > 0);
  end if;
end $$;

comment on column public.invoice_transaction_matches.amount_matched is
  'How much of the transaction is allocated to THIS invoice. For a plain 1:1 match it equals the '
  'transaction amount. For a collective payment the links across all its invoices add up to the '
  'transaction; for installments the links across all transactions add up to the invoice.';

create index if not exists matches_transaction_confirmed_idx
  on public.invoice_transaction_matches (transaction_id)
  where status = 'bestaetigt';

create index if not exists matches_invoice_confirmed_idx
  on public.invoice_transaction_matches (invoice_id)
  where status = 'bestaetigt';

-- ---------------------------------------------------------------------------
-- 2. Where "paid" came from, so a human decision is never overwritten
-- ---------------------------------------------------------------------------
-- The paid trigger below now also CLEARS paid_at when coverage drops (returned direct debit,
-- link removed). There is a manual paid switch on the invoice detail screen, and that override
-- must survive: only a paid_at this trigger set itself is ever cleared again.
alter table public.invoices
  add column if not exists paid_source text
    check (paid_source in ('bank_match', 'manual'));

comment on column public.invoices.paid_source is
  'bank_match = paid_at was derived from confirmed bank matches and may be cleared again when '
  'coverage drops. NULL or manual = a human set it; never cleared automatically.';

-- Backfilled further down, once payment_tolerance() and invoice_matched_sum() exist.

-- ---------------------------------------------------------------------------
-- 3. Discount tolerance (Skonto)
-- ---------------------------------------------------------------------------
create or replace function public.payment_tolerance(p_gross numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- How far BELOW the gross a payment may land and still close the invoice. German Skonto is
  -- typically 2% and occasionally 3%, so 3% covers the real cases. The absolute cap stops the
  -- percentage from silently writing off a large sum: 3% of a 50.000 invoice would be 1.500,
  -- which no one should auto-close. The 0.01 floor keeps plain rounding working on tiny invoices.
  select least(greatest(abs(coalesce(p_gross, 0)) * 0.03, 0.01), 150.00);
$$;

comment on function public.payment_tolerance(numeric) is
  'Allowed shortfall for an invoice to still count as paid (Appendix A8 discount tolerance). '
  'Mirrored in src/lib/data/format.ts as paymentTolerance() -- keep the two in step.';

-- Confirmed allocation helpers. Only 'bestaetigt' counts: the matcher may propose many candidates
-- for the same transaction, and proposals must never consume the budget.
create or replace function public.invoice_matched_sum(p_invoice uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount_matched), 0)
    from public.invoice_transaction_matches
   where invoice_id = p_invoice and status = 'bestaetigt';
$$;

create or replace function public.transaction_allocated_sum(p_transaction uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount_matched), 0)
    from public.invoice_transaction_matches
   where transaction_id = p_transaction and status = 'bestaetigt';
$$;

-- Attribute the paid invoices that already exist. Anything the confirmed matches fully cover was
-- set by the old bank-match trigger and may be withdrawn again; everything else is treated as a
-- human decision. That is the safe direction: the worst case is a stale paid somebody has to clear
-- by hand, never a correct paid silently wiped.
update public.invoices i
   set paid_source = case
         when abs(i.amount_gross) > 0
          and public.invoice_matched_sum(i.id)
              >= abs(i.amount_gross) - public.payment_tolerance(i.amount_gross)
           then 'bank_match'
         else 'manual'
       end
 where i.paid_at is not null and i.paid_source is null;

-- ---------------------------------------------------------------------------
-- 4. Over-allocation guard
-- ---------------------------------------------------------------------------
-- Without this, three links of 3.000 each could hang off one 3.000 payment and the books would
-- claim 9.000 was paid. Applies to confirmed links only, for the reason above.
create or replace function public.check_match_allocation()
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
    from public.invoice_transaction_matches
   where transaction_id = new.transaction_id and status = 'bestaetigt' and id <> new.id;

  if v_tx_total is not null and v_tx_other + new.amount_matched > v_tx_total + 0.01 then
    -- Message text is English like the other raises in this schema (persisted audit text stays
    -- German). RAISE uses % as its placeholder, not %s -- that is format()'s syntax.
    raise exception
      'match allocation: transaction total %, already allocated %, requested % -- would over-allocate',
      v_tx_total, v_tx_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  select abs(amount_gross) into v_inv_gross
    from public.invoices where id = new.invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.invoice_transaction_matches
   where invoice_id = new.invoice_id and status = 'bestaetigt' and id <> new.id;

  if v_inv_gross is not null and v_inv_gross > 0
     and v_inv_other + new.amount_matched > v_inv_gross + 0.01 then
    raise exception
      'match allocation: invoice gross %, already allocated %, requested % -- would over-allocate',
      v_inv_gross, v_inv_other, new.amount_matched
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- The trigger itself is attached at the very end, AFTER the one-off recompute below. The recompute
-- touches every existing match row, and if any legacy row were already over-allocated the guard
-- would abort the whole migration. Guarding future writes is the point; retrofitting a hard stop
-- onto data that is already in the table is not.

-- ---------------------------------------------------------------------------
-- 5. paid_at from the SUM of matched amounts, in both directions
-- ---------------------------------------------------------------------------
-- Replaces the 1:1 rule from migration 0009, which compared abs(transaction amount) against the
-- gross.
--
-- Both old triggers are dropped BY LOOKUP rather than by name. The English-rename migration has
-- no file in this repo, so the live names are unknown: if the functions were renamed alongside the
-- tables, a plain "create or replace function" under the name from 0001/0009 would quietly create
-- a second, unused function while the original kept firing with the old 1:1 logic. Dropping
-- whatever is actually attached and re-attaching by name below is the only way to be certain the
-- new logic is the logic that runs.
do $$
declare r record;
begin
  for r in
    select t.tgname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.invoice_transaction_matches'::regclass
       and not t.tgisinternal
       and (p.proname like '%bezahlt%'
         or p.proname like '%paid%'
         or p.proname like '%matching_status%')
  loop
    raise notice 'dropping superseded match trigger %', r.tgname;
    execute format('drop trigger if exists %I on public.invoice_transaction_matches', r.tgname);
  end loop;
end $$;

create or replace function public.sync_invoice_paid_from_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice   uuid := coalesce(new.invoice_id, old.invoice_id);
  v_gross     numeric;
  v_paid_at   timestamptz;
  v_source    text;
  v_matched   numeric;
  v_paydate   date;
  v_shortfall numeric;
begin
  select abs(amount_gross), paid_at, paid_source
    into v_gross, v_paid_at, v_source
    from public.invoices where id = v_invoice;
  if not found then
    return null;
  end if;

  select coalesce(sum(m.amount_matched), 0), max(t.booking_date)
    into v_matched, v_paydate
    from public.invoice_transaction_matches m
    join public.bank_transactions t on t.id = m.transaction_id
   where m.invoice_id = v_invoice and m.status = 'bestaetigt';

  if v_gross is not null and v_gross > 0
     and v_matched > 0
     and v_matched >= v_gross - public.payment_tolerance(v_gross) then
    -- Covered. Set-only against an existing paid_at, so a manual date is not restamped.
    if v_paid_at is null then
      update public.invoices
         set paid_at     = coalesce(v_paydate::timestamptz, now()),
             paid_source = 'bank_match',
             updated_at  = now()
       where id = v_invoice;

      v_shortfall := v_gross - v_matched;
      insert into public.invoice_history (invoice_id, type, text, actor)
      values (
        v_invoice,
        'aenderung',
        case when v_shortfall > 0.01
          then format('Als bezahlt markiert (bestätigter Bankabgleich, Skonto %s EUR)',
                      to_char(v_shortfall, 'FM999G999G990D00'))
          else 'Als bezahlt markiert (bestätigter Bankabgleich)'
        end,
        'system'
      );
    end if;
  else
    -- No longer covered: returned direct debit, link removed or amount reduced. Only a paid_at
    -- THIS trigger set is withdrawn again; a human's manual "paid" is never touched.
    if v_paid_at is not null and v_source = 'bank_match' then
      update public.invoices
         set paid_at     = null,
             paid_source = null,
             updated_at  = now()
       where id = v_invoice;

      insert into public.invoice_history (invoice_id, type, text, actor)
      values (
        v_invoice,
        'aenderung',
        format('Zahlung zurückgenommen: Bankabgleich deckt nur noch %s von %s EUR',
               to_char(v_matched, 'FM999G999G990D00'),
               to_char(v_gross, 'FM999G999G990D00')),
        'system'
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_invoice_paid_from_matches on public.invoice_transaction_matches;
create trigger trg_sync_invoice_paid_from_matches
  after insert or update or delete on public.invoice_transaction_matches
  for each row execute function public.sync_invoice_paid_from_matches();

-- ---------------------------------------------------------------------------
-- 6. A transaction is only "zugeordnet" once it is FULLY allocated
-- ---------------------------------------------------------------------------
-- Previously any single confirmed match flipped it. Under m:n that would retire a 3.000 payment
-- from the open items the moment 1.000 of it was explained, which is exactly the "fantasy
-- figures" the briefing warns about. A partially allocated payment stays 'offen' so it keeps
-- showing up in the open items and the matcher keeps proposing receipts for the rest.
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

  v_alloc := public.transaction_allocated_sum(v_tx);

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

-- Re-attached under a known name, since the lookup in section 5 dropped whatever was there.
drop trigger if exists trg_sync_transaction_matching_status on public.invoice_transaction_matches;
create trigger trg_sync_transaction_matching_status
  after insert or update or delete on public.invoice_transaction_matches
  for each row execute function public.sync_transaction_matching_status();

-- Recompute both derived states for every row that already exists, because the two rules just
-- changed underneath them: partially allocated transactions must fall back to 'offen', and
-- invoices whose coverage is now measured per pair need their paid_at re-evaluated. Touching
-- updated_at is enough to fire both triggers once per match row.
update public.invoice_transaction_matches set updated_at = updated_at;

-- Only now does the guard go on, so it judges nothing but writes made from here on.
drop trigger if exists trg_check_match_allocation on public.invoice_transaction_matches;
create trigger trg_check_match_allocation
  before insert or update on public.invoice_transaction_matches
  for each row execute function public.check_match_allocation();

-- ---------------------------------------------------------------------------
-- 7. link_invoice_transaction: m:n, with the amount for this pair
-- ---------------------------------------------------------------------------
-- The previous version raised if either side already had a confirmed partner. That restriction is
-- what this migration removes. Dropped by lookup because the argument list changes (adding a
-- parameter to create-or-replace would leave an ambiguous overload behind).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'link_invoice_transaction'
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

create or replace function public.link_invoice_transaction(
  p_invoice_id     uuid,
  p_transaction_id uuid,
  p_score          numeric default null,
  p_reasons        jsonb   default null,
  p_amount         numeric default null   -- null = take whatever is still open on both sides
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

  -- Both sides must exist (and the invoice must not be soft-deleted).
  if not exists (select 1 from public.invoices where id = p_invoice_id and deleted_at is null) then
    raise exception 'link_invoice_transaction: invoice % not found', p_invoice_id;
  end if;
  if not exists (select 1 from public.bank_transactions where id = p_transaction_id) then
    raise exception 'link_invoice_transaction: transaction % not found', p_transaction_id;
  end if;

  -- The 1:1 guard that used to sit here is GONE on purpose: a second confirmed partner on either
  -- side is exactly what a collective payment and an installment plan are. What replaces it is the
  -- amount arithmetic below, which lets both sides be shared but never over-allocated.
  select abs(amount) into v_tx_total
    from public.bank_transactions where id = p_transaction_id;
  select abs(amount_gross) into v_inv_gross
    from public.invoices where id = p_invoice_id and deleted_at is null;
  if v_inv_gross is null or v_inv_gross = 0 then
    raise exception 'link_invoice_transaction: invoice % has no gross amount to allocate against',
      p_invoice_id;
  end if;

  -- What each side still has free, ignoring any existing link between exactly THIS pair: that one
  -- is about to be overwritten, so its old amount must not count against the new one.
  select coalesce(sum(amount_matched), 0) into v_tx_other
    from public.invoice_transaction_matches
   where transaction_id = p_transaction_id and status = 'bestaetigt' and invoice_id <> p_invoice_id;
  select coalesce(sum(amount_matched), 0) into v_inv_other
    from public.invoice_transaction_matches
   where invoice_id = p_invoice_id and status = 'bestaetigt' and transaction_id <> p_transaction_id;

  v_tx_rest  := v_tx_total  - v_tx_other;
  v_inv_rest := v_inv_gross - v_inv_other;

  -- Default: as much as both sides can still take. For an ordinary 1:1 match that is the whole
  -- amount, so the caller never has to pass anything and nothing about that path changes.
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

  -- 1. A receipt is being linked, so "no receipt expected" was wrong — release the hide first, or the
  --    sync trigger's "matching_status <> 'ignoriert'" guard would leave the row hidden.
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
         (invoice_id, transaction_id, status, score, match_reasons, amount_matched,
          matched_by, confirmed_by, confirmed_at, updated_at)
  values (p_invoice_id, p_transaction_id, 'bestaetigt', p_score,
          coalesce(p_reasons, jsonb_build_object('manual', true)), v_amount,
          v_actor, v_actor, v_now, v_now)
  on conflict (invoice_id, transaction_id) do update
     set status         = 'bestaetigt',
         amount_matched = excluded.amount_matched,
         score          = coalesce(excluded.score, public.invoice_transaction_matches.score),
         match_reasons  = coalesce(excluded.match_reasons, public.invoice_transaction_matches.match_reasons),
         confirmed_by   = excluded.confirmed_by,
         confirmed_at   = excluded.confirmed_at,
         rejected_by    = null,          -- clear a previous rejection: this is now a confirmed link
         rejected_at    = null,
         reject_reason  = null,
         updated_at     = v_now
  returning id into v_match_id;

  -- 3. Withdraw still-pending suggestions, but ONLY on a side that is now fully used up. This is the
  --    other half of the m:n change: the old version withdrew every suggestion touching either side,
  --    which under a collective payment would throw away the proposals for the OTHER receipts that
  --    same payment still has to cover.
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
            || case when p_score is not null then format(', Konfidenz %s', p_score) else '' end
            || case when v_withdrawn > 0 then format(', %s Vorschlag/Vorschläge zurückgezogen', v_withdrawn) else '' end
            || case when v_released then ', Ausblendung "kein Beleg zu erwarten" aufgehoben' else '' end,
          v_actor,
          jsonb_build_object('transaction_id', p_transaction_id, 'score', p_score,
                             'amount_matched', v_amount, 'transaction_amount', v_tx_total,
                             'withdrawn', v_withdrawn, 'whitelist_released', v_released));

  return v_match_id;
end;
$$;

grant execute on function public.link_invoice_transaction(uuid, uuid, numeric, jsonb, numeric) to authenticated;
grant execute on function public.payment_tolerance(numeric) to authenticated;
grant execute on function public.invoice_matched_sum(uuid) to authenticated;
grant execute on function public.transaction_allocated_sum(uuid) to authenticated;

commit;

-- Sanity after applying:
--   -- collective: one payment, several invoices, each link carries its own share
--   select t.amount, m.amount_matched, i.amount_gross, i.paid_at
--     from invoice_transaction_matches m
--     join bank_transactions t on t.id = m.transaction_id
--     join invoices i on i.id = m.invoice_id
--    where m.status = 'bestaetigt';
--   -- nothing may be over-allocated:
--   select transaction_id, sum(amount_matched)
--     from invoice_transaction_matches where status = 'bestaetigt'
--    group by 1 having sum(amount_matched) > (
--      select abs(amount) from bank_transactions where id = transaction_id) + 0.01;
