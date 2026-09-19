-- The views the screens read.
--
-- TWO RULES THIS FILE EXISTS TO HOLD.
--
-- 1. `security_invoker = true` on every single view. Without it a view runs as its owner for
--    permission purposes, so it reads straight past row level security and every scoped policy
--    underneath becomes decoration. A view added without this line is a data leak, not a style slip.
--
-- 2. No sentence a person reads is built here. A view returns the parts; the app composes the
--    words from its locale file. A German label inside SQL is a client's language compiled into
--    their database.

begin;

-- What a person sees in a list of documents: the row, who it is filed under for sorting, how badly
-- it needs attention, and whether the bank already agrees with it.
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

-- The same list with one lower-cased haystack column, so a plain text box can match what a person
-- typed without the caller assembling the same expression again.
--
-- Amounts are spelled several ways on purpose: somebody searching for 1.234,56 and somebody
-- searching for 1234.56 are looking for the same invoice, and which one they type depends on where
-- they grew up rather than on what the database stores.
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

-- The same list, narrowed to what is actually waiting for a person.
--
-- Built on the SEARCH view rather than the list, so it carries search_text: the KPI and facet
-- functions count over exactly the rows a search would show, and a figure on the screen can never
-- disagree with the list beneath it.
create or replace view public.v_documents_review with (security_invoker = true) as
select *
  from public.v_documents_search
 where workflow_status in ('received', 'in_review', 'query')
    or review_score > 0
    or traffic_light in ('yellow', 'red');

-- What is still unpaid, and what stands in the way of paying it.
--
-- Covered is not the same as paid: a payment may land a little under the gross and still close the
-- invoice, which is what invoice_is_fully_covered() decides from the client's own tolerance.
create or replace view public.v_open_items with (security_invoker = true) as
select d.*,
       coalesce(m.matched_sum, 0) as matched_sum,
       public.invoice_is_fully_covered(
           d.amount_gross,
           case when d.paid_at is not null then abs(coalesce(d.amount_gross, 0))
                else coalesce(m.matched_sum, 0) end) as is_covered,
       -- One word naming what stops this being chased, for the app to translate. Null means nothing
       -- does, which is the normal case for something genuinely open.
       case
         when public.invoice_is_fully_covered(
                d.amount_gross,
                case when d.paid_at is not null then abs(coalesce(d.amount_gross, 0))
                     else coalesce(m.matched_sum, 0) end) then null
         when coalesce(d.amount_gross, 0) = 0 then 'no_amount'
         when d.amount_gross < 0 then 'credit_note'
         when coalesce(d.already_paid, false) then 'paid_privately'
         else null
       end as open_blocker,
       -- The one flag the open items screen filters on.
       not public.invoice_is_fully_covered(
             d.amount_gross,
             case when d.paid_at is not null then abs(coalesce(d.amount_gross, 0))
                  else coalesce(m.matched_sum, 0) end)
         and coalesce(d.amount_gross, 0) > 0
         and coalesce(d.already_paid, false) = false as is_open
  from public.documents d
  left join (
        select document_id, sum(coalesce(amount_matched, 0)) as matched_sum
          from public.document_transaction_matches
         where status = 'confirmed'
         group by document_id
  ) m on m.document_id = d.id
 where d.deleted_at is null
   and d.archived_at is null
   and d.not_relevant_at is null
   and coalesce(d.status, '') <> 'split';

-- Bank lines with the account and company they belong to, and whether a document claims them.
create or replace view public.v_bank_transactions_list with (security_invoker = true) as
select t.*,
       a.account_name,
       a.iban as account_iban,
       a.bank_name as account_bank_name,
       exists (
         select 1 from public.document_transaction_matches m
          where m.transaction_id = t.id and m.status in ('candidate', 'auto')
       ) as has_suggested_match,
       exists (
         select 1 from public.document_transaction_matches m
          where m.transaction_id = t.id and m.status = 'confirmed'
       ) as has_confirmed_match
  from public.bank_transactions t
  left join public.bank_accounts a on a.id = t.account_id
 where t.deleted_at is null;

-- Suppliers that look like the same company twice, by the two keys that actually identify one.
create or replace view public.v_supplier_duplicates with (security_invoker = true) as
with basis as (
    select id,
           name,
           nullif(btrim(lower(vat_id)), '') as vat_key,
           public.normalized_name(name) as name_key
      from public.suppliers
     where deleted_at is null
)
select 'vat_id' as key_type, vat_key as key_value, count(*) as n,
       array_agg(id order by name) as supplier_ids
  from basis
 where vat_key is not null
 group by vat_key
having count(*) > 1
union all
select 'name', name_key, count(*), array_agg(id order by name)
  from basis
 where name_key is not null
 group by name_key
having count(*) > 1;

-- Everything soft deleted, in one list, with the parts a screen needs to name each row. The wording
-- is the app's, which is why this returns values rather than a sentence.
create or replace view public.v_trash with (security_invoker = true) as
select 'documents' as table_name, d.id,
       jsonb_strip_nulls(jsonb_build_object(
           'issuer', nullif(btrim(d.issuer), ''),
           'reference', nullif(btrim(d.invoice_number), ''),
           'date', d.document_date,
           'amount', d.amount_gross,
           'currency', nullif(d.currency, ''))) as parts,
       d.deleted_at, d.deleted_by, d.delete_reason
  from public.documents d where d.deleted_at is not null
union all
select 'suppliers', s.id,
       jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(s.name), ''))),
       s.deleted_at, s.deleted_by, s.delete_reason
  from public.suppliers s where s.deleted_at is not null
union all
select 'companies', c.id,
       jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(c.name), ''), 'code', c.code)),
       c.deleted_at, c.deleted_by, c.delete_reason
  from public.companies c where c.deleted_at is not null
union all
select 'properties', p.id,
       jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(p.name), ''), 'code', p.code)),
       p.deleted_at, p.deleted_by, p.delete_reason
  from public.properties p where p.deleted_at is not null
union all
select 'customers', cu.id,
       jsonb_strip_nulls(jsonb_build_object('name', nullif(btrim(cu.name), ''))),
       cu.deleted_at, cu.deleted_by, cu.delete_reason
  from public.customers cu where cu.deleted_at is not null;

-- Totals, counted the same way everywhere so two screens can never disagree.
create or replace view public.v_company_document_totals with (security_invoker = true) as
select company_id, count(*) as document_count, coalesce(sum(amount_gross), 0) as document_total
  from public.documents
 where company_id is not null and deleted_at is null and archived_at is null
   and not_relevant_at is null and coalesce(status, '') <> 'split'
 group by company_id;

create or replace view public.v_property_document_totals with (security_invoker = true) as
select property_id, count(*) as document_count, coalesce(sum(amount_gross), 0) as document_total
  from public.documents
 where property_id is not null and deleted_at is null and archived_at is null
   and not_relevant_at is null and coalesce(status, '') <> 'split'
 group by property_id;

create or replace view public.v_supplier_document_totals with (security_invoker = true) as
select supplier_id, count(*) as document_count, coalesce(sum(amount_gross), 0) as document_total,
       max(document_date) as last_document_date,
       -- How often this supplier invoices, in days. Null until there are two dated documents to
       -- measure between.
       case
         when count(*) filter (where document_date is not null) >= 2
           then round((max(document_date) - min(document_date))::numeric
                      / (count(*) filter (where document_date is not null) - 1))::integer
         else null
       end as avg_days_between
  from public.documents
 where supplier_id is not null and deleted_at is null and archived_at is null
   and not_relevant_at is null and coalesce(status, '') <> 'split'
 group by supplier_id;

create or replace view public.v_customer_invoice_totals with (security_invoker = true) as
select customer_id,
       count(*) as invoice_count,
       coalesce(sum(amount_gross), 0) as invoice_total,
       count(*) filter (where status = 'overdue') as overdue_count
  from public.outgoing_invoices
 where customer_id is not null and deleted_at is null
 group by customer_id;


commit;
