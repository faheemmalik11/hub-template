begin;

alter table public.outgoing_invoices
    add column if not exists lexoffice_file_fetched_at timestamptz,
    add column if not exists lexoffice_sync_error text;

create unique index if not exists outgoing_invoice_files_one_per_invoice
    on public.outgoing_invoice_files (outgoing_invoice_id);

commit;
