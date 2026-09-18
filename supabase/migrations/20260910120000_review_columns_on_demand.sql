-- v_invoices_review: stop paying for the review columns on every read.
--
-- Migration 20260909150000 hung invoice_review_state() off the view with CROSS JOIN LATERAL. A
-- lateral sits in the FROM clause, so Postgres runs it once per row whether or not the caller
-- selected review_problem_count or review_unchecked. `select id limit 50` from this view measured
-- 1.0 s against 0.25 s from v_invoices_list, and invoices_kpis, which scans the whole filtered set
-- through the same view, measured 2.4 s server-side.
--
-- The same two values as correlated scalar subqueries live in the target list instead, and an
-- unreferenced target-list entry is never evaluated: a read that does not ask for the review
-- columns now costs what v_invoices_list costs. A read that does ask for both calls the function
-- twice per row rather than once, which is the AI-search path in
-- src/lib/api/invoice-intent-config.ts and nothing else.
--
-- The function returns exactly one row per invoice (it is a single-row `returns table`), so the
-- scalar subqueries produce the same values the lateral did. Column names, types and order are
-- unchanged, which is what lets this be CREATE OR REPLACE rather than a drop and rebuild.

begin;

create or replace view public.v_invoices_review with (security_invoker = true) as
select sub.*,
  (select rs.problem_count from public.invoice_review_state(
      bi.validation_detail, sub.extracted, bi.validation, sub.issuer, sub.invoice_number,
      sub.document_date, sub.amount_gross, sub.amount_net, sub.vat_amount, sub.vat_rate,
      sub.recipient_name, sub.company_code, sup.iban
    ) rs)::integer as review_problem_count,
  (select rs.unchecked from public.invoice_review_state(
      bi.validation_detail, sub.extracted, bi.validation, sub.issuer, sub.invoice_number,
      sub.document_date, sub.amount_gross, sub.amount_net, sub.vat_amount, sub.vat_rate,
      sub.recipient_name, sub.company_code, sup.iban
    ) rs) as review_unchecked,
  lower(
      coalesce(sub.issuer, '') || ' ' ||
      coalesce(sub.invoice_number, '') || ' ' ||
      coalesce(sub.service_description, '') || ' ' ||
      coalesce(sub.cost_category, '') || ' ' ||
      coalesce(to_char(sub.amount_gross, 'FM9999999990.00'), '') || ' ' ||
      coalesce(replace(to_char(sub.amount_gross, 'FM9999999990.00'), '.', ','), '') || ' ' ||
      coalesce(to_char(sub.amount_gross, 'FM9,999,999,990.00'), '') || ' ' ||
      coalesce(replace(replace(replace(to_char(sub.amount_gross, 'FM9,999,999,990.00'),
        ',', '#'), '.', ','), '#', '.'), '')
    ) as search_text
from (SELECT sub_1_1.id,
                    sub_1_1.company_id,
                    sub_1_1.company_code,
                    sub_1_1.supplier_id,
                    sub_1_1.issuer,
                    sub_1_1.document_type,
                    sub_1_1.document_date,
                    sub_1_1.service_date,
                    sub_1_1.invoice_number,
                    sub_1_1.amount_net,
                    sub_1_1.vat_rate,
                    sub_1_1.vat_amount,
                    sub_1_1.amount_gross,
                    sub_1_1.currency,
                    sub_1_1.is_small_amount,
                    sub_1_1.intake_channel,
                    sub_1_1.source,
                    sub_1_1.property_code,
                    sub_1_1.storage_path,
                    sub_1_1.ocr_fulltext,
                    sub_1_1.status,
                    sub_1_1.extracted,
                    sub_1_1.validation,
                    sub_1_1.gmail_message_id,
                    sub_1_1.created_at,
                    sub_1_1.service_period_from,
                    sub_1_1.service_period_to,
                    sub_1_1.cost_category,
                    sub_1_1.service_description,
                    sub_1_1.line_items,
                    sub_1_1.tax,
                    sub_1_1.issuer_address,
                    sub_1_1.recipient_name,
                    sub_1_1.recipient_address,
                    sub_1_1.customer_number,
                    sub_1_1.payment_reference,
                    sub_1_1.payment_method,
                    sub_1_1.tax_note,
                    sub_1_1.traffic_light,
                    sub_1_1.confidence_score,
                    sub_1_1.already_paid,
                    sub_1_1.fts,
                    sub_1_1.embedding,
                    sub_1_1.property_id,
                    sub_1_1.source_document_id,
                    sub_1_1.page_range,
                    sub_1_1.vat_treatment,
                    sub_1_1.business_line_id,
                    sub_1_1.business_line_code,
                    sub_1_1.assignment_source,
                    sub_1_1.workflow_status,
                    sub_1_1.assigned_to,
                    sub_1_1.order_number,
                    sub_1_1.due_date,
                    sub_1_1.paid_at,
                    sub_1_1.updated_at,
                    sub_1_1.deleted_at,
                    sub_1_1.deleted_by,
                    sub_1_1.delete_reason,
                    sub_1_1.paid_source,
                    sub_1_1.vat_source,
                    sub_1_1.cost_category_source,
                    sub_1_1.not_relevant_at,
                    sub_1_1.not_relevant_by,
                    sub_1_1.not_relevant_note,
                    sub_1_1.mailbox_reset_at,
                    sub_1_1.archived_at,
                    sub_1_1.archived_by,
                    sub_1_1.archive_note,
                    sub_1_1.assignment_decided_by,
                    sub_1_1.category_id,
                    sub_1_1.vat_deductible_pct,
                    sub_1_1.vat_deductibility_source,
                    sub_1_1.vat_special_case,
                    sub_1_1.vat_conflict_at,
                    sub_1_1.vat_conflict_note,
                    sub_1_1.vat_deductible_amount,
                    sub_1_1.vat_nondeductible_amount,
                    sub_1_1.datev_handed_over_at,
                    sub_1_1.datev_batch_id,
                    sub_1_1.issuer_sort,
                    sub_1_1.review_score,
                    sub_1_1.has_suggested_bank_match,
                    sub_1_1.has_confirmed_bank_match,
                    i.company_assignment_source,
                    i.property_assignment_source
                   FROM (( SELECT v_invoices_list.id,
                            v_invoices_list.company_id,
                            v_invoices_list.company_code,
                            v_invoices_list.supplier_id,
                            v_invoices_list.issuer,
                            v_invoices_list.document_type,
                            v_invoices_list.document_date,
                            v_invoices_list.service_date,
                            v_invoices_list.invoice_number,
                            v_invoices_list.amount_net,
                            v_invoices_list.vat_rate,
                            v_invoices_list.vat_amount,
                            v_invoices_list.amount_gross,
                            v_invoices_list.currency,
                            v_invoices_list.is_small_amount,
                            v_invoices_list.intake_channel,
                            v_invoices_list.source,
                            v_invoices_list.property_code,
                            v_invoices_list.storage_path,
                            v_invoices_list.ocr_fulltext,
                            v_invoices_list.status,
                            v_invoices_list.extracted,
                            v_invoices_list.validation,
                            v_invoices_list.gmail_message_id,
                            v_invoices_list.created_at,
                            v_invoices_list.service_period_from,
                            v_invoices_list.service_period_to,
                            v_invoices_list.cost_category,
                            v_invoices_list.service_description,
                            v_invoices_list.line_items,
                            v_invoices_list.tax,
                            v_invoices_list.issuer_address,
                            v_invoices_list.recipient_name,
                            v_invoices_list.recipient_address,
                            v_invoices_list.customer_number,
                            v_invoices_list.payment_reference,
                            v_invoices_list.payment_method,
                            v_invoices_list.tax_note,
                            v_invoices_list.traffic_light,
                            v_invoices_list.confidence_score,
                            v_invoices_list.already_paid,
                            v_invoices_list.fts,
                            v_invoices_list.embedding,
                            v_invoices_list.property_id,
                            v_invoices_list.source_document_id,
                            v_invoices_list.page_range,
                            v_invoices_list.vat_treatment,
                            v_invoices_list.business_line_id,
                            v_invoices_list.business_line_code,
                            v_invoices_list.assignment_source,
                            v_invoices_list.workflow_status,
                            v_invoices_list.assigned_to,
                            v_invoices_list.order_number,
                            v_invoices_list.due_date,
                            v_invoices_list.paid_at,
                            v_invoices_list.updated_at,
                            v_invoices_list.deleted_at,
                            v_invoices_list.deleted_by,
                            v_invoices_list.delete_reason,
                            v_invoices_list.paid_source,
                            v_invoices_list.vat_source,
                            v_invoices_list.cost_category_source,
                            v_invoices_list.not_relevant_at,
                            v_invoices_list.not_relevant_by,
                            v_invoices_list.not_relevant_note,
                            v_invoices_list.mailbox_reset_at,
                            v_invoices_list.archived_at,
                            v_invoices_list.archived_by,
                            v_invoices_list.archive_note,
                            v_invoices_list.assignment_decided_by,
                            v_invoices_list.category_id,
                            v_invoices_list.vat_deductible_pct,
                            v_invoices_list.vat_deductibility_source,
                            v_invoices_list.vat_special_case,
                            v_invoices_list.vat_conflict_at,
                            v_invoices_list.vat_conflict_note,
                            v_invoices_list.vat_deductible_amount,
                            v_invoices_list.vat_nondeductible_amount,
                            v_invoices_list.datev_handed_over_at,
                            v_invoices_list.datev_batch_id,
                            v_invoices_list.issuer_sort,
                            v_invoices_list.review_score,
                            v_invoices_list.has_suggested_bank_match,
                            v_invoices_list.has_confirmed_bank_match
                           FROM v_invoices_list) sub_1_1
                     LEFT JOIN invoices i ON ((i.id = sub_1_1.id)))) sub
left join public.invoices bi on bi.id = sub.id
left join public.suppliers sup on sup.id = sub.supplier_id
;

commit;
