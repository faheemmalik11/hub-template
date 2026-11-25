-- How many days after notarisation a missing payment due date gets reminded about. See
-- notify_missing_payment_dates(), 0041_propstack_payment_due_date.sql.

begin;

alter table public.invoice_settings
    add column if not exists payment_due_date_reminder_days integer not null default 42;

alter table public.invoice_settings
    drop constraint if exists invoice_settings_payment_due_date_reminder_days_sane;

alter table public.invoice_settings
    add constraint invoice_settings_payment_due_date_reminder_days_sane
    check (payment_due_date_reminder_days >= 0 and payment_due_date_reminder_days <= 365);

comment on column public.invoice_settings.payment_due_date_reminder_days is
    'Days after notarisation before administrators are reminded that a property still has no payment due date.';

commit;
