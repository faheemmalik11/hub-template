-- 0009 — English-named views, functions and triggers.
--
-- ORIGINALLY a German→English big-bang rename (immonetz's pipeline migration 0008). Every
-- `alter … rename` statement has been REMOVED for Stäy: our base schema (0000) is already the
-- post-rename English schema, so `alter table public.belege rename to invoices` would fail —
-- `belege` never exists here.
--
-- What remains is the part the base schema does NOT provide and the Hub genuinely needs:
-- the two match triggers and their functions, v_invoices_list, and invoices_kpis/invoices_facets.
-- (v_supplier_duplicates is already in 0000; the drop+create here is harmless and idempotent.)
--
-- Removed: 113 rename statements. Nothing else changed.

begin;


-- 1. Tables

-- 2. Columns

-- 3. Indexes

-- 4. Constraints (renames the backing pkey/unique index too)

-- 5. Match triggers + their functions (bodies don't auto-update). Rename the "beleg/bezahlt" one.
drop trigger if exists trg_sync_beleg_bezahlt_from_matches on public.invoice_transaction_matches;
drop trigger if exists trg_sync_transaction_matching_status on public.invoice_transaction_matches;
drop function if exists public.sync_beleg_bezahlt_from_matches();

create or replace function public.sync_invoice_paid_from_matches()
 returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  b        uuid := coalesce(new.invoice_id, old.invoice_id);
  soll     numeric;
  matched  numeric;
  paydate  date;
begin
  select amount_gross into soll from public.invoices where id = b;
  select coalesce(sum(abs(bt.amount)), 0), max(bt.booking_date)
    into matched, paydate
    from public.invoice_transaction_matches m
    join public.bank_transactions bt on bt.id = m.transaction_id
   where m.invoice_id = b and m.status = 'bestaetigt';
  if soll is not null and soll <> 0
     and matched > 0 and abs(matched - abs(soll)) <= 0.01 then
    update public.invoices
       set paid_at = coalesce(paydate::timestamptz, now()), updated_at = now()
     where id = b and paid_at is null;   -- set-only: never overwrite / never clear
    if found then
      insert into public.invoice_history (invoice_id, type, text, actor)
      values (b, 'aenderung', 'Als bezahlt markiert (bestätigter Bankabgleich)', 'system');
    end if;
  end if;
  return null;
end;
$fn$;

create or replace function public.sync_transaction_matching_status()
 returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare
  tx uuid := coalesce(new.transaction_id, old.transaction_id);
begin
  update public.bank_transactions t
     set matching_status = case
       when exists (
         select 1 from public.invoice_transaction_matches m
         where m.transaction_id = tx and m.status = 'bestaetigt'
       ) then 'zugeordnet' else 'offen' end
   where t.id = tx and t.matching_status <> 'ignoriert';
  return null;
end;
$fn$;

drop trigger if exists trg_sync_invoice_paid_from_matches on public.invoice_transaction_matches;
create trigger trg_sync_invoice_paid_from_matches
  after insert or delete or update on public.invoice_transaction_matches
  for each row execute function public.sync_invoice_paid_from_matches();
drop trigger if exists trg_sync_transaction_matching_status on public.invoice_transaction_matches;
create trigger trg_sync_transaction_matching_status
  after insert or delete or update on public.invoice_transaction_matches
  for each row execute function public.sync_transaction_matching_status();

-- 6. Views (drop + recreate with English identifiers; JSONB keys + status VALUES stay German)
drop view if exists public.v_belege_list;
drop view if exists public.v_lieferanten_duplicates;

drop view if exists public.v_invoices_list;
create view public.v_invoices_list with (security_invoker = on) as
select
  b.*,
  coalesce(l.name, b.issuer) as issuer_sort,
  (
      case when (b.validation ->> 'brutto_vorhanden') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'steller_vorhanden') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'summe_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'ust_satz_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'iban_ok') = 'false' then 10 else 0 end
    + case when (b.validation ->> 'datum_plausibel') = 'false' then 10 else 0 end
    + case when coalesce(b.validation ->> 'kleinbetrag', '') <> 'true'
                and (b.validation ->> 'rechnungsnr_vorhanden') = 'false' then 10 else 0 end
    + case when coalesce(b.validation ->> 'kleinbetrag', '') <> 'true'
                and (b.validation ->> 'datum_vorhanden') = 'false' then 10 else 0 end
    + case when b.status = 'zu_pruefen' then 5 else 0 end
    + case
        when (select min(v::numeric) from jsonb_each_text(coalesce(b.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
              where v ~ '^[0-9.]+$') < 0.8 then 3
        when (select min(v::numeric) from jsonb_each_text(coalesce(b.extracted -> 'konfidenz', '{}'::jsonb)) as e(k, v)
              where v ~ '^[0-9.]+$') < 0.95 then 1
        else 0
      end
  )::int as review_score
from public.invoices b
left join public.suppliers l on l.id = b.supplier_id
where b.deleted_at is null;
grant select on public.v_invoices_list to authenticated;

drop view if exists public.v_supplier_duplicates;
create view public.v_supplier_duplicates as
  select 'name'::text as key_type, normalized_name as key_value, count(*) as n, array_agg(id order by id) as ids
    from public.suppliers where normalized_name is not null and normalized_name <> ''
    group by normalized_name having count(*) > 1
  union all
  select 'vat_id', vat_id, count(*), array_agg(id order by id)
    from public.suppliers where vat_id is not null and vat_id <> ''
    group by vat_id having count(*) > 1;

-- 7. KPI/facet functions (renamed; bodies point at v_invoices_list + English columns)
drop function if exists public.belege_kpis(text, text, text, text, text, date, date);
drop function if exists public.belege_facets();

create or replace function public.invoices_kpis(
  p_q text default null, p_gesellschaft text default null, p_objekt text default null,
  p_belegart text default null, p_zahlung text default null, p_von date default null, p_bis date default null)
returns table(total bigint, erkannt bigint, zu_pruefen bigint, volumen numeric)
language sql stable security invoker set search_path = public as $fn$
  select
    count(*),
    count(*) filter (where status = 'erkannt'),
    count(*) filter (where status = 'zu_pruefen'),
    coalesce(sum(amount_gross), 0)
  from public.v_invoices_list
  where (p_q is null or fts @@ websearch_to_tsquery('german', p_q))
    and (p_gesellschaft is null or company_code = p_gesellschaft)
    and (p_objekt is null or property_code = p_objekt)
    and (p_belegart is null or document_type = p_belegart)
    and (p_zahlung is null or (p_zahlung = 'bezahlt' and paid_at is not null) or (p_zahlung = 'offen' and paid_at is null))
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis);
$fn$;
grant execute on function public.invoices_kpis(text, text, text, text, text, date, date) to authenticated;

create or replace function public.invoices_facets()
returns jsonb language sql stable security invoker set search_path = public as $fn$
  select jsonb_build_object(
    'objekt_codes', (select coalesce(jsonb_agg(distinct property_code order by property_code)
                       filter (where property_code is not null), '[]'::jsonb) from public.v_invoices_list),
    'belegarten', (select coalesce(jsonb_agg(distinct document_type order by document_type)
                       filter (where document_type is not null), '[]'::jsonb) from public.v_invoices_list),
    'months', (select coalesce(jsonb_agg(distinct to_char(document_date, 'YYYY-MM') order by to_char(document_date, 'YYYY-MM') desc)
                       filter (where document_date is not null), '[]'::jsonb) from public.v_invoices_list),
    'years', (select coalesce(jsonb_agg(distinct to_char(document_date, 'YYYY') order by to_char(document_date, 'YYYY') desc)
                       filter (where document_date is not null), '[]'::jsonb) from public.v_invoices_list)
  );
$fn$;
grant execute on function public.invoices_facets() to authenticated;

commit;

