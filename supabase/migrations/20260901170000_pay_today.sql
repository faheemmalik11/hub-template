begin;

create or replace function public.is_direct_debit(p_payment_method text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p_payment_method is not null
     and (
       lower(p_payment_method) like '%lastschrift%'
       or lower(p_payment_method) like '%einzug%'
       or lower(p_payment_method) like '%abbuch%'
     );
$$;

create or replace function public.is_direct_debit(public.v_invoices_review)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select public.is_direct_debit($1.payment_method);
$$;

grant execute on function public.is_direct_debit(text) to authenticated;
grant execute on function public.is_direct_debit(public.v_invoices_review) to authenticated;

create index if not exists idx_invoices_pay_now
  on public.invoices (due_date)
  where deleted_at is null
    and archived_at is null
    and paid_at is null
    and not public.is_direct_debit(payment_method);

do $$
declare
  v_def text;
  v_old constant text :=
    '''overdue''::text, count(*), coalesce(sum(amount_gross), 0) from base '
    || 'where due_date < p_today and paid_at is null';
  v_new constant text :=
    '''pay_now''::text, count(*), coalesce(sum(amount_gross), 0) from base '
    || 'where due_date <= p_today and paid_at is null '
    || 'and not public.is_direct_debit(payment_method)';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_queue_kpis';

  if v_def is null then
    raise notice 'invoice_queue_kpis is not present on this Hub, skipping';
    return;
  end if;

  if position('''pay_now''' in v_def) > 0 then
    raise notice 'invoice_queue_kpis already returns pay_now, nothing to do';
    return;
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'invoice_queue_kpis: the overdue clause is not in the expected shape';
  end if;

  execute replace(v_def, v_old, v_new);
end $$;

do $$
declare
  v_def   text;
  v_old   text;
  v_count int;
  v_anchor constant text := '    and not_relevant_at is null;';
  v_extra  constant text :=
    '    and (p_direct_debit is null '
    || 'or public.is_direct_debit(payment_method) = p_direct_debit)' || E'\n' ||
    '    and not_relevant_at is null;';
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';
  if v_count <> 1 then
    raise exception 'invoices_kpis: expected exactly 1 overload, found %', v_count;
  end if;

  select pg_get_functiondef(p.oid), p.oid::regprocedure::text
    into strict v_def, v_old
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoices_kpis';

  if position('p_direct_debit' in v_def) > 0 then
    raise notice 'invoices_kpis already takes p_direct_debit, nothing to do';
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception 'invoices_kpis: could not find the not_relevant_at clause to splice onto';
  end if;

  v_def := replace(v_def, v_anchor, v_extra);
  v_def := replace(
    v_def,
    'p_faellig_unbekannt boolean DEFAULT false)',
    'p_faellig_unbekannt boolean DEFAULT false, p_direct_debit boolean DEFAULT NULL::boolean)'
  );

  execute v_def;
  execute format('drop function %s', v_old);
end $$;

commit;
