-- 0014_bank_transaction_company — give bank transactions a company, so bank data is scoped per
-- company the same way invoices are (Briefing "Account to Company Assignment"). A transaction has no
-- company of its own; it INHERITS the company of the account it was booked on
-- (bank_transactions.account_id -> bank_accounts.company_id). We denormalize that onto the transaction
-- so the matcher and any company-scoped view/RLS can use it directly instead of a join, and keep it in
-- sync with two triggers:
--   * on a transaction: set company_id from its account (INSERT, or when account_id changes);
--   * on an account: when its company_id changes (e.g. pipeline/set_account_company.py assigns a card),
--     propagate the new company to that account's transactions.
--
-- OWNERSHIP: this project owns the bank-account/company setup (see 0005). The bank base tables come from
-- the Hub (immonetz 0001); this migration only ADDS a column + triggers and leaves the Hub's RLS
-- policies untouched (the existing select policies already cover the new column). Additive + idempotent.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0014_bank_transaction_company.sql

begin;

alter table public.bank_transactions
  add column if not exists company_id uuid references public.companies(id);

comment on column public.bank_transactions.company_id is
  'Owning company, inherited from account_id -> bank_accounts.company_id (kept in sync by trigger). '
  'The second route to a receipt''s company when the document does not name one (Screen 7 / DFD).';

create index if not exists bank_transactions_company_idx on public.bank_transactions (company_id);

-- Keep a transaction's company aligned with its account (INSERT + whenever account_id changes).
create or replace function public.set_bank_transaction_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select ba.company_id into new.company_id
    from public.bank_accounts ba
   where ba.id = new.account_id;
  return new;
end;
$$;

drop trigger if exists trg_set_bank_transaction_company on public.bank_transactions;
create trigger trg_set_bank_transaction_company
  before insert or update of account_id on public.bank_transactions
  for each row execute function public.set_bank_transaction_company();

-- When an account is (re)assigned to a company, propagate it to that account's transactions.
create or replace function public.propagate_account_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id then
    update public.bank_transactions
       set company_id = new.company_id
     where account_id = new.id
       and company_id is distinct from new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_propagate_account_company on public.bank_accounts;
create trigger trg_propagate_account_company
  after update of company_id on public.bank_accounts
  for each row execute function public.propagate_account_company();

-- Backfill existing transactions from their account (safe master-data denormalization — this is NOT the
-- invoice-content "leave previous rows" rule; it only fills the new column from data already present).
update public.bank_transactions bt
   set company_id = ba.company_id
  from public.bank_accounts ba
 where ba.id = bt.account_id
   and bt.company_id is distinct from ba.company_id;

commit;

-- Sanity:
--   select c.code, count(*) from bank_transactions bt
--     left join companies c on c.id = bt.company_id group by 1 order by 2 desc;
