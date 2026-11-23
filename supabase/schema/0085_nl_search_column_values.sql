-- The AI search prompt also hand-listed the values of its low-cardinality columns, so a client
-- whose rows still hold a pre-rename value was invisible to any question about it: the prompt
-- offered status = 'needs_review' while the rows said 'zu_pruefen', and the model has no way to
-- know. These are read from the data now and merged with the documented ones, so both the
-- canonical value and whatever a client actually stores reach the model.
--
-- Plain invoker rights on purpose: v_documents_search is security_invoker, so a person only ever
-- learns the values present in rows they may already read.

begin;

create or replace function public.nl_search_column_values()
    returns table(column_name text, value text)
    language sql stable
    set search_path to 'public'
as $fn$
  with listed as (
    select 'status' as column_name, status as value from public.v_documents_search
    union all
    select 'workflow_status', workflow_status from public.v_documents_search
    union all
    select 'document_type', document_type from public.v_documents_search
    union all
    select 'traffic_light', traffic_light from public.v_documents_search
    union all
    select 'currency', currency from public.v_documents_search
  ),
  ranked as (
    select column_name, value,
           row_number() over (partition by column_name order by count(*) desc, value) as rank
      from listed
     where value is not null and btrim(value) <> ''
     group by column_name, value
  )
  select column_name, value from ranked where rank <= 25 order by column_name, value;
$fn$;

revoke execute on function public.nl_search_column_values() from public, anon;
grant execute on function public.nl_search_column_values() to authenticated;

commit;
