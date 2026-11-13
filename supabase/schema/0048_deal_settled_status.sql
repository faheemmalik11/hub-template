-- A historic sale entered for statistics only; approve_deal, create_deal_invoices and save_deal
-- are all gated to other status values, so none of them can ever touch a settled deal.

begin;

alter table public.deals
    drop constraint deals_status_known,
    add constraint deals_status_known
        check (status in ('incomplete', 'ready', 'approved', 'invoiced', 'cancelled', 'settled'));

commit;
