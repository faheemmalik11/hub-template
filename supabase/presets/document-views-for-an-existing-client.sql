-- Brings an existing client's database up to the document views a fresh clone gets automatically:
-- the review-score tables they feed from, and the views themselves. Additive only — no existing
-- table, column or view is altered. Safe to run twice. Paste into the Supabase SQL editor as the
-- database owner, or run via `supabase db query --linked --file`.

begin;

alter table public.documents add column if not exists is_overhead boolean not null default false;
alter table public.documents add column if not exists tip_amount numeric(14, 2);
alter table public.documents add column if not exists handed_over_at timestamptz;
alter table public.documents add column if not exists private_owner_user_id uuid references public.app_users(id) on delete set null;

create table if not exists public.review_score_rules (
    check_key text primary key,
    weight integer not null default 10,
    applies_to_small_amounts boolean not null default true,
    is_active boolean not null default true,
    note text,
    updated_at timestamptz not null default now(),
    constraint review_score_rules_weight_sane check (weight >= 0 and weight <= 100)
);

create table if not exists public.review_confidence_bands (
    id boolean primary key default true,
    low_below numeric(4, 2) not null default 0.80,
    low_weight integer not null default 3,
    medium_below numeric(4, 2) not null default 0.95,
    medium_weight integer not null default 1,
    confidence_key text not null default 'confidence',
    updated_at timestamptz not null default now(),
    constraint review_confidence_bands_one_row check (id),
    constraint review_confidence_bands_ordered check (medium_below >= low_below)
);

insert into public.review_confidence_bands (id) values (true) on conflict (id) do nothing;

create table if not exists public.document_transaction_matches (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references public.documents(id) on delete cascade,
    transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
    status text not null default 'candidate',
    score numeric(5, 2),
    match_reasons jsonb,
    amount_matched numeric(14, 2),
    difference_reason text,
    matched_by text,
    matched_at timestamptz,
    confirmed_by text,
    confirmed_at timestamptz,
    rejected_by text,
    rejected_at timestamptz,
    reject_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint document_transaction_matches_status_known
        check (status in ('candidate', 'auto', 'confirmed', 'rejected'))
);

create unique index if not exists document_transaction_matches_pair
    on public.document_transaction_matches (document_id, transaction_id);

-- A plain "create or replace" cannot add documents columns in the middle of what d.* already
-- returned on an existing view, only append at the end, so an existing v_documents_list with an
-- older column set has to be dropped and rebuilt instead of replaced in place.
drop view if exists public.v_documents_list cascade;

create view public.v_documents_list with (security_invoker = true) as
select d.*,
       coalesce(s.name, d.issuer) as issuer_sort,
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
   and coalesce(d.status, '') not in ('split', 'aufgeteilt');

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
 where workflow_status in (
           'received', 'in_review', 'query',
           'eingegangen', 'in_pruefung', 'rueckfrage'
       )
    or review_score > 0
    or traffic_light in ('yellow', 'red', 'gelb', 'rot');

create or replace view public.v_company_document_totals with (security_invoker = true) as
select company_id, count(*) as document_count, coalesce(sum(amount_gross), 0) as document_total
  from public.documents
 where company_id is not null and deleted_at is null and archived_at is null
   and not_relevant_at is null and coalesce(status, '') not in ('split', 'aufgeteilt')
 group by company_id;

create or replace view public.v_property_document_totals with (security_invoker = true) as
select property_id, count(*) as document_count, coalesce(sum(amount_gross), 0) as document_total
  from public.documents
 where property_id is not null and deleted_at is null and archived_at is null
   and not_relevant_at is null and coalesce(status, '') not in ('split', 'aufgeteilt')
 group by property_id;

create or replace view public.v_supplier_document_totals with (security_invoker = true) as
select supplier_id, count(*) as document_count, coalesce(sum(amount_gross), 0) as document_total,
       max(document_date) as last_document_date,
       case
         when count(*) filter (where document_date is not null) >= 2
           then round((max(document_date) - min(document_date))::numeric
                      / (count(*) filter (where document_date is not null) - 1))::integer
         else null
       end as avg_days_between
  from public.documents
 where supplier_id is not null and deleted_at is null and archived_at is null
   and not_relevant_at is null and coalesce(status, '') not in ('split', 'aufgeteilt')
 group by supplier_id;

grant select on public.v_documents_list to authenticated;
grant select on public.v_documents_search to authenticated;
grant select on public.v_documents_review to authenticated;
grant select on public.v_company_document_totals to authenticated;
grant select on public.v_property_document_totals to authenticated;
grant select on public.v_supplier_document_totals to authenticated;

commit;
