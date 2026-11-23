-- The natural-language search read v_documents_review, which is the review queue: a document is
-- only in it while workflow_status is received/in_review/query, or review_score > 0, or the
-- traffic light is yellow or red. Everything already dealt with drops out. The list beside it
-- reads v_documents_list/v_documents_search instead, so a person could see an invoice in the
-- table, ask the assistant about it, and be told it does not exist -- and a client whose invoices
-- are all settled got "no match" for every question. Both read the same documents now.

begin;

CREATE OR REPLACE FUNCTION public.invoices_filtered_aggregate(p_company_code text DEFAULT NULL::text, p_property_code text DEFAULT NULL::text, p_cost_category text DEFAULT NULL::text, p_issuer_like text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_payment_state text DEFAULT NULL::text, p_amount_min numeric DEFAULT NULL::numeric, p_amount_max numeric DEFAULT NULL::numeric) RETURNS TABLE(total_count bigint, total_gross numeric, total_net numeric, total_vat numeric, all_paid_count bigint, all_paid_gross numeric, all_paid_net numeric, all_paid_vat numeric, all_open_count bigint, all_open_gross numeric, all_open_net numeric, all_open_vat numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with scope as (
    select amount_gross, amount_net, vat_amount, paid_at,
      (
        p_payment_state is null
        or (p_payment_state = 'paid'    and paid_at is not null)
        or (p_payment_state = 'open'    and paid_at is null)
        or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
        or p_payment_state not in ('paid', 'open', 'overdue')
      ) as matches_payment_filter
    from public.v_documents_search
    where archived_at is null
      and not_relevant_at is null
      and (
        p_company_code is null
        or company_code = p_company_code
        or (p_company_code = 'NZO' and company_code is null)
      )
      and (p_property_code is null or property_code = p_property_code)
      and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
      and (p_issuer_like   is null
           or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
      and (p_date_from     is null or document_date >= p_date_from)
      and (p_date_to       is null or document_date <= p_date_to)
      and (p_status        is null or status = p_status)
      and (p_amount_min    is null or amount_gross >= p_amount_min)
      and (p_amount_max    is null or amount_gross <= p_amount_max)
  )
  select
    count(*)                   filter (where matches_payment_filter),
    coalesce(sum(amount_gross) filter (where matches_payment_filter), 0),
    coalesce(sum(amount_net)   filter (where matches_payment_filter), 0),
    coalesce(sum(vat_amount)   filter (where matches_payment_filter), 0),
    count(*)                   filter (where paid_at is not null),
    coalesce(sum(amount_gross) filter (where paid_at is not null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is not null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is not null), 0),
    count(*)                   filter (where paid_at is null),
    coalesce(sum(amount_gross) filter (where paid_at is null), 0),
    coalesce(sum(amount_net)   filter (where paid_at is null), 0),
    coalesce(sum(vat_amount)   filter (where paid_at is null), 0)
  from scope;
$$;

CREATE OR REPLACE FUNCTION public.invoices_filtered_search(p_query_embedding public.vector DEFAULT NULL::public.vector, p_company_code text DEFAULT NULL::text, p_property_code text DEFAULT NULL::text, p_cost_category text DEFAULT NULL::text, p_issuer_like text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 15, p_payment_state text DEFAULT NULL::text, p_amount_min numeric DEFAULT NULL::numeric, p_amount_max numeric DEFAULT NULL::numeric) RETURNS TABLE(id uuid, invoice_number text, issuer text, document_date date, amount_gross numeric, company_code text, property_code text, cost_category text, service_description text, paid_at timestamp with time zone, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    id, invoice_number, issuer, document_date, amount_gross, company_code, property_code,
    cost_category, service_description, paid_at,
    case when p_query_embedding is not null then 1 - (embedding <=> p_query_embedding) end as similarity
  from public.v_documents_search
  where archived_at is null
    and not_relevant_at is null
    and (
      p_company_code is null
      or company_code = p_company_code
      or (p_company_code = 'NZO' and company_code is null)
    )
    and (p_property_code is null or property_code = p_property_code)
    and (p_cost_category is null or lower(cost_category) = lower(p_cost_category))
    and (p_issuer_like   is null
         or issuer ilike '%' || replace(replace(p_issuer_like, '%', '\%'), '_', '\_') || '%' escape '\')
    and (p_date_from     is null or document_date >= p_date_from)
    and (p_date_to       is null or document_date <= p_date_to)
    and (p_status        is null or status = p_status)
    and (p_amount_min    is null or amount_gross >= p_amount_min)
    and (p_amount_max    is null or amount_gross <= p_amount_max)
    and (p_query_embedding is null or embedding is not null)
    and (
      p_payment_state is null
      or (p_payment_state = 'paid'    and paid_at is not null)
      or (p_payment_state = 'open'    and paid_at is null)
      or (p_payment_state = 'overdue' and paid_at is null and due_date is not null and due_date < current_date)
      or p_payment_state not in ('paid', 'open', 'overdue')
    )
  order by
    (case when p_query_embedding is not null then embedding <=> p_query_embedding end) asc nulls last,
    document_date desc nulls last
  limit least(greatest(coalesce(p_limit, 15), 1), 50);
$$;

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

-- The AI search prompt used to carry its own hand-written list of column names. Two of them
-- (review_problem_count, review_unchecked) came over with the port from another client and exist
-- in no table or view here, so the model could build a where clause that fails. The prompt now
-- asks the database which columns the search actually has, and a rename can no longer leave a
-- stale name behind in a TypeScript file.
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
