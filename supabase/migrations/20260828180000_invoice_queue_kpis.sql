-- The queue cards above the incoming-invoice list: one row per card, count and gross sum.
--
-- Deliberately a NEW function rather than more columns on invoices_kpis(). That one has been
-- extended by five migrations that splice text into pg_get_functiondef and re-execute it; its full
-- source exists in no single file, and 20260828120000 aborts if it ever finds a second overload.
-- Adding five counts to it would risk dropping clauses nobody can reconstruct.
--
-- PORTABILITY. The body is composed from the columns this Hub actually has, so the same file
-- applies to a Hub without properties, without an approval chain, or without a paid stamp: the
-- cards those columns feed are simply not returned, and the front end renders the ones it gets.
-- The card KEYS are the contract with src/lib/data/invoice-queue-config.ts.
--
-- p_today is a parameter, not current_date, for the reason migration 20260828120000 gives: the
-- database server's day is not the reader's day, so the caller passes its own local date and the
-- cards agree with the list filter beside them.

do $$
declare
  v_has   constant text := 'select 1 from information_schema.columns where table_schema=''public''';
  v_base  text := 'true';
  v_parts text[] := '{}';
  v_body  text;
  v_old   text;

  function_exists boolean;

  has_deleted      boolean;
  has_archived     boolean;
  has_not_relevant boolean;
  has_status       boolean;
  has_company      boolean;
  has_property     boolean;
  has_workflow     boolean;
  has_paid         boolean;
  has_due          boolean;
  has_amount       boolean;
  v_amount         text;
  v_assignment     text;
  v_company_col    text;
  v_property_col   text;
begin
  select exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'invoices')
    into function_exists;
  if not function_exists then
    raise notice 'invoice_queue_kpis: no invoices table on this Hub, skipping';
    return;
  end if;

  -- Every existing overload goes first. This migration has already shipped with a no-argument
  -- signature; create or replace with p_today would ADD a second overload rather than replace it,
  -- and every call site then fails as ambiguous.
  for v_old in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'invoice_queue_kpis'
  loop
    execute format('drop function if exists %s', v_old);
  end loop;

  execute v_has || ' and table_name=''invoices'' and column_name=''deleted_at''' into has_deleted;
  execute v_has || ' and table_name=''invoices'' and column_name=''archived_at''' into has_archived;
  execute v_has || ' and table_name=''invoices'' and column_name=''not_relevant_at'''
    into has_not_relevant;
  execute v_has || ' and table_name=''invoices'' and column_name=''status''' into has_status;
  -- The German column names survive on any Hub that predates the rename (see CLAUDE.md: it was
  -- done straight on the live databases, not through a tracked migration), so both spellings count.
  select c.column_name into v_company_col
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'invoices'
     and c.column_name in ('company_id', 'gesellschaft_id')
   order by case c.column_name when 'company_id' then 0 else 1 end
   limit 1;
  select c.column_name into v_property_col
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'invoices'
     and c.column_name in ('property_code', 'objekt_code')
   order by case c.column_name when 'property_code' then 0 else 1 end
   limit 1;
  has_company := v_company_col is not null;
  has_property := v_property_col is not null;
  execute v_has || ' and table_name=''invoices'' and column_name=''workflow_status'''
    into has_workflow;
  execute v_has || ' and table_name=''invoices'' and column_name=''paid_at''' into has_paid;
  execute v_has || ' and table_name=''invoices'' and column_name=''due_date''' into has_due;
  execute v_has || ' and table_name=''invoices'' and column_name=''amount_gross''' into has_amount;

  -- A Hub that stores no gross amount still gets working counts; the cards show 0,00 EUR rather
  -- than failing to create the function at all.
  v_amount := case when has_amount then 'coalesce(sum(amount_gross), 0)' else '0::numeric' end;

  if has_deleted then v_base := v_base || ' and deleted_at is null'; end if;
  if has_archived then v_base := v_base || ' and archived_at is null'; end if;
  if has_not_relevant then v_base := v_base || ' and not_relevant_at is null'; end if;

  v_parts := v_parts || format(
    'select ''all''::text, count(*), %s from base', v_amount);

  if has_status then
    v_parts := v_parts || format(
      'select ''needs_action''::text, count(*), %s from base where status = ''zu_pruefen''',
      v_amount);
  end if;

  -- COMPANY ONLY, deliberately. The list filter ANDs its axes, so it cannot express "company or
  -- property missing"; a card counting both would send the reader to a list showing a different
  -- number. Company is also the blocking one: an invoice cannot move on without it. Matches the
  -- list's own `is null` test rather than treating an empty string as missing.
  v_assignment := case
    when has_company then format('%I is null', v_company_col)
    when has_property then format('%I is null', v_property_col)
    else null
  end;
  if v_assignment is not null then
    v_parts := v_parts || format(
      'select ''missing_assignment''::text, count(*), %s from base where %s', v_amount, v_assignment);
  end if;

  if has_workflow and has_paid then
    v_parts := v_parts || format(
      'select ''ready_for_payment''::text, count(*), %s from base '
      ' where workflow_status in (''freigegeben_assistenz'', ''freigegeben_vorgesetzter'') '
      '   and paid_at is null', v_amount);
  end if;

  if has_due then
    v_parts := v_parts || format(
      'select ''overdue''::text, count(*), %s from base where due_date < p_today%s',
      v_amount,
      case when has_paid then ' and paid_at is null' else '' end);
  end if;

  if has_paid or has_workflow then
    v_parts := v_parts || format(
      'select ''completed''::text, count(*), %s from base where %s',
      v_amount,
      case
        when has_paid and has_workflow then 'paid_at is not null or workflow_status = ''abgeschlossen'''
        when has_paid then 'paid_at is not null'
        else 'workflow_status = ''abgeschlossen'''
      end);
  end if;

  if array_length(v_parts, 1) is null then
    raise notice 'invoice_queue_kpis: no card can be answered on this schema, skipping';
    return;
  end if;

  v_body := format($fn$
    create or replace function public.invoice_queue_kpis(p_today date default current_date)
    returns table (key text, count bigint, amount numeric)
    language sql
    stable
    set search_path = public
    as $body$
      with base as (select * from public.invoices where %s)
      %s;
    $body$;
  $fn$, v_base, array_to_string(v_parts, E'\n      union all\n      '));

  execute v_body;
end $$;

do $$
begin
  if to_regprocedure('public.invoice_queue_kpis(date)') is not null then
    execute 'comment on function public.invoice_queue_kpis(date) is '
         || '''Count and gross sum per queue card above the incoming-invoice list. '
         || 'See migration 20260828180000. Keys are the contract with invoice-queue-config.ts.''';
    execute 'grant execute on function public.invoice_queue_kpis(date) to authenticated';
  end if;
end $$;
