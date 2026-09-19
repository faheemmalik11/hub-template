-- Bank accounts: exclusion ("Konto entfernen") + custom-name protection.
--
-- Two problems this closes, both reported by the client on 2026-08-15 after connecting the real
-- Sparkasse access:
--
--  1. A private loan account belonging to the owners was delivered by the bank feed alongside the
--     company accounts, and there was NO way to get rid of it. Not only was there no delete
--     action anywhere in the Hub -- deleting the row by hand would not have stuck either, because
--     bank-sync deliberately REVIVES a soft-deleted account when the bank keeps delivering it
--     (see supabase/functions/bank-sync/index.ts, the "account_revived" log). Soft delete alone is
--     therefore the wrong tool here: `deleted_at` means "removed, may come back if the bank still
--     sends it", which is exactly what we do NOT want for a private account.
--
--     `excluded_at` is the stronger statement: this product must never be imported again. bank-sync
--     skips an excluded account entirely -- no account row update, no balance, and above all no
--     transaction fetch. The row itself stays as the tombstone that keeps it out; it is what the
--     sync matches against. Reversible by an admin (restoreBankAccount) so an accidental exclusion
--     is not a dead end.
--
--  2. `accountRow()` (supabase/functions/_shared/mappers.ts) rewrites `account_name` from the
--     bank's own label on EVERY sync. The Sparkasse labels six of these accounts "Sichteinlagen"
--     and five "Sonstige Darlehen", so renaming them in the Hub is the only way to tell them
--     apart -- and the rename silently disappeared within the hour. `name_is_custom` marks a name
--     a human chose; bank-sync leaves those alone and keeps updating the rest from the feed.

begin;

alter table public.bank_accounts
  -- When set, this account is permanently out of the import. bank-sync skips the product; the
  -- Hub hides the row. Distinct from `deleted_at` (0028), which the sync is allowed to undo.
  add column if not exists excluded_at      timestamptz,
  -- Email of the admin who excluded it -- the audit trail for a destructive action (excluding
  -- purges the account's transactions). Text, not an FK: an app_users row may later be removed
  -- and that must not erase who did this.
  add column if not exists excluded_by      text,
  add column if not exists exclusion_reason text,
  -- true = `account_name` was set by a human and the bank feed must not overwrite it.
  add column if not exists name_is_custom   boolean not null default false;

-- bank-sync loads the exclusion list on every run and matches products against it, so this is a
-- hot path for the Edge Function even though the table is small today.
create index if not exists bank_accounts_excluded_idx
  on public.bank_accounts (excluded_at)
  where excluded_at is not null;

comment on column public.bank_accounts.excluded_at is
  'Set = never import this product again. bank-sync skips it entirely (no update, no transactions). Stronger than deleted_at, which the sync may revive.';
comment on column public.bank_accounts.name_is_custom is
  'Set = account_name was chosen by a human; the BANKSapi feed must not overwrite it.';

commit;
