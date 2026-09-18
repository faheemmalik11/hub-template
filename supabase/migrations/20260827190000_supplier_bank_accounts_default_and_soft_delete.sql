-- Which of a supplier's accounts is THE one to pay, said on the account row itself.
--
-- Until now the answer lived only in `suppliers.iban`: the default was "the account whose IBAN
-- happens to equal the supplier's iban column". That works, but it cannot be joined against, cannot
-- be constrained, and every reader has to re-derive it by normalising two strings and comparing
-- them. `is_default` states it.
--
-- `suppliers.iban` REMAINS AUTHORITATIVE. payment-guards.ts, the pipeline's fraud screen and
-- supplier_iban_history all read it, and the Hub sets a default by writing it (see
-- useSetDefaultSupplierIban). So the two are kept in step by a pair of triggers rather than by
-- asking every writer to remember both. Left to the writers, the flag would be stale the first time
-- somebody changed a default through the UI, and `suppliers.iban` would be stale the first time
-- anything wrote the flag directly. If `is_default` ever becomes the authoritative side, drop
-- trg_supplier_default_iban_sync and move the writers over; nothing else here has to change.
--
--
-- TWO package versions in one file. Immonetz took these as separate migrations because 0008 was
-- already applied there before 0009 existed. Here neither had run, so they are merged: one file,
-- one pass over the table, both versions recorded at the end.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        raise notice 'public.supplier_bank_accounts not found, skipping is_default';
        return;
    end if;

    alter table public.supplier_bank_accounts
        add column if not exists is_default boolean not null default false;

    comment on column public.supplier_bank_accounts.is_default is
        'The account this supplier is paid on. At most one per supplier (partial unique index). '
        'Mirrors suppliers.iban, which stays authoritative. See trg_supplier_default_iban_sync.';

    -- A default that is not active would aim the payment path at an account the Hub has just said
    -- is out of use. The Hub already refuses that (useDeactivateSupplierBankAccount); this is the
    -- same rule where it cannot be bypassed. Pick a different default first, then deactivate.
    if not exists (select 1 from pg_constraint
                    where conname = 'supplier_bank_accounts_default_is_active') then
        alter table public.supplier_bank_accounts
            add constraint supplier_bank_accounts_default_is_active
            check (not is_default or is_active);
    end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- One default per supplier
-- ---------------------------------------------------------------------------------------------
-- The index is the guarantee; the trigger is what makes the guarantee usable. Without the trigger
-- every caller would have to unset the old default first, in the same transaction, in the right
-- order, and the one that forgets gets a unique-violation instead of a new default.
create or replace function public.supplier_bank_accounts_single_default() returns trigger as $$
begin
    if not new.is_default then
        return new;
    end if;

    -- A row ARRIVING from another supplier (merge_suppliers reassigns supplier_id) must not depose
    -- the keeper's own default. Without this the merge just fails on the unique index below.
    if tg_op = 'UPDATE'
       and new.supplier_id is distinct from old.supplier_id
       and exists (select 1 from public.supplier_bank_accounts
                    where supplier_id = new.supplier_id and id <> new.id and is_default) then
        new.is_default := false;
        return new;
    end if;

    -- Setting a default clears the previous one. No recursion: the inner update writes
    -- is_default = false, and this function returns early for those rows.
    update public.supplier_bank_accounts
       set is_default = false
     where supplier_id = new.supplier_id
       and id <> new.id
       and is_default;

    return new;
end;
$$ language plpgsql;

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    drop trigger if exists trg_supplier_bank_accounts_single_default
        on public.supplier_bank_accounts;
    create trigger trg_supplier_bank_accounts_single_default
      before insert or update of is_default, supplier_id on public.supplier_bank_accounts
      for each row execute function public.supplier_bank_accounts_single_default();
end $$;

create unique index if not exists supplier_bank_accounts_one_default_per_supplier
  on public.supplier_bank_accounts (supplier_id) where is_default;

-- ---------------------------------------------------------------------------------------------
-- Keeping the two sides in step: suppliers.iban <-> is_default
-- ---------------------------------------------------------------------------------------------
-- Both directions, because both are real write paths. The Hub sets a default by writing
-- suppliers.iban (useSetDefaultSupplierIban writes the account row first, so the row this points at
-- already exists); anything working from the account table sets is_default. Whichever is written,
-- the other follows, so payment-guards.ts and the fraud screen (both of which read suppliers.iban)
-- can never be aimed at an account the flag says is not the default.
--
-- Neither direction loops: each writes only when the compacted values actually differ, and the
-- second hop finds nothing left to change.
create or replace function public.supplier_default_iban_sync() returns trigger as $$
declare
    compact text := upper(regexp_replace(coalesce(new.iban, ''), '[[:space:].-]', '', 'g'));
begin
    if compact = '' then
        update public.supplier_bank_accounts
           set is_default = false
         where supplier_id = new.id and is_default;
        return null;
    end if;

    update public.supplier_bank_accounts
       set is_default = false
     where supplier_id = new.id and is_default and iban <> compact;

    update public.supplier_bank_accounts
       set is_default = true, is_active = true
     where supplier_id = new.id and iban = compact and not is_default;

    return null;
end;
$$ language plpgsql;

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null or to_regclass('public.suppliers') is null then
        return;
    end if;
    drop trigger if exists trg_supplier_default_iban_sync on public.suppliers;
    create trigger trg_supplier_default_iban_sync
      after update of iban on public.suppliers
      for each row when (new.iban is distinct from old.iban)
      execute function public.supplier_default_iban_sync();
end $$;

-- The way back: setting is_default moves suppliers.iban, which is what the payment path reads.
-- bic and bank_name follow only when the account carries them, so promoting an account that never
-- had a BIC does not erase the one on the supplier record.
create or replace function public.supplier_default_account_sync() returns trigger as $$
begin
    if not new.is_default then
        return null;
    end if;

    -- Compared compacted, so the backfill below does not rewrite 'DE12 3456 ...' as 'DE123456...'
    -- for every supplier. That is not a change of account, but supplier_iban_history would record
    -- it as one, and every one of those rows would show up in the Hub as a bank-details warning.
    update public.suppliers s
       set iban       = new.iban,
           bic        = coalesce(new.bic, s.bic),
           bank_name  = coalesce(new.bank_name, s.bank_name),
           updated_at = now()
     where s.id = new.supplier_id
       and upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
           is distinct from new.iban;

    return null;
end;
$$ language plpgsql;

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null or to_regclass('public.suppliers') is null then
        return;
    end if;
    drop trigger if exists trg_supplier_default_account_sync on public.supplier_bank_accounts;
    create trigger trg_supplier_default_account_sync
      after insert or update of is_default on public.supplier_bank_accounts
      for each row when (new.is_default) execute function public.supplier_default_account_sync();
end $$;

-- ---------------------------------------------------------------------------------------------
-- Backfill: carry suppliers.iban in, and mark it the default
-- ---------------------------------------------------------------------------------------------
-- Step 1 repeats the carry-over from migration 20260824100000 rather than assuming it: suppliers
-- that gained an IBAN since then have no account row yet, and a supplier whose only account is
-- missing would otherwise end up with no default at all.
--
-- Only PAYABLE values are carried, same shape check as supplier_bank_accounts_iban_shape.
-- suppliers.iban has accepted whatever the reader printed, so some rows hold a fragment or two
-- IBANs run together. To list what was left behind:
--   select id, name, iban from public.suppliers
--    where coalesce(iban, '') <> ''
--      and upper(regexp_replace(iban, '[[:space:].-]', '', 'g'))
--          !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$';
do $$
declare
    carried_in   int;
    marked       int;
    without_flag int;
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;

    insert into public.supplier_bank_accounts
        (supplier_id, iban, bic, bank_name, source, created_by)
    select s.id,
           upper(regexp_replace(s.iban, '[[:space:].-]', '', 'g')),
           s.bic, s.bank_name, 'backfill', 'migration'
      from public.suppliers s
     where coalesce(s.iban, '') <> ''
       and upper(regexp_replace(s.iban, '[[:space:].-]', '', 'g'))
           ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
    on conflict (supplier_id, iban) do nothing;
    get diagnostics carried_in = row_count;

    -- is_active is set alongside: the account a supplier is actually paid on cannot be one the
    -- Hub lists as out of use, and the check constraint above would refuse the row otherwise.
    update public.supplier_bank_accounts a
       set is_default = true,
           is_active  = true
      from public.suppliers s
     where a.supplier_id = s.id
       and a.iban = upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
       and coalesce(s.iban, '') <> ''
       and not a.is_default;
    get diagnostics marked = row_count;

    select count(distinct a.supplier_id) into without_flag
      from public.supplier_bank_accounts a
     where not exists (select 1 from public.supplier_bank_accounts d
                        where d.supplier_id = a.supplier_id and d.is_default);

    raise notice 'supplier_bank_accounts.is_default: % row(s) carried in, % marked as default, '
                 '% supplier(s) have accounts but no default (their suppliers.iban is empty or '
                 'unpayable, so set one in the Hub, or they are simply not paid by transfer)',
                 carried_in, marked, without_flag;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Soft delete, so deleting a supplier can take its accounts with it
-- ---------------------------------------------------------------------------------------------
-- The table already had two ways for an account to stop being current, and neither fits here.
-- `is_active = false` means "the supplier no longer bills from this account", which is a fact about
-- the account and survives the supplier. A hard delete is not offered at all: there is deliberately
-- no delete policy, because erasing an account somebody was once paid on would leave that payment
-- unexplainable.
--
-- Deleting a supplier is a third thing. The supplier itself is soft-deleted and restorable, so its
-- accounts follow the same rule: hidden, reason recorded, and brought back exactly as they were if
-- the supplier is restored.
--
-- Deliberately NOT touching is_active or is_default. A restored supplier should come back with the
-- same default it had, and clearing the flag on the way out would lose that. Readers filter on
-- deleted_at instead.

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        raise notice 'public.supplier_bank_accounts not found, skipping the soft-delete columns';
        return;
    end if;

    alter table public.supplier_bank_accounts
        add column if not exists deleted_at    timestamptz,
        add column if not exists deleted_by    text,
        add column if not exists delete_reason text;

    comment on column public.supplier_bank_accounts.deleted_at is
        'Set when the owning supplier is soft-deleted. Cleared again when it is restored. Separate '
        'from is_active, which says the supplier stopped billing from this account.';
end $$;

-- Partial, because every read the Hub makes is "the accounts of this supplier that are not
-- deleted". Indexing the deleted ones would be indexing the rows nothing asks for.
create index if not exists supplier_bank_accounts_live_idx
  on public.supplier_bank_accounts (supplier_id) where deleted_at is null;

-- No new RLS policy. A soft delete is an UPDATE, which the existing
-- supplier_bank_accounts_update policy already allows, and that is the point of doing it this way:
-- the table still has no delete policy, so nothing in the browser can erase a paid-on account.

insert into public.package_migrations (version)
values ('0008_supplier_bank_account_is_default'),
       ('0009_supplier_bank_accounts_soft_delete')
on conflict (version) do nothing;
