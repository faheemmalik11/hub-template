begin;

CREATE OR REPLACE FUNCTION public.invoice_queue_kpis(p_today date DEFAULT CURRENT_DATE) RETURNS TABLE(key text, count bigint, amount numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
      with base as (select * from public.documents where true and private_hold = false and deleted_at is null and archived_at is null and not_relevant_at is null)
      select 'all'::text, count(*), coalesce(sum(amount_gross), 0) from base
      union all
      select 'needs_action'::text, count(*), coalesce(sum(amount_gross), 0) from base where status = 'needs_review' and is_invoice = true
      union all
      select 'missing_assignment'::text, count(*), coalesce(sum(amount_gross), 0) from base where company_id is null
      union all
      select 'ready_for_payment'::text, count(*), coalesce(sum(amount_gross), 0) from base  where workflow_status in ('approved_first', 'approved_final')    and paid_at is null and not public.is_a_reminder(id)
      union all
      select 'pay_now'::text, count(*), coalesce(sum(amount_gross), 0) from base where due_date <= p_today and paid_at is null and not public.is_direct_debit(payment_method) and not public.is_a_reminder(id)
      union all
      select 'lexware_error'::text, count(*), coalesce(sum(amount_gross), 0) from base where lexoffice_sync_error is not null
      union all
      select 'completed'::text, count(*), coalesce(sum(amount_gross), 0) from base where paid_at is not null or workflow_status = 'closed';
    $$;

commit;
