-- Every CRM webhook delivery, successful or not, so a dropped or failing webhook is visible without
-- reading Edge Function logs. Pure event logging, not system-of-record tracking: the property row
-- itself is the source of truth, this is only the audit trail of what a webhook did about it.
--
-- One table across every CRM a client might connect, not one table per provider: a second CRM
-- integration reuses this rather than inventing its own. Started with Propstack because that is the
-- only provider a Hub has spoken to so far.

begin;

create table if not exists public.crm_webhook_events (
    id uuid primary key default gen_random_uuid(),
    crm_provider text not null,
    crm_record_id text,
    status text not null default 'processing',
    payload jsonb not null default '{}'::jsonb,
    error text,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    constraint crm_webhook_events_provider_known check (crm_provider in ('propstack')),
    constraint crm_webhook_events_status_known check (status in (
        'processing', 'done', 'skipped', 'failed'))
);

create index if not exists crm_webhook_events_received on public.crm_webhook_events (received_at desc);
create index if not exists crm_webhook_events_record on public.crm_webhook_events (crm_provider, crm_record_id);

commit;
