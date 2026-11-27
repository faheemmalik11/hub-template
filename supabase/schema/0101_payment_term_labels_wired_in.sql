-- Fabian's 26 November message, point 3: payment_term_label_buyer/_seller (0058_invoice_handover_
-- choices.sql) were added but never read anywhere -- Lexware got the single shared
-- payment_term_label_template (0066) on both sides, wrong for the seller, whose term is a
-- condition ("bei Eingang der Kaufpreiszahlung"), not a number of days. The Edge Function change
-- that reads these two per-side labels lives in supabase/functions/lexoffice-invoice-push and
-- _shared/tenant-config.ts; this file only gives both columns a sane default, generic for every
-- client the same way payment_term_label_template already is, and backfills the one existing row
-- a client may already have with nothing in these two columns.

begin;

alter table public.invoice_settings
    alter column payment_term_label_buyer
        set default 'Zahlbar innerhalb von {{days}} Tagen, ohne Abzug.';

alter table public.invoice_settings
    alter column payment_term_label_seller
        set default 'Fällig bei Eingang der Kaufpreiszahlung.';

update public.invoice_settings
   set payment_term_label_buyer = 'Zahlbar innerhalb von {{days}} Tagen, ohne Abzug.'
 where payment_term_label_buyer is null;

update public.invoice_settings
   set payment_term_label_seller = 'Fällig bei Eingang der Kaufpreiszahlung.'
 where payment_term_label_seller is null;

commit;
