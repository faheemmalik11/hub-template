-- Fix: changing a supplier's default account raised a unique violation.
--
-- 20260828190000 added promote_first_bank_account_to_default so a supplier's first account becomes
-- the one it is paid on. That trigger fought the older single-default trigger.
--
-- Setting account B as the default makes supplier_bank_accounts_single_default demote A with an
-- inner UPDATE. That UPDATE fires the promote trigger on A, which looks for another default and
-- does not find one, because B is still being written by its own BEFORE trigger and its new value
-- is not visible yet. So promote put A straight back, both rows ended up default, and
-- supplier_bank_accounts_one_default_per_supplier rejected the statement.
--
-- A row on its way DOWN is never a candidate for promotion. That is the whole fix: a demotion is
-- either this cascade or a deliberate one, and neither wants to be undone by a trigger.
--
-- Re-runnable: create or replace, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

create or replace function public.promote_first_bank_account_to_default()
returns trigger
language plpgsql
as $$
begin
    -- Being demoted right now, so not a candidate. Without this the single-default trigger's own
    -- cascade is undone row by row and the statement fails on the unique index.
    if tg_op = 'UPDATE' and old.is_default and not new.is_default then
        return new;
    end if;

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

insert into public.package_migrations (version)
values ('0020_promote_does_not_fight_the_switch')
on conflict (version) do nothing;
