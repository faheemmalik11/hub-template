-- Removing a bank account really removes it.
--
-- The table was created with no delete policy on purpose, so "remove" meant hiding the row. That
-- reasoning does not hold any more, and in practice it produced a record in limbo: a removed
-- account never appeared in the Papierkorb (v_trash does not cover this table), so it could not be
-- restored there either, and it sat invisible forever.
--
-- What the original design was protecting is now protected somewhere better. supplier_iban_history
-- records the account being added and every time it became the default (migration 20260828110000),
-- so deleting the row no longer erases the fact that the supplier once billed from it.
--
-- The SUPPLIER soft delete is untouched. Deleting a supplier still sets deleted_at on its accounts
-- and restoring brings them back exactly as they were. This is only about removing one account.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        raise notice 'public.supplier_bank_accounts not found, skipping the delete policy';
        return;
    end if;

    drop policy if exists "supplier_bank_accounts_delete" on public.supplier_bank_accounts;
    create policy "supplier_bank_accounts_delete" on public.supplier_bank_accounts
      for delete to authenticated using (true);
end $$;

-- The default is not deletable, at the table rather than only in the UI. `suppliers.iban` points at
-- it and the payment path reads that column, so removing it would leave the supplier pointing at an
-- account that no longer exists. Pick another default first, which is what the Hub already asks.
create or replace function public.refuse_deleting_default_bank_account() returns trigger as $$
begin
    if old.is_default then
        raise exception 'cannot delete the default bank account of supplier %; set another account '
            'as the default first', old.supplier_id
            using errcode = 'restrict_violation';
    end if;
    return old;
end;
$$ language plpgsql;

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    drop trigger if exists trg_refuse_deleting_default_bank_account on public.supplier_bank_accounts;
    create trigger trg_refuse_deleting_default_bank_account
      before delete on public.supplier_bank_accounts
      for each row execute function public.refuse_deleting_default_bank_account();
end $$;

-- The rows that were hidden by the old behaviour and never surfaced anywhere. They belong to
-- suppliers that are themselves live: an account hidden WITH its supplier keeps its deleted_at, so
-- restoring the supplier still brings it back.
do $$
declare
    aufgeraeumt int;
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    delete from public.supplier_bank_accounts a
     using public.suppliers s
     where a.supplier_id = s.id
       and a.deleted_at is not null
       and not a.is_default
       and s.deleted_at is null;
    get diagnostics aufgeraeumt = row_count;
    raise notice 'supplier_bank_accounts: % account(s) that were removed under the old behaviour '
                 'and were reachable from nowhere have been deleted', aufgeraeumt;
end $$;

insert into public.package_migrations (version)
values ('0012_supplier_bank_accounts_delete')
on conflict (version) do nothing;
