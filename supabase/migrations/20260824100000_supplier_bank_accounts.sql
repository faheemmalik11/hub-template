-- A supplier bills from more than one account, and one column can hold only one of them.
--
-- `suppliers.iban` stays as the DEFAULT account, because payment-guards.ts and the pipeline's own
-- fraud screen both read it. This table holds every account the supplier is known to use, so a
-- payer can pick one, and so alternating between two legitimate accounts stops reading as the
-- `iban_changed_recently` fraud flag that supplier_iban_history derives today.
--
-- Two invariants the code has to keep, which no constraint here can:
--   * whatever `suppliers.iban` holds exists as an active row for that supplier;
--   * a soft-deleted supplier keeps its accounts, so a past payment stays explainable.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.supplier_bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  iban         text not null,
  bic          text,
  bank_name    text,
  -- Who put it here. Constrained, so a typo cannot invent a provenance nothing reads.
  source       text not null default 'pipeline',
  -- Kept rather than deleted, so a payment that used it can still be explained.
  is_active    boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_by   text
);

-- The two checks live here rather than inline, so a table somebody created by hand still gets
-- them: `create table if not exists` above would silently skip a constraint on a second run.
do $$
begin
    if not exists (select 1 from pg_constraint
                    where conname = 'supplier_bank_accounts_iban_shape') then
        alter table public.supplier_bank_accounts
            add constraint supplier_bank_accounts_iban_shape
            check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$');
    end if;
    if not exists (select 1 from pg_constraint
                    where conname = 'supplier_bank_accounts_source_known') then
        alter table public.supplier_bank_accounts
            add constraint supplier_bank_accounts_source_known
            check (source in ('pipeline', 'human', 'backfill'));
    end if;
end $$;

-- Shape only, not the mod-97 checksum: the checks above refuse a blank, a half-read fragment
-- and the "DE.. und DE.." splice that a single column used to accept, none of which is payable.

-- Enforced rather than hoped for: the same account printed with spaces must not become a second
-- row, and the unique index below can only mean that if every writer is normalised first.
create or replace function public.compact_supplier_iban() returns trigger as $$
begin
    new.iban := upper(regexp_replace(coalesce(new.iban, ''), '[[:space:].-]', '', 'g'));
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_compact_supplier_iban on public.supplier_bank_accounts;
create trigger trg_compact_supplier_iban
  before insert or update of iban on public.supplier_bank_accounts
  for each row execute function public.compact_supplier_iban();

create unique index if not exists supplier_bank_accounts_one_per_iban
  on public.supplier_bank_accounts (supplier_id, iban);

-- Deliberately not unique across suppliers: a payment service or a collection account genuinely
-- carries unrelated parties, and matching suppliers on a shared IBAN once merged two clients.
create index if not exists supplier_bank_accounts_supplier_idx
  on public.supplier_bank_accounts (supplier_id) where is_active;

alter table public.supplier_bank_accounts enable row level security;

drop policy if exists "supplier_bank_accounts_select" on public.supplier_bank_accounts;
create policy "supplier_bank_accounts_select" on public.supplier_bank_accounts
  for select to authenticated using (true);

-- A payer may add an account and deactivate one; erasing the record of an account that was paid
-- is not something the UI gets to do, so there is deliberately no delete policy.
drop policy if exists "supplier_bank_accounts_insert" on public.supplier_bank_accounts;
create policy "supplier_bank_accounts_insert" on public.supplier_bank_accounts
  for insert to authenticated with check (true);

drop policy if exists "supplier_bank_accounts_update" on public.supplier_bank_accounts;
create policy "supplier_bank_accounts_update" on public.supplier_bank_accounts
  for update to authenticated using (true);

-- Every account already on file becomes its supplier's first row, but only the payable ones:
-- suppliers.iban has accepted whatever the reader printed, so some rows hold a fragment or two
-- IBANs run together, and carrying those in would offer a payer something it cannot send money to.
--
-- To list what was left behind:
--   select id, name, iban from public.suppliers
--    where coalesce(iban, '') <> ''
--      and upper(regexp_replace(iban, '[[:space:].-]', '', 'g'))
--          !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$';
do $$
declare
    carried int;
    refused int;
begin
    insert into public.supplier_bank_accounts (supplier_id, iban, bic, bank_name, source, created_by)
    select s.id,
           upper(regexp_replace(s.iban, '[[:space:].-]', '', 'g')),
           s.bic, s.bank_name, 'backfill', 'migration'
      from public.suppliers s
     where coalesce(s.iban, '') <> ''
       and upper(regexp_replace(s.iban, '[[:space:].-]', '', 'g'))
           ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
    on conflict (supplier_id, iban) do nothing;
    get diagnostics carried = row_count;

    select count(*) into refused
      from public.suppliers
     where coalesce(iban, '') <> ''
       and upper(regexp_replace(iban, '[[:space:].-]', '', 'g'))
           !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$';

    raise notice 'supplier_bank_accounts: % account(s) carried over, % supplier(s) hold something '
                 'in iban that is not payable and were left out (see the query above)',
                 carried, refused;
end $$;


-- ---------------------------------------------------------------------------
-- Matching a VAT id without reading every supplier row
-- ---------------------------------------------------------------------------
-- The pipeline compares `vat_ids_in(document)` against `vat_ids_in(row)` in Python, so it reads
-- every supplier carrying a VAT id on every document. One field can hold several ids, hence an
-- array and a GIN index: `where normalized_vat_ids && $1` asks the same question, indexed.
--
-- No backfill on purpose. Which of several tokens is a VAT id depends on a per-country format that
-- lives in core/rules/vat_id.py, and a wrong token written here would win an indexed lookup and
-- match the wrong creditor. The pipeline fills each row as it touches it; until a row is filled,
-- the code keeps its existing comparison for rows where this is still null.

alter table public.suppliers
    add column if not exists normalized_vat_ids text[];

create index if not exists suppliers_normalized_vat_ids_idx
  on public.suppliers using gin (normalized_vat_ids);


-- ---------------------------------------------------------------------------
-- One manual follow-up, announced rather than assumed
-- ---------------------------------------------------------------------------
-- merge_suppliers() reassigns supplier_iban_history explicitly; it has to do the same for this
-- table or a merge orphans the losing supplier's accounts. The function body differs per project,
-- and the losing row may already hold the same IBAN, so it needs a conflict clause rather than a
-- plain update: move what the keeper does not have, then delete the rest.
do $$
declare
    signature text := 'public.merge_suppliers(uuid,uuid,text,text)';
begin
    if to_regprocedure(signature) is null then
        return;
    end if;
    if position('supplier_bank_accounts' in pg_get_functiondef(to_regprocedure(signature))) = 0 then
        raise notice 'TODO: merge_suppliers() does not carry supplier_bank_accounts across a merge';
    end if;
end $$;
