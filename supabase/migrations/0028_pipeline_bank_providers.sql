-- 0017_bank_providers.sql
-- Introduce bank_providers (the ~9 distinct banks from the account sheet) and reshape
-- bank_accounts / bank_connections toward the provider → account → connection model.
--
-- Decisions (see conversation): keep the existing PLURAL table names (bank_accounts,
-- bank_connections, bank_transactions) so nothing in immonetz / the bank-sync edge
-- function / the pipeline breaks; extend those tables in place; keep the BANKSapi
-- sandbox rows and add the 26 real accounts alongside (is_sandbox = false).
--
-- The bank-sync mapper writes bank_connections.provider_id (TEXT = BANKSapi provider id),
-- so that column is left untouched; a NEW uuid FK column (bank_provider_id) links to
-- bank_providers instead.

begin;

-- ---------------------------------------------------------------------------
-- 1) bank_providers — one row per distinct Kreditinstitut
-- ---------------------------------------------------------------------------
create table if not exists bank_providers (
  id                    uuid primary key default gen_random_uuid(),
  bank_name             text not null,                    -- Kreditinstitut
  banksapi_provider_id  uuid,                             -- Provider-ID (null = no BANKSapi provider)
  provider_name         text,                             -- Provider (BANKSapi) label
  ebics_available       boolean not null default false,   -- "EBICS möglich?"
  -- Derived: a bank is supported (via Open Banking) exactly when it has a BANKSapi provider id.
  is_supported          boolean generated always as (banksapi_provider_id is not null) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists bank_providers_bank_name_uniq on bank_providers (bank_name);
create index if not exists bank_providers_banksapi_idx on bank_providers (banksapi_provider_id);

-- ---------------------------------------------------------------------------
-- 2) bank_accounts — add provider FK, activation, derived route + soft-delete/audit
--    (account_holder is the existing `holder`; account_type is the existing `product_type`.)
-- ---------------------------------------------------------------------------
alter table bank_accounts
  add column if not exists provider_id   uuid references bank_providers(id),
  add column if not exists connect_route text,            -- derived: 'banksapi' | 'ebics_or_manual'
  add column if not exists is_active     boolean not null default true,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    text,
  add column if not exists delete_reason text;

create index if not exists bank_accounts_provider_idx on bank_accounts (provider_id);

-- One active REAL account per IBAN (normalized: strip spaces / punctuation, lower-cased).
-- Lets the seed reconcile idempotently and blocks accidental duplicates. Scoped to
-- is_sandbox = false on purpose: BANKSapi mock/sandbox rows deliberately reuse fake IBANs
-- (e.g. DE92…, DE81 1234…) across several accounts and must not trip a uniqueness error.
create unique index if not exists bank_accounts_iban_uniq
  on bank_accounts (regexp_replace(lower(iban), '[^a-z0-9]', '', 'g'))
  where deleted_at is null and iban is not null and coalesce(is_sandbox, false) = false;

-- Keep connect_route in sync with the linked provider's support status.
create or replace function set_bank_account_connect_route() returns trigger
language plpgsql as $$
begin
  if new.provider_id is null then
    new.connect_route := coalesce(new.connect_route, 'ebics_or_manual');
  else
    select case when p.is_supported then 'banksapi' else 'ebics_or_manual' end
      into new.connect_route
      from bank_providers p where p.id = new.provider_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_bank_account_connect_route on bank_accounts;
create trigger trg_bank_account_connect_route
  before insert or update of provider_id on bank_accounts
  for each row execute function set_bank_account_connect_route();

-- ---------------------------------------------------------------------------
-- 3) bank_connections — add provider FK + credential reference
--    (status already exists; last_sync_at / last_sync_status already carry health.)
-- ---------------------------------------------------------------------------
alter table bank_connections
  add column if not exists bank_provider_id uuid references bank_providers(id),
  add column if not exists credential_ref   text;         -- vault reference only, never the secret

create index if not exists bank_connections_bank_provider_idx on bank_connections (bank_provider_id);

commit;
