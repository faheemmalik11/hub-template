-- Every invoice records the account it is associated with, including the ones read before the
-- table existed.
--
-- The Hub's supplier tab reads invoice_bank_accounts and nothing else, so an invoice with no row
-- there shows "no payment account available" even when its supplier has one on file. Everything
-- ingested before migration 20260828170000 is in exactly that position. This gives each of them
-- the same row the pipeline would write for them today: the supplier's standing account, marked
-- as the fallback rather than as something the document said.
--
-- Only fills gaps. An invoice that already has links is left alone, so a document's own accounts
-- are never overwritten by its supplier's default.
--
-- Re-runnable: the insert is guarded by the same not-exists test that selects the rows.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.invoice_bank_accounts') is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'invoice_bank_accounts'
                         and column_name = 'origin') then
        raise notice 'invoice_bank_accounts.origin not found, skipping backfill';
        return;
    end if;

    insert into public.invoice_bank_accounts (invoice_id, supplier_bank_account_id, position, origin)
    select i.id, a.id, 1, 'supplier_default'
      from public.invoices i
      join public.supplier_bank_accounts a
        on a.supplier_id = i.supplier_id
       and a.is_default
       and a.deleted_at is null
     where i.supplier_id is not null
       and not exists (select 1 from public.invoice_bank_accounts l where l.invoice_id = i.id)
    on conflict do nothing;
end $$;

insert into public.package_migrations (version)
values ('0018_backfill_invoice_bank_accounts')
on conflict (version) do nothing;
