-- Canonical list search: one lowercased haystack per invoice (issuer, number, description,
-- category, and the gross amount in four notations: 1234.56 / 1234,56 / 1,234.56 / 1.234,56),
-- appended to v_invoices_review, replacing the german-config fts search whose stopwords swallowed
-- words like "nicht" and whose tokenizer never matched amounts. The list `.like()` filter and the
-- KPI tiles read the same column, so the table and the numbers above it cannot disagree.
-- Ported from immonetz's 20260908120000; appended via pg_get_viewdef so the live view definition
-- (including the review badge columns) is never restated by hand.

begin;

do $$
declare
  v_expr text := $expr$
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
    )
  $expr$;
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_review'
       and column_name = 'search_text'
  ) then
    raise notice 'search_text already present, skipping view rebuild';
  else
    v_def := pg_get_viewdef('public.v_invoices_review'::regclass);
    execute format(
      'create or replace view public.v_invoices_review with (security_invoker = true) as '
      'select sub.*, %s as search_text from (%s) sub',
      v_expr, rtrim(btrim(v_def), ';'));
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.invoices_kpis(p_q text DEFAULT NULL::text, p_gesellschaft text DEFAULT NULL::text, p_objekt text DEFAULT NULL::text, p_belegart text DEFAULT NULL::text, p_zahlung text DEFAULT NULL::text, p_von date DEFAULT NULL::date, p_bis date DEFAULT NULL::date, p_datev text DEFAULT NULL::text, p_workflow text DEFAULT NULL::text, p_bank_match text DEFAULT NULL::text, p_ampel text DEFAULT NULL::text, p_archiv text DEFAULT NULL::text, p_ids uuid[] DEFAULT NULL::uuid[], p_faellig_von date DEFAULT NULL::date, p_faellig_bis date DEFAULT NULL::date, p_faellig_unbekannt boolean DEFAULT false, p_direct_debit boolean DEFAULT NULL::boolean)
 RETURNS TABLE(total bigint, erkannt bigint, zu_pruefen bigint, volumen numeric, offen numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    count(*),
    count(*) filter (where status = 'erkannt'),
    count(*) filter (where status = 'zu_pruefen'),
    coalesce(sum(amount_gross), 0),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0)
  from public.v_invoices_review
  where (p_q is null or search_text like all (
      select '%' || replace(replace(replace(word, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from regexp_split_to_table(lower(p_q), '\s+') as word
      where word <> ''
    ))
    and (
      p_gesellschaft is null
      or company_code = p_gesellschaft
      -- NZO ("Nicht zugeordnet") is the catch-all for unassigned, and the pipeline
      -- expresses unassigned as NULL rather than by writing the code, so it has to
      -- match both. Same rule as migration 20260813190000 set for the search RPCs.
      or (p_gesellschaft = 'NZO' and company_code is null)
    )
    and (
      p_objekt is null
      or property_code = p_objekt
      -- The list sends this sentinel for "no property assigned". Properties have no
      -- catch-all code the way companies have NZO, so the filter is expressed as a
      -- value the column can never hold.
      or (p_objekt = '__ohne' and property_code is null)
    )
    and (p_belegart is null or document_type = p_belegart)
    and (
      p_zahlung is null
      or (p_zahlung = 'bezahlt' and paid_at is not null)
      or (p_zahlung = 'offen'   and paid_at is null)
    )
    and (
      p_datev is null
      or (p_datev = 'uebergeben' and datev_handed_over_at is not null)
      or (p_datev = 'offen'      and datev_handed_over_at is null)
    )
    and (
      p_bank_match is null
      or (p_bank_match = 'vorschlag'  and has_suggested_bank_match and not has_confirmed_bank_match)
      or (p_bank_match = 'zugeordnet' and has_confirmed_bank_match)
      or (p_bank_match = 'offen' and not has_suggested_bank_match and not has_confirmed_bank_match)
    )
    and (p_workflow is null or workflow_status = p_workflow)
    and (p_von is null or document_date >= p_von)
    and (p_bis is null or document_date <= p_bis)
    and (case when p_archiv = 'nur' then archived_at is not null else archived_at is null end)
    and (p_ids is null or id = any(p_ids))
    and (
      p_ampel is null
      or (p_ampel =  'auffaellig' and traffic_light in ('gelb', 'rot'))
      or (p_ampel <> 'auffaellig' and traffic_light = p_ampel)
    )
    and (case when p_faellig_unbekannt then due_date is null else true end)
    and (p_faellig_von is null or due_date >= p_faellig_von)
    and (p_faellig_bis is null or due_date <= p_faellig_bis)
    and (p_direct_debit is null or public.is_direct_debit(payment_method) = p_direct_debit)
    and not_relevant_at is null;
$function$;

commit;
