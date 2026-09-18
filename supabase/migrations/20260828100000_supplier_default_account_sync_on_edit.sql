-- Editing the default account writes through to `suppliers`, the same as promoting one does.
--
-- trg_supplier_default_account_sync (migration 20260827190000) fired only when `is_default` was
-- SET. That covered promoting an account, which was the only way the default could change at the
-- time. Now the default can be edited in place, and on the old trigger that edit went nowhere:
-- the account row got the new IBAN, `suppliers.iban` kept the old one, and the payment path reads
-- `suppliers.iban`. The two would have been left pointing at different accounts.
--
-- So the trigger now also fires on the three columns an edit can touch.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

create or replace function public.supplier_default_account_sync() returns trigger as $$
begin
    if not new.is_default then
        return null;
    end if;

    -- The IBAN is written ONLY when it actually differs compacted. Two reasons, and the second is
    -- the one that bites: many suppliers store their IBAN with spaces, so assigning the compacted
    -- form unconditionally would rewrite `suppliers.iban` on an edit that only touched the BIC.
    -- That is not a change of account, but supplier_iban_history would record it as one and the
    -- supplier list would show a bank-details warning for it.
    update public.suppliers s
       set iban = case
                    when upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
                         is distinct from new.iban
                    then new.iban
                    else s.iban
                  end,
           bic        = coalesce(new.bic, s.bic),
           bank_name  = coalesce(new.bank_name, s.bank_name),
           updated_at = now()
     where s.id = new.supplier_id
       and (
             upper(regexp_replace(coalesce(s.iban, ''), '[[:space:].-]', '', 'g'))
               is distinct from new.iban
             or (new.bic is not null and s.bic is distinct from new.bic)
             or (new.bank_name is not null and s.bank_name is distinct from new.bank_name)
           );

    return null;
end;
$$ language plpgsql;

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null or to_regclass('public.suppliers') is null then
        raise notice 'supplier tables not found, skipping the default-account sync trigger';
        return;
    end if;
    drop trigger if exists trg_supplier_default_account_sync on public.supplier_bank_accounts;
    -- `iban, bic, bank_name` added to the column list. Still guarded by `when (new.is_default)`, so
    -- editing any other account costs nothing.
    create trigger trg_supplier_default_account_sync
      after insert or update of is_default, iban, bic, bank_name on public.supplier_bank_accounts
      for each row when (new.is_default) execute function public.supplier_default_account_sync();
end $$;

insert into public.package_migrations (version)
values ('0010_supplier_default_account_sync_on_edit')
on conflict (version) do nothing;
