begin;

alter table public.outgoing_invoices
    add column if not exists lexoffice_sync_requested_at timestamptz;

commit;
