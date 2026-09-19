-- Which bank accounts an invoice named, and whether anybody has vouched for them.
--
-- The pipeline already writes every IBAN it reads into supplier_bank_accounts. Two things were
-- missing. There was no record of WHICH invoice named which account, so the supplier's invoice list
-- could not show it and a reviewer could not see where a new account came from. And there was no
-- flag that survives: `account_is_disputed` is computed at ingest and only decides whether
-- suppliers.iban is left alone, while the Hub's amber badge is derived from supplier_iban_history
-- with a recency window, so it expires on a timer whether or not anyone looked at it.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- The link
-- ---------------------------------------------------------------------------------------------
-- A table rather than a uuid[] on invoices, because the interesting question is asked in both
-- directions. Forwards: what did this invoice print, so the supplier's invoice list can show an
-- IBAN per row. Backwards: which invoices named this account, which is what a reviewer needs when
-- deciding whether to confirm it. An array answers the first and makes the second a scan, and it
-- cannot carry a foreign key, so purging an account would leave dead ids behind.
create table if not exists public.invoice_bank_accounts (
    invoice_id               uuid not null references public.invoices(id) on delete cascade,
    supplier_bank_account_id uuid not null references public.supplier_bank_accounts(id) on delete cascade,
    -- The order the accounts were printed on the document. The first is usually the one to pay,
    -- but that is a hint for a reader, not a rule: the default lives on the account.
    position                 smallint,
    first_seen_at            timestamptz not null default now(),
    primary key (invoice_id, supplier_bank_account_id)
);

comment on table public.invoice_bank_accounts is
    'Which bank accounts each invoice named. Written by the pipeline at ingest. The raw text stays '
    'in invoices.extracted, including fragments that could never become an account row.';

-- The primary key already serves invoice -> accounts. This is the other direction.
create index if not exists invoice_bank_accounts_account_idx
  on public.invoice_bank_accounts (supplier_bank_account_id);

alter table public.invoice_bank_accounts enable row level security;

drop policy if exists "invoice_bank_accounts_select" on public.invoice_bank_accounts;
create policy "invoice_bank_accounts_select" on public.invoice_bank_accounts
  for select to authenticated using (true);

-- The Hub does not write these; the pipeline does, through the service role. No insert, update or
-- delete policy, so a browser cannot invent a link between an invoice and an account.

-- ---------------------------------------------------------------------------------------------
-- The flag
-- ---------------------------------------------------------------------------------------------
-- An account is flagged when the pipeline added it to a supplier that already existed and nobody
-- has confirmed it: `source = 'pipeline' and confirmed_at is null`.
--
-- A timestamp and an actor rather than a boolean, because the question an audit asks about a bank
-- account is who vouched for it and when. Null also says "not looked at yet" without being
-- confused with "looked at and rejected", which is a delete.
do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        raise notice 'public.supplier_bank_accounts not found, skipping the confirmation columns';
        return;
    end if;

    alter table public.supplier_bank_accounts
        add column if not exists confirmed_at timestamptz,
        add column if not exists confirmed_by text;

    comment on column public.supplier_bank_accounts.confirmed_at is
        'When a person vouched for this account. Null on a pipeline-added account means it is '
        'waiting for review. Accounts added in the Hub, carried over by a backfill, or belonging '
        'to a supplier the pipeline created in the same run are confirmed on the way in.';
end $$;

-- Everything already on file counts as confirmed. The flag is for what arrives from here on:
-- stamping the existing pipeline accounts as unreviewed would light up most of the supplier list
-- on the first load with a backlog nobody chose to take on, and the amber badge would mean
-- "historical" instead of "look at this".
do $$
declare
    bestaetigt int;
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    update public.supplier_bank_accounts
       set confirmed_at = coalesce(first_seen_at, now()),
           confirmed_by = 'migration'
     where confirmed_at is null;
    get diagnostics bestaetigt = row_count;
    raise notice 'supplier_bank_accounts: % existing account(s) marked as already confirmed', bestaetigt;
end $$;

-- Only the pipeline can create an unconfirmed account, so the flag cannot be raised from a browser.
-- Confirming is an ordinary update, which the existing update policy already allows.

insert into public.package_migrations (version)
values ('0014_invoice_bank_accounts')
on conflict (version) do nothing;
