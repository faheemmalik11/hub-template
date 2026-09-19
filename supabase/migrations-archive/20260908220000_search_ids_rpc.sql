-- Executes an AI-generated, kit-validated WHERE clause and returns ONLY matching invoice ids.
-- The app narrows the existing list/kanban/KPI queries to these ids, so the table shows full
-- rows through its own pagination and RLS — this function never widens what a caller could
-- already read from v_invoices_review directly (security invoker, same view, id column only).
--
-- The clause arrives pre-validated (parsed and re-serialized by the kit's whitelist parser), but
-- the function guards itself anyway since any authenticated user can call it: no statement
-- separators, no comment markers, wrapped in parentheses inside a fixed single SELECT, 8s cap.

begin;

create or replace function public.invoices_search_ids(
  p_where text default null,
  p_archived boolean default false
)
returns setof uuid
language plpgsql
stable
security invoker
set search_path to 'public'
set statement_timeout to '8s'
as $$
declare
  v_scope text := case when p_archived then 'is not null' else 'is null' end;
begin
  if p_where is not null and (p_where ~ ';' or p_where like '%--%' or p_where like '%/*%') then
    raise exception 'invalid where clause';
  end if;
  return query execute
    'select id from public.v_invoices_review where archived_at ' || v_scope ||
    ' and not_relevant_at is null' ||
    case
      when p_where is not null and btrim(p_where) <> '' then ' and (' || p_where || ')'
      else ''
    end;
end;
$$;

revoke execute on function public.invoices_search_ids(text, boolean) from public, anon;
grant execute on function public.invoices_search_ids(text, boolean) to authenticated, service_role;

commit;
