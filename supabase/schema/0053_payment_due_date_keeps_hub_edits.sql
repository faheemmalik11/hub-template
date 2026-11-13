-- payment_due_date is the one field a person edits here and the CRM also holds. The push to the
-- CRM can fail, and the sync then wrote the CRM's empty value back over what they typed. Same
-- shape as bank_transactions.transaction_type_source: 'hub' marks a value the sync must leave
-- alone, and the push sets it back to 'crm' once the CRM has really accepted it.

begin;

alter table public.properties
    add column if not exists payment_due_date_source text not null default 'crm';

alter table public.properties
    drop constraint if exists properties_payment_due_date_source_known;

alter table public.properties
    add constraint properties_payment_due_date_source_known
    check (payment_due_date_source in ('crm', 'hub'));

commit;
