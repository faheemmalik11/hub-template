-- The intent classifier recognises "what did we spend in total" and composeQuery() even builds the
-- aggregate SQL, but nothing ever ran it: searchInvoicesByQuestion returned ids only, so a total
-- question narrowed the table and left the person to add the column up themselves. The summing
-- lived in the parallel askInvoiceQuestion implementation, which no component renders.
--
-- Same where clause, same scope and same refusals as invoices_search_ids, so the number can never
-- describe a different set of rows than the list below it.

begin;

create or replace function public.invoices_search_totals(
    p_where text default null,
    p_archived boolean default false
)
    returns table(invoice_count bigint, total_gross numeric, total_net numeric, total_vat numeric)
    language plpgsql stable
    set search_path to 'public'
    set statement_timeout to '8s'
as $fn$
declare
  v_scope text := case when p_archived then 'is not null' else 'is null' end;
begin
  if p_where is not null and (p_where ~ ';' or p_where like '%--%' or p_where like '%/*%') then
    raise exception 'invalid where clause';
  end if;
  return query execute
    'select count(*)::bigint,
            coalesce(sum(amount_gross), 0)::numeric,
            coalesce(sum(amount_net), 0)::numeric,
            coalesce(sum(vat_amount), 0)::numeric
       from public.v_documents_search
      where archived_at ' || v_scope ||
    ' and not_relevant_at is null' ||
    case
      when p_where is not null and btrim(p_where) <> '' then ' and (' || p_where || ')'
      else ''
    end;
end;
$fn$;

revoke execute on function public.invoices_search_totals(text, boolean) from public, anon;
grant execute on function public.invoices_search_totals(text, boolean) to authenticated;

commit;
