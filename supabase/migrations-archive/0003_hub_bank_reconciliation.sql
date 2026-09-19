-- BANKSapi bank-transaction reconciliation (Phase 1, read-only).
-- Additive migration: creates NEW tables only. Does NOT alter pipeline-owned tables
-- (invoices stays untouched; match/status is derived from invoice_transaction_matches).
-- Apply with the Supabase CLI (see docs) — not executed from the app.

-- ---------------------------------------------------------------------------
-- 1. bank_connections — one BANKSapi bank access (bankzugang)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_connections (
  id                 uuid primary key default gen_random_uuid(),
  banksapi_access_id text,                 -- BANKSapi bankzugaenge id (null until webform completes)
  banksapi_user      text,                 -- BANKSapi customer/user (the tenant test user)
  provider_id        text,                 -- BANKSapi provider uuid
  provider_name      text,
  bank_name          text,
  status             text not null default 'pending'
                       check (status in ('pending', 'active', 'error', 'expired')),
  is_sandbox         boolean not null default true,   -- mock/sandbox rows are purgeable
  last_sync_at       timestamptz,
  last_sync_status   text,
  metadata           jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. bank_accounts — an account/product under a connection (bankprodukt)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references public.bank_connections(id) on delete cascade,
  banksapi_product_id text,
  account_name        text,
  iban                text,
  bic                 text,
  holder             text,                -- account holder
  product_type        text,               -- Girokonto / Kreditkarte / ...
  currency            text default 'EUR',
  balance               numeric,
  balance_date         date,
  is_own_account      boolean not null default true,  -- our own accounts (…2908, …6990, PayPal x-2908)
  is_sandbox          boolean not null default true,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (connection_id, banksapi_product_id)
);

-- ---------------------------------------------------------------------------
-- 3. bank_transactions — statement lines (kontoumsaetze)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_transactions (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.bank_accounts(id) on delete cascade,
  connection_id      uuid not null references public.bank_connections(id),  -- denormalized for filtering
  banksapi_hash      text not null,        -- BANKSapi `hash`; dedup key
  amount             numeric not null,     -- signed: negative = money out (we pay), positive = in
  currency           text default 'EUR',
  booking_date      date,
  value_date date,
  payment_reference   text,
  booking_text       text,
  counterparty_holder text,
  counterparty_iban    text,
  counterparty_bic     text,
  direction           text generated always as
                       (case when amount < 0 then 'ausgehend' else 'eingehend' end) stored,
  matching_status    text not null default 'offen'
                       check (matching_status in ('offen', 'zugeordnet', 'ignoriert')),
  is_sandbox         boolean not null default true,
  raw_data           jsonb,                -- full raw transaction (lossless)
  fts                tsvector generated always as (
                       to_tsvector('german',
                         coalesce(payment_reference, '') || ' ' ||
                         coalesce(booking_text, '') || ' ' ||
                         coalesce(counterparty_holder, ''))) stored,
  imported_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (account_id, banksapi_hash)
);

-- ---------------------------------------------------------------------------
-- 4. invoice_transaction_matches — the main matching model (link table).
--    Many-to-many: one beleg ↔ several transactions (installments); one
--    transaction ↔ several invoices (bundled dunning).
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_transaction_matches (
  id             uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id),
  transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  status         text not null default 'kandidat'
                   check (status in ('kandidat', 'auto', 'bestaetigt', 'abgelehnt')),
  score          numeric,                  -- 0..1 confidence
  match_reasons  jsonb,                    -- which rules fired: {amount, date, iban, reference, name}
  matched_by     text,                     -- 'system' | user email
  matched_at     timestamptz not null default now(),
  confirmed_by   text,
  confirmed_at   timestamptz,
  rejected_by    text,
  rejected_at    timestamptz,
  reject_reason   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (invoice_id, transaction_id)
);

-- ---------------------------------------------------------------------------
-- 5. bank_sync_logs — sync run events (NO sensitive content: counts + ids only)
-- ---------------------------------------------------------------------------
create table if not exists public.bank_sync_logs (
  id            bigint generated always as identity primary key,
  run_id        uuid,
  connection_id uuid references public.bank_connections(id),
  event         text not null,   -- sync_started|accounts_fetched|transactions_fetched|match_run|sync_finished|error
  level         text not null default 'info' check (level in ('info', 'warn', 'error')),
  message       text,            -- human summary; NO IBANs/amounts/references/names
  counts        jsonb,           -- {accounts, transactions_new, transactions_total, matches_auto, matches_candidate}
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists bank_transactions_matching_status_idx on public.bank_transactions (matching_status);
create index if not exists bank_transactions_buchungsdatum_idx    on public.bank_transactions (booking_date);
create index if not exists bank_transactions_betrag_idx           on public.bank_transactions (amount);
create index if not exists bank_transactions_account_idx          on public.bank_transactions (account_id);
create index if not exists bank_transactions_fts_idx              on public.bank_transactions using gin (fts);
create index if not exists bank_transactions_rohdaten_idx         on public.bank_transactions using gin (raw_data);
create index if not exists matches_beleg_idx        on public.invoice_transaction_matches (invoice_id);
create index if not exists matches_transaction_idx  on public.invoice_transaction_matches (transaction_id);
create index if not exists matches_status_idx       on public.invoice_transaction_matches (status);
create index if not exists bank_accounts_connection_idx on public.bank_accounts (connection_id);
create index if not exists bank_sync_logs_run_idx   on public.bank_sync_logs (run_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
--   * authenticated may READ all bank_* / matches / logs.
--   * bank_connections/accounts/transactions/logs are written only by the
--     Edge Functions (service_role bypasses RLS — no policy needed).
--   * invoice_transaction_matches: authenticated may insert/update (manual
--     match + confirm/reject). No delete (rejection is a status).
-- ---------------------------------------------------------------------------
alter table public.bank_connections          enable row level security;
alter table public.bank_accounts             enable row level security;
alter table public.bank_transactions         enable row level security;
alter table public.invoice_transaction_matches enable row level security;
alter table public.bank_sync_logs            enable row level security;

drop policy if exists "bank_connections_read" on public.bank_connections;
create policy "bank_connections_read" on public.bank_connections
  for select to authenticated using (true);
drop policy if exists "bank_accounts_read" on public.bank_accounts;
create policy "bank_accounts_read" on public.bank_accounts
  for select to authenticated using (true);
drop policy if exists "bank_transactions_read" on public.bank_transactions;
create policy "bank_transactions_read" on public.bank_transactions
  for select to authenticated using (true);
drop policy if exists "bank_sync_logs_read" on public.bank_sync_logs;
create policy "bank_sync_logs_read" on public.bank_sync_logs
  for select to authenticated using (true);

drop policy if exists "matches_read" on public.invoice_transaction_matches;
create policy "matches_read" on public.invoice_transaction_matches
  for select to authenticated using (true);
drop policy if exists "matches_insert" on public.invoice_transaction_matches;
create policy "matches_insert" on public.invoice_transaction_matches
  for insert to authenticated with check (true);
drop policy if exists "matches_update" on public.invoice_transaction_matches;
create policy "matches_update" on public.invoice_transaction_matches
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Keep bank_transactions.matching_status in sync from confirmed matches.
-- Runs server-side (SECURITY DEFINER) so the front-end only ever writes the
-- match record — never bank_transactions directly. Manual 'ignoriert' is left as-is.
-- ---------------------------------------------------------------------------
create or replace function public.sync_transaction_matching_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tx uuid := coalesce(new.transaction_id, old.transaction_id);
begin
  update public.bank_transactions t
     set matching_status = case
       when exists (
         select 1 from public.invoice_transaction_matches m
         where m.transaction_id = tx and m.status = 'bestaetigt'
       ) then 'zugeordnet' else 'offen' end
   where t.id = tx and t.matching_status <> 'ignoriert';
  return null;
end;
$$;

drop trigger if exists trg_sync_transaction_matching_status on public.invoice_transaction_matches;
create trigger trg_sync_transaction_matching_status
  after insert or update or delete on public.invoice_transaction_matches
  for each row execute function public.sync_transaction_matching_status();                 