-- Ported from immonetz (same gap, same fix, found there first): invoices_filtered_aggregate only
-- ever computed total_gross, so a "how much VAT did I pay" question had no field to map onto and
-- the Text-to-SQL layer had to guess a cost_category instead -- a different, unrelated field.
-- v_invoices_review already exposes amount_net and vat_amount (confirmed live), so this is a real
-- gap, not missing data.
--
-- Fix (paired with the invoice-nl-retrieval.functions.ts change adding sumField: 'gross'|'net'|
-- 'vat'): compute all three totals in one pass -- cheap, same row scan as before -- and let the
-- caller pick which one the question actually asked for. DROP + CREATE, not CREATE OR REPLACE,
-- since Postgres rejects changing a function's return type via REPLACE (same as immonetz's fix).
drop function if exists public.invoices_filtered_aggregate(text, text, text, text, date, date, text);

create function public.invoices_filtered_aggregate(
  p_company_code  text default null,
  p_property_code text default null,
  p_cost_category text default null,
  p_issuer_like   text default null,
  p_date_from     date default null,
  p_date_to       date default null,
  p_status        text default null
)
returns table(total_count bigint, total_gross numeric, total_net numeric, total_vat numeric)
language sql
stable
set search_path to 'public'
as $function$
  select
    count(*),
    coalesce(sum(amount_gross), 0),
    coalesce(sum(amount_net), 0),
    coalesce(sum(vat_amount), 0)
  from public.v_invoices_review
  where archived_at is null
    and not_relevant_at is null
    and (p_company_code  is null or company_code  = p_company_code)
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or cost_category = p_cost_category)
    and (p_issuer_like   is null or issuer ilike '%' || p_issuer_like || '%')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status);
$function$;

grant execute on function public.invoices_filtered_aggregate(
  text, text, text, text, date, date, text
) to authenticated;
