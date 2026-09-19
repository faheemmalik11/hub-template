-- A supplier's first bank account becomes the one it is paid on.
--
-- supplier_bank_accounts_single_default only ever ENFORCED one default, it never granted one, so
-- the very first account added to a supplier landed with is_default = false and the supplier was
-- left with none at all. Everything downstream reads the default: the supplier card, the sync onto
-- suppliers.iban, and payment-initiate's fallback recipient. A supplier with accounts but no
-- default is invisible to all three, which is what happened the first time an account was added by
-- hand to a supplier that had none.
--
-- In the database rather than in the Hub, because the pipeline writes this table too and the rule
-- has to hold whoever does the writing.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

create or replace function public.promote_first_bank_account_to_default()
returns trigger
language plpgsql
as $$
begin
    -- Already the default, or not a live account: nothing to promote.
    if new.is_default or new.deleted_at is not null or not coalesce(new.is_active, true) then
        return new;
    end if;

    -- A masked IBAN cannot be the default: supplier_bank_accounts_default_is_payable forbids it,
    -- and money cannot be sent to it. Tested against the value rather than the generated
    -- is_payable column, which a BEFORE trigger cannot yet see.
    if new.iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
        return new;
    end if;

    if exists (select 1
                 from public.supplier_bank_accounts
                where supplier_id = new.supplier_id
                  and id <> new.id
                  and is_default
                  and deleted_at is null) then
        return new;
    end if;

    new.is_default := true;
    return new;
end;
$$;

drop trigger if exists trg_promote_first_bank_account_to_default on public.supplier_bank_accounts;

-- Named to sort after trg_compact_supplier_iban and before the single-default trigger, so the
-- IBAN is already compacted when the shape above is checked.
create trigger trg_promote_first_bank_account_to_default
    before insert or update of is_active, deleted_at, is_default
    on public.supplier_bank_accounts
    for each row
    execute function public.promote_first_bank_account_to_default();

-- The suppliers already left without one. Oldest live payable account wins, which is the account
-- they have been billing from longest.
with ohne_standard as (
    select distinct a.supplier_id
      from public.supplier_bank_accounts a
     where a.deleted_at is null and a.is_active
       and not exists (select 1 from public.supplier_bank_accounts d
                        where d.supplier_id = a.supplier_id and d.is_default and d.deleted_at is null)
), erstes as (
    select distinct on (a.supplier_id) a.id
      from public.supplier_bank_accounts a
      join ohne_standard o on o.supplier_id = a.supplier_id
     where a.deleted_at is null and a.is_active
       and a.iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
     order by a.supplier_id, a.first_seen_at, a.id
)
update public.supplier_bank_accounts
   set is_default = true
 where id in (select id from erstes);

insert into public.package_migrations (version)
values ('0016_first_bank_account_is_default')
on conflict (version) do nothing;
