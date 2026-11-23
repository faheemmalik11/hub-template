begin;

create or replace function public.invoices_search_breakdown(
    p_where text default null,
    p_archived boolean default false,
    p_group_by text default 'issuer'
)
    returns table(group_key text, invoice_count bigint, total_gross numeric)
    language plpgsql stable
    set search_path to 'public'
    set statement_timeout to '8s'
as $fn$
declare
  v_scope text := case when p_archived then 'is not null' else 'is null' end;
  v_key text := case p_group_by
                  when 'company'  then 'coalesce(company_code, ''NZO'')'
                  when 'property' then 'property_code'
                  when 'category' then 'cost_category'
                  else 'issuer'
                end;
begin
  if p_where is not null and (p_where ~ ';' or p_where like '%--%' or p_where like '%/*%') then
    raise exception 'invalid where clause';
  end if;
  return query execute
    'select ' || v_key || '::text as group_key,
            count(*)::bigint,
            coalesce(sum(amount_gross), 0)::numeric
       from public.v_documents_search
      where archived_at ' || v_scope ||
    ' and not_relevant_at is null' ||
    case
      when p_where is not null and btrim(p_where) <> '' then ' and (' || p_where || ')'
      else ''
    end ||
    ' group by 1 having ' || v_key || ' is not null
      order by 3 desc
      limit 5';
end;
$fn$;

revoke execute on function public.invoices_search_breakdown(text, boolean, text) from public, anon;
grant execute on function public.invoices_search_breakdown(text, boolean, text) to authenticated;

commit;
