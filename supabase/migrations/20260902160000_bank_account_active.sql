-- 20260902160000_bank_account_active — a bank account can be switched OFF without being destroyed.
--
-- WHY. There are two things a person means by "get rid of this account", and until now the Hub only
-- offered the violent one.
--
--   * "Konto entfernen" (excluded_at, migration 20260815120000) purges every movement on the
--     account, and with them their invoice matches and receipt files, then keeps bank-sync off the
--     product for good. Right for a private loan account that never belonged in the books.
--   * "stop importing this, but keep what we already have" had no answer at all. Deleting the row
--     is not one: BANKSapi documents only two DELETEs, /customer/v2/bankzugaenge (every access) and
--     /customer/v2/bankzugaenge/{access-id} (one bank), and nothing per account. So the account
--     cannot be detached at the source, and the next hourly sync upserts it straight back.
--
-- is_active is that second answer. false = the row stays, its history stays, and bank-sync stops
-- fetching new movements for it (see supabase/functions/bank-sync/index.ts, the inactive check in
-- the per-account transaction loop). Nothing is deleted and the switch is reversible.
--
-- NOT NULL DEFAULT TRUE, so every existing account keeps behaving exactly as it does today.
--
-- bank-sync must never WRITE this column, or the hourly run would reset a person's choice. Same
-- rule as name_is_custom and for the same reason.

begin;

alter table public.bank_accounts
  add column if not exists is_active boolean not null default true;

comment on column public.bank_accounts.is_active is
  'false = do not import new transactions for this account. Existing rows are kept. Set by hand in '
  'the Hub; bank-sync must never write it. Distinct from excluded_at, which purges the movements.';

-- The sync reads this for every account on every run, and the interesting set is the small one.
create index if not exists bank_accounts_inactive_idx
  on public.bank_accounts (id) where not is_active;

commit;
