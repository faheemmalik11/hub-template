begin;

-- The four PropStack custom fields these depend on now exist (Verwaltung > Custom Felder >
-- Objekte, group "Provisionsbeteiligung"), but nothing reads them back into bonus/payout logic
-- yet -- that is a later slice. These columns only start capturing real values once the sync in
-- src/lib/crm/propstack.ts reads them via customField(), same as payment_due_date already does.
alter table public.properties
    add column if not exists referrer_tier_from_crm smallint,
    add column if not exists commission_share_user_external_id text,
    add column if not exists commission_share_model text
        check (commission_share_model in ('ten_percent_no_cost_deduction', 'fifty_percent_after_costs')),
    add column if not exists handover_bonus_user_external_id text;

commit;
