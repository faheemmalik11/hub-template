-- A view built on select d.* freezes its column list when it is created, so the lexoffice_*
-- columns added to documents afterwards never appeared here and a filter on them failed.
-- create or replace cannot widen a view, so the three are dropped and rebuilt in order.

begin;

drop view if exists public.v_documents_review;
drop view if exists public.v_documents_search;
drop view if exists public.v_documents_list;

create or replace view public.v_documents_list with (security_invoker = true) as
select d.*,
       coalesce(s.name, d.issuer) as issuer_sort,
       -- Every failed check adds its own weight, and low confidence adds a little more. Both come
       -- from tables, so a client can reorder their own review list without a deploy.
       (
         coalesce((
           select sum(r.weight)
             from public.review_score_rules r
            where r.is_active
              and (r.applies_to_small_amounts or coalesce(d.is_small_amount, false) = false)
              and d.validation ->> r.check_key = 'false'
         ), 0)
         +
         coalesce((
           select case
                    when lowest is null then 0
                    when lowest < b.low_below then b.low_weight
                    when lowest < b.medium_below then b.medium_weight
                    else 0
                  end
             from public.review_confidence_bands b
             cross join lateral (
               select min(e.value::numeric) as lowest
                 from jsonb_each_text(coalesce(d.extracted -> b.confidence_key, '{}'::jsonb)) e
                where e.value ~ '^[0-9.]+$'
             ) c
         ), 0)
       )::integer as review_score,
       exists (
         select 1 from public.document_transaction_matches m
          where m.document_id = d.id and m.status in ('candidate', 'auto')
       ) as has_suggested_bank_match,
       exists (
         select 1 from public.document_transaction_matches m
          where m.document_id = d.id and m.status = 'confirmed'
       ) as has_confirmed_bank_match
  from public.documents d
  left join public.suppliers s on s.id = d.supplier_id
 where d.deleted_at is null
   -- A document that was split into its parts is represented by those parts, not by itself.
   and coalesce(d.status, '') <> 'split';

create or replace view public.v_documents_search with (security_invoker = true) as
select l.*,
       lower(concat_ws(' ',
           l.issuer,
           l.invoice_number,
           l.service_description,
           l.cost_category,
           to_char(l.amount_gross, 'FM9999999990.00'),
           replace(to_char(l.amount_gross, 'FM9999999990.00'), '.', ','),
           to_char(l.amount_gross, 'FM9,999,999,990.00'),
           translate(to_char(l.amount_gross, 'FM9,999,999,990.00'), ',.', '.,')
       )) as search_text
  from public.v_documents_list l;

create or replace view public.v_documents_review with (security_invoker = true) as
select *
  from public.v_documents_search
 where workflow_status in ('received', 'in_review', 'query')
    or review_score > 0
    or traffic_light in ('yellow', 'red');


commit;
