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
