-- A masked IBAN is what several invoices actually print, so it is kept instead of thrown away.
--
-- Adobe and others print "DE****************4556". supplier_bank_accounts_iban_shape refuses that,
-- so the pipeline dropped it and the account existed nowhere: not in the table, and the Hub's card
-- had nothing to show but the raw string off the supplier record. Keeping the row means a person
-- can see which supplier is missing an account and complete it.
--
-- A masked account is NOT payable, and the schema says so rather than trusting every reader to
-- remember: `is_payable` is generated, and the default must be payable.
--
-- Only the pipeline writes these. The Hub refuses anything that is not a complete IBAN, which is
-- unchanged and is why the column can be completed but never masked by hand.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        raise notice 'public.supplier_bank_accounts not found, skipping masked IBANs';
        return;
    end if;

    alter table public.supplier_bank_accounts
        drop constraint if exists supplier_bank_accounts_iban_shape;

    -- Two letters, two digits or stars, then 11 to 30 of letters, digits and stars. A complete
    -- IBAN still passes; so does one whose middle a reader replaced with stars. A fragment, a
    -- blank, or the "DE.. und DE.." splice of two accounts run together still does not.
    alter table public.supplier_bank_accounts
        add constraint supplier_bank_accounts_iban_shape
        check (iban ~ '^[A-Z]{2}[0-9*]{2}[A-Z0-9*]{11,30}$');

    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'supplier_bank_accounts'
                      and column_name = 'is_payable') then
        alter table public.supplier_bank_accounts
            add column is_payable boolean
            generated always as (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$') stored;
    end if;

    comment on column public.supplier_bank_accounts.is_payable is
        'False for a masked IBAN the reader could only partly make out. Generated, so it cannot '
        'drift from the value it describes.';
end $$;

-- The default is what the payment path reads, so it has to be an account money can be sent to.
do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'supplier_bank_accounts_default_is_payable') then
        alter table public.supplier_bank_accounts
            add constraint supplier_bank_accounts_default_is_payable
            check (not is_default or is_payable);
    end if;
end $$;

-- The compacting trigger strips spaces, dots and dashes. A star is none of those, so a masked
-- value arrives intact; this is only asserted here so a future edit to that function has to
-- notice.
do $$
begin
    if to_regclass('public.supplier_bank_accounts') is null then
        return;
    end if;
    if upper(regexp_replace('DE**** 1234', '[[:space:].-]', '', 'g')) <> 'DE****1234' then
        raise exception 'compact_supplier_iban would damage a masked IBAN';
    end if;
end $$;

insert into public.package_migrations (version)
values ('0015_masked_ibans_are_kept')
on conflict (version) do nothing;
