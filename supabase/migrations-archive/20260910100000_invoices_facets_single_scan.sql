-- invoices_facets: one scan of `invoices` instead of four scans of v_invoices_list.
--
-- The old body ran four separate SELECTs against v_invoices_list, one per key. That view computes
-- review_score for every row with two correlated subqueries over the confidence JSON, so four
-- passes over it was enough to hit the statement timeout on 499 rows: the call answered 500 with
-- Postgres error 57014, and the Objekt and Belegart filters silently fell back to empty lists with
-- nothing on screen saying the request had failed.
--
-- None of the four keys need anything the view adds. property_code, document_type and
-- document_date all live on `invoices` itself, so this reads that table once and builds all four
-- from the same pass.
--
-- The row set is unchanged. v_invoices_list is `invoices` filtered to deleted_at is null, and the
-- same filter is applied here, so archived and not-relevant receipts still contribute their codes
-- exactly as before. security invoker is kept, so the caller's RLS still decides what they see.

begin;

create or replace function public.invoices_facets()
returns jsonb language sql stable security invoker set search_path = public as $fn$
  select jsonb_build_object(
    'objekt_codes', coalesce(
      jsonb_agg(distinct property_code order by property_code)
        filter (where property_code is not null), '[]'::jsonb),
    'belegarten', coalesce(
      jsonb_agg(distinct document_type order by document_type)
        filter (where document_type is not null), '[]'::jsonb),
    'months', coalesce(
      jsonb_agg(distinct to_char(document_date, 'YYYY-MM')
                order by to_char(document_date, 'YYYY-MM') desc)
        filter (where document_date is not null), '[]'::jsonb),
    'years', coalesce(
      jsonb_agg(distinct to_char(document_date, 'YYYY')
                order by to_char(document_date, 'YYYY') desc)
        filter (where document_date is not null), '[]'::jsonb)
  )
  from public.invoices
  where deleted_at is null;
$fn$;

grant execute on function public.invoices_facets() to authenticated;

commit;
