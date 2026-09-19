-- Let a person attach a supplier's account to an invoice that has none.
--
-- invoice_bank_accounts was written only by the pipeline, so it had a select policy and nothing
-- else. That leaves one case with no way out: an invoice read before its supplier had any bank
-- details at all. The document named no account, the supplier had none to stand in, so the
-- invoice has no row here and the payment panel is empty. When somebody later completes the
-- supplier, nothing goes back and connects the two.
--
-- The insert is deliberately narrow. A row may only point at an account belonging to THIS
-- invoice's supplier, and only where the invoice has no accounts of its own yet, so linking by
-- hand can never overwrite or contradict what a document actually printed.
--
-- Re-runnable: every statement is guarded, so applying this twice changes nothing.

create table if not exists public.package_migrations (
    version     text primary key,
    applied_at  timestamptz not null default now()
);

do $$
begin
    if to_regclass('public.invoice_bank_accounts') is null then
        raise notice 'public.invoice_bank_accounts not found, skipping link policy';
        return;
    end if;

    drop policy if exists "invoice_bank_accounts_link" on public.invoice_bank_accounts;
    create policy "invoice_bank_accounts_link" on public.invoice_bank_accounts
        for insert to authenticated
        with check (
            origin = 'supplier_default'
            and exists (
                select 1
                  from public.invoices i
                  join public.supplier_bank_accounts a
                    on a.id = invoice_bank_accounts.supplier_bank_account_id
                 where i.id = invoice_bank_accounts.invoice_id
                   and a.supplier_id = i.supplier_id
                   and a.deleted_at is null
                   and a.is_active
            )
            and not exists (
                select 1 from public.invoice_bank_accounts existing
                 where existing.invoice_id = invoice_bank_accounts.invoice_id
            )
        );

    -- Undoing a link is the same narrow act in reverse, so whoever may add one may remove it.
    drop policy if exists "invoice_bank_accounts_unlink" on public.invoice_bank_accounts;
    create policy "invoice_bank_accounts_unlink" on public.invoice_bank_accounts
        for delete to authenticated
        using (origin = 'supplier_default');
end $$;

insert into public.package_migrations (version)
values ('0019_link_an_account_to_an_invoice')
on conflict (version) do nothing;
