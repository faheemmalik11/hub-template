-- Null: create_deal_invoices() keeps giving the buyer side the property's own due date, as before.

begin;

alter table public.invoice_settings
    add column if not exists buyer_payment_term_days integer;

alter table public.invoice_settings
    drop constraint if exists invoice_settings_buyer_payment_term_days_sane;

alter table public.invoice_settings
    add constraint invoice_settings_buyer_payment_term_days_sane
    check (buyer_payment_term_days is null
        or (buyer_payment_term_days >= 0 and buyer_payment_term_days <= 365));

comment on column public.invoice_settings.buyer_payment_term_days is
    'How many days after the invoice date the buyer side is due. Null means the same due date as the seller side.';

commit;
