-- Why an account is on an invoice, not just that it is.
--
-- invoice_bank_accounts held only what a document PRINTED, so an invoice that named no account had
-- no rows at all and the Hub fell back to the supplier's default by querying for it separately.
-- That left the account a person is looking at with no record tying it to the invoice: two
-- different code paths produced the same panel, and only one of them was written down.
--
-- Now every invoice links the account it is associated with, and `origin` says which of the two
-- cases it is. The distinction has to survive, because "this document told us to pay here" and
-- "the document said nothing so we are using the usual account" carry very different weight when
-- somebody is about to send money.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.invoice_bank_accounts') is null then
        raise notice 'public.invoice_bank_accounts not found, skipping origin';
        return;
    end if;

    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'invoice_bank_accounts'
                      and column_name = 'origin') then
        -- Existing rows all came from a document, which is the only thing the table held until now.
        alter table public.invoice_bank_accounts
            add column origin text not null default 'invoice';
    end if;

    if not exists (select 1 from pg_constraint where conname = 'invoice_bank_accounts_origin_known') then
        alter table public.invoice_bank_accounts
            add constraint invoice_bank_accounts_origin_known
            check (origin in ('invoice', 'supplier_default'));
    end if;

    comment on column public.invoice_bank_accounts.origin is
        'invoice = the document printed this account. supplier_default = it printed none and the '
        'supplier''s standing account is standing in.';
end $$;

insert into public.package_migrations (version)
values ('0017_invoice_bank_account_origin')
on conflict (version) do nothing;
