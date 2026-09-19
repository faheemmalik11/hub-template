-- The IBAN history becomes an account history: what was added, and when the default moved.
--
-- Until now the only thing recorded was a change of `suppliers.iban`, captured by a trigger on
-- `suppliers` that wrote the OLD values. Two problems with that. Adding a bank account left no
-- trace at all, and the one event it did record was stored as the account that was replaced, so
-- reading the list forwards told you what stopped being the default rather than what became it.
--
-- Both events are now written from `supplier_bank_accounts`, which is where they actually happen,
-- and each row says which event it is and carries the account it is about.
--
-- Existing rows keep their meaning. They are stamped 'default_changed', the legacy event, and the
-- Hub still renders those as "this account was replaced on ...". Nothing is rewritten.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.supplier_iban_history') is null then
        raise notice 'public.supplier_iban_history not found, skipping the event column';
        return;
    end if;

    alter table public.supplier_iban_history
        add column if not exists event text not null default 'default_changed';

    comment on column public.supplier_iban_history.event is
        'account_added: this account was put on file. default_set: it became the default. '
        'default_changed: legacy rows, where the row holds the account that was REPLACED.';

    if not exists (select 1 from pg_constraint where conname = 'supplier_iban_history_event_known') then
        alter table public.supplier_iban_history
            add constraint supplier_iban_history_event_known
            check (event in ('account_added', 'default_set', 'default_changed'));
    end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- One writer, on the table the events happen on
-- ---------------------------------------------------------------------------------------------
-- SECURITY DEFINER, like the trigger it replaces: history is written on behalf of whoever made the
-- change, and a payer must not be able to edit or suppress it by lacking a grant.
create or replace function public.log_supplier_bank_account_event() returns trigger as $$
declare
    akteur text := coalesce(auth.uid()::text, 'pipeline');
begin
    if tg_op = 'INSERT' then
        insert into public.supplier_iban_history
            (supplier_id, iban, bic, bank_name, changed_by, event)
        values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'account_added');
        -- A supplier's first account arrives as the default, so both events are true of it and
        -- both are recorded. The list then reads the same whether the default was set on the way
        -- in or picked later.
        if new.is_default then
            insert into public.supplier_iban_history
                (supplier_id, iban, bic, bank_name, changed_by, event)
            values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'default_set');
        end if;
    elsif new.is_default and not coalesce(old.is_default, false) then
        insert into public.supplier_iban_history
            (supplier_id, iban, bic, bank_name, changed_by, event)
        values (new.supplier_id, new.iban, new.bic, new.bank_name, akteur, 'default_set');
    end if;
    return null;
end;
$$ language plpgsql security definer set search_path to 'public';

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    drop trigger if exists trg_log_supplier_bank_account_event on public.supplier_bank_accounts;
    create trigger trg_log_supplier_bank_account_event
      after insert or update of is_default on public.supplier_bank_accounts
      for each row execute function public.log_supplier_bank_account_event();
end $$;

-- The old writer stands down. Left in place it would record the same default change a second time,
-- from the other side and with the opposite meaning: promoting an account writes suppliers.iban
-- through trg_supplier_default_account_sync, which would have fired it. The function itself is kept
-- so the previous migration stays readable and the trigger can be restored by hand if needed.
drop trigger if exists trg_capture_supplier_iban_history on public.suppliers;

insert into public.package_migrations (version)
values ('0011_supplier_bank_account_events')
on conflict (version) do nothing;
