begin;

alter table public.invoice_settings
    add column if not exists require_accounting_check boolean not null default false;

alter table public.outgoing_invoices
    add column if not exists accounting_checked_at timestamptz,
    add column if not exists accounting_checked_by text;

comment on column public.invoice_settings.require_accounting_check is
    'Off: invoices go to Lexware as soon as they are created. On: someone must confirm accounting_checked_at first.';

commit;
