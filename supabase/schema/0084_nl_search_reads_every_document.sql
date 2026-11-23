
begin;



CREATE OR REPLACE FUNCTION public.invoices_search_ids(p_where text DEFAULT NULL::text, p_archived boolean DEFAULT false) RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    SET statement_timeout TO '8s'
    AS $$
declare
  v_scope text := case when p_archived then 'is not null' else 'is null' end;
begin
  if p_where is not null and (p_where ~ ';' or p_where like '%--%' or p_where like '%/*%') then
    raise exception 'invalid where clause';
  end if;
  return query execute
    'select id from public.v_documents_search where archived_at ' || v_scope ||
    ' and not_relevant_at is null' ||
    case
      when p_where is not null and btrim(p_where) <> '' then ' and (' || p_where || ')'
      else ''
    end;
end;
$$;
create or replace function public.nl_search_columns()
    returns table(column_name text, data_type text)
    language sql stable
    set search_path to 'public'
as $fn$
  select c.column_name::text, c.data_type::text
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'v_documents_search'
   order by c.ordinal_position;
$fn$;

revoke execute on function public.nl_search_columns() from public, anon;
grant execute on function public.nl_search_columns() to authenticated;

commit;
