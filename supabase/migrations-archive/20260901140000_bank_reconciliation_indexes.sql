-- 20260901140000_bank_reconciliation_indexes.sql
-- Three indexes behind the two requests Bank reconciliation was returning 500 on.
--
-- 1. THE ONE THAT ACTUALLY BROKE IT. v_bank_transactions_list computes has_suggested_match as two
--    correlated EXISTS, one per match table, so counting with `has_suggested_match = true`
--    evaluates both for EVERY bank transaction. invoice_transaction_matches at least had a
--    transaction_id index; outgoing_invoice_transaction_matches had none that could serve one. Its
--    only relevant index is the `unique (outgoing_invoice_id, transaction_id)` constraint, and a
--    composite index cannot answer a lookup on its SECOND column, so every row meant a sequential
--    scan of that table. That is what timed out and surfaced as a 500.
--
-- 2. invoice_transaction_matches had transaction_id and status as two SEPARATE indexes, and
--    Postgres can only use one of them for a predicate that reads both. A composite turns each
--    EXISTS into a single index lookup.
--
-- 3. bank_transactions is filtered on matching_status and sorted on booking_date by the payments
--    tab. With separate indexes that is a filter followed by a sort of everything that matched;
--    the composite lets the first page come off the index already in order.
--
-- Purely additive: no table, view, policy or row is touched, and every statement is idempotent.
-- Built in place rather than CONCURRENTLY so the file stays runnable inside the transaction the
-- migration CLI wraps it in. If any of these tables is large enough for the brief write lock to
-- matter, run the three statements by hand with CONCURRENTLY instead and skip this file.

begin;

do $$
begin
  if to_regclass('public.bank_transactions') is null then
    raise exception '20260901140000 preconditions failed: public.bank_transactions is missing';
  end if;
  if to_regclass('public.invoice_transaction_matches') is null then
    raise exception '20260901140000 preconditions failed: public.invoice_transaction_matches is missing';
  end if;
  if to_regclass('public.outgoing_invoice_transaction_matches') is null then
    raise exception '20260901140000 preconditions failed: public.outgoing_invoice_transaction_matches is missing';
  end if;
end $$;

create index if not exists outgoing_matches_transaction_status_idx
  on public.outgoing_invoice_transaction_matches (transaction_id, status);

create index if not exists matches_transaction_status_idx
  on public.invoice_transaction_matches (transaction_id, status);

create index if not exists bank_transactions_matching_status_booking_date_idx
  on public.bank_transactions (matching_status, booking_date desc);

commit;

-- ---------------------------------------------------------------------------
-- Verify (run by hand after applying):
--
-- select indexname from pg_indexes
--  where schemaname = 'public'
--    and indexname in ('outgoing_matches_transaction_status_idx',
--                      'matches_transaction_status_idx',
--                      'bank_transactions_matching_status_booking_date_idx')
--  order by 1;   -- expect all three
--
-- explain analyze
--   select count(*) from public.v_bank_transactions_list where has_suggested_match;
--   -- expect index scans on the two match tables, not "Seq Scan"
