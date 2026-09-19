-- 0023_transaction_type.sql
-- Classify every bank movement into a transaction type (functional briefing, screen 7:
-- "Transactions are classified: direct debit / credit-card debit / transfer -- this later
-- steers the reconciliation (screen 8) and the evaluation rules").
--
-- Why a new column instead of reusing booking_text: booking_text is a raw passthrough of the
-- bank's own free-text `buchungstext`. It is not a type. On the live data it holds only
-- 'Lastschrift' (45x) and 'Gutschrift' (42x) and is NULL on 309 of 396 movements, because
-- BANKSapi delivers it as an empty string on the demo accounts and omits the field entirely on
-- others. Reconciliation needs a normalized value that is present on every row.
--
-- Numbering note: files in this folder stop at 0016, but several schema objects that the
-- front-end code refers to as "migration 0018/0019/0020/0022" (opos_whitelist_rules,
-- bank_transactions.no_receipt_reason, ...) exist in the live database without a file here.
-- This migration is numbered past all of them so it sorts last either way and `db push` has no
-- ordering conflict.

alter table public.bank_transactions
  add column if not exists transaction_type text
    check (transaction_type in (
      'ueberweisung',    -- transfer: pushed by hand, needs approval before it is paid
      'lastschrift',     -- direct debit: already pulled, lighter checks
      'kreditkarte',     -- credit card collective debit: one lumped monthly charge, to be split
      'kartenzahlung',   -- a single card movement on a card account (a part of that lump)
      'gutschrift',      -- incoming credit (interest, deposit, refund)
      'unbekannt'        -- no usable signal; deliberately not guessed
    )),
  add column if not exists transaction_type_source text not null default 'auto'
    check (transaction_type_source in ('auto', 'manuell'));

comment on column public.bank_transactions.transaction_type is
  'Normalized movement type driving reconciliation. Derived by the classifier in '
  'supabase/functions/_shared/transaction-type.ts, not by the bank. NULL = not yet classified; '
  'bank-sync fills those on its next run.';

comment on column public.bank_transactions.transaction_type_source is
  'auto = set by the classifier, manuell = corrected by a human. A human correction is never '
  'overwritten: the backfill in bank-sync only touches rows where transaction_type is NULL.';

-- The reconciliation screens filter by type, usually together with the matching state.
create index if not exists bank_transactions_transaction_type_idx
  on public.bank_transactions (transaction_type);

-- Partial index for the backfill probe in bank-sync, which asks for NULL rows on every run.
create index if not exists bank_transactions_transaction_type_null_idx
  on public.bank_transactions (id)
  where transaction_type is null;

-- No backfill here on purpose. Existing rows keep transaction_type NULL and bank-sync
-- classifies them on its next run, so the classification rules live in exactly one place
-- (TypeScript) instead of being copied into SQL where the two copies would drift apart.
-- To re-classify everything after the rules change, without touching human corrections:
--   update public.bank_transactions
--      set transaction_type = null
--    where transaction_type_source = 'auto';
