-- 0009 — derive invoices.paid_at from a confirmed 1:1 bank match.
--
-- Client rule (2026-07-10): an invoice is "truly paid" ONLY when it is matched one-to-one with a
-- real bank transaction and that match is confirmed. The invoice text ("paid" / direct debit) is
-- never enough on its own. So the front-end keeps writing only the match record (as today), and a
-- server-side trigger sets paid_at the moment a confirmed match covers the invoice amount.
--
-- Mirrors the existing sync_transaction_matching_status trigger (migration 0001): SECURITY DEFINER,
-- fixed search_path, recomputes derived state after any change on invoice_transaction_matches.
--
-- "Paid" uses the SAME coverage rule as the UI's abgleichStatus(): the sum of confirmed matched
-- transaction amounts equals the gross amount within one cent ("abgeglichen"). This fires only on a
-- human confirmation (nothing is auto-paid from the document alone).
--
-- SET-ONLY on purpose: it never clears bezahlt_am. That keeps a manual "paid" override from being
-- wiped and means an invoice is never silently un-paid; unmarking stays an explicit human action.
-- Additive + idempotent + transactional.

begin;

create or replace function public.sync_beleg_bezahlt_from_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b        uuid := coalesce(new.invoice_id, old.invoice_id);
  soll     numeric;
  matched  numeric;
  paydate  date;
begin
  select amount_gross into soll from public.invoices where id = b;

  select coalesce(sum(abs(bt.amount)), 0), max(bt.booking_date)
    into matched, paydate
    from public.invoice_transaction_matches m
    join public.bank_transactions bt on bt.id = m.transaction_id
   where m.invoice_id = b and m.status = 'bestaetigt';

  -- Confirmed matched sum equals the gross amount within 1 cent -> truly paid.
  if soll is not null and soll <> 0
     and matched > 0 and abs(matched - abs(soll)) <= 0.01 then
    update public.invoices
       set paid_at = coalesce(paydate::timestamptz, now()),
           updated_at = now()
     where id = b and paid_at is null;   -- set-only: never overwrite / never clear
    if found then
      insert into public.invoice_history (invoice_id, type, text, actor)
      values (b, 'aenderung', 'Als bezahlt markiert (bestätigter Bankabgleich)', 'system');
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_beleg_bezahlt_from_matches on public.invoice_transaction_matches;
create trigger trg_sync_beleg_bezahlt_from_matches
  after insert or update or delete on public.invoice_transaction_matches
  for each row execute function public.sync_beleg_bezahlt_from_matches();

commit;

-- Sanity (after applying): confirming a full-coverage match sets belege.bezahlt_am and adds a
-- 'Als bezahlt markiert (bestätigter Bankabgleich)' entry to invoice_history. Partial matches do not.
