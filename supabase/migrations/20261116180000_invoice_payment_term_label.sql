begin;

alter table public.invoice_settings
    add column if not exists payment_term_label_template text not null
        default 'Zahlbar innerhalb von {{days}} Tagen, ohne Abzug.';

alter table public.invoice_settings
    drop constraint if exists invoice_settings_payment_term_label_template_present,
    drop constraint if exists invoice_settings_payment_term_label_template_has_days;

alter table public.invoice_settings
    add constraint invoice_settings_payment_term_label_template_present
        check (btrim(payment_term_label_template) <> ''),
    add constraint invoice_settings_payment_term_label_template_has_days
        check (payment_term_label_template like '%{{days}}%');

commit;
