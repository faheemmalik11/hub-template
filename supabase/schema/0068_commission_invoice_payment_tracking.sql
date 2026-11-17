-- Mirrors documents.paid_at/paid_source (0011_functions.sql's advance_workflow_on_payment and
-- lexoffice-payment-sync already use that pair for incoming invoices). Commission invoices
-- (outgoing_invoices, kind = 'commission') have no equivalent today: status can already hold
-- 'paid', but nothing records when or from where, so a Lexware-driven payment sync has nowhere to
-- write that down and deal_stage_reached('commission_received') has no timestamp to report either.

begin;

alter table public.outgoing_invoices
    add column if not exists paid_at timestamptz,
    add column if not exists paid_source text;

commit;
