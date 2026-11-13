-- Three choices the Lexware handover had no switch for, each shipping as the behaviour this Hub
-- already had, so turning the file on changes nothing until somebody picks differently.
--
-- Apply after 0056_invoice_settings.sql: the first two columns extend that table.

begin;

alter table public.invoice_settings
    add column if not exists payment_term_days integer not null default 14;

alter table public.invoice_settings
    add column if not exists payment_term_label_buyer text;

alter table public.invoice_settings
    add column if not exists payment_term_label_seller text;

alter table public.invoice_settings
    drop constraint if exists invoice_settings_payment_term_days_sane;

alter table public.invoice_settings
    add constraint invoice_settings_payment_term_days_sane
    check (payment_term_days >= 0 and payment_term_days <= 365);

alter table public.bonus_settings
    add column if not exists referrer_reduces_broker_basis boolean not null default false;

comment on column public.bonus_settings.referrer_reduces_broker_basis is
    'On: the referrer amount is taken off the commission before the broker share is worked out.';

alter table public.invoice_settings
    add column if not exists finalise_in_lexware boolean not null default true;

comment on column public.invoice_settings.finalise_in_lexware is
    'Off: the invoice is left as a draft in Lexware for a person to check and release there.';

commit;
