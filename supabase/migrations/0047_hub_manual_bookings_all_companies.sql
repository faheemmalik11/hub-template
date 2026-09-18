-- 0034_manual_bookings_all_companies.sql
-- Extends manual_bookings_expanded (migration 0033, already live) to support an "all companies"
-- read: p_company becomes optional (default null = every company). p_von/p_bis stay required,
-- unchanged from 0033 -- only the company filter changes, to keep this a small, easily-verified
-- diff rather than reworking the whole function. Every existing call site (the Manuelle Buchungen
-- screen, which always passes a real company id) is unaffected.
--
-- Needed for Auswertungen's "Alle Gesellschaften" default view, which sums receipts across every
-- company today and should do the same for manual bookings, not silently drop them the moment no
-- single company is selected.

begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'manual_bookings_expanded'
  ) then
    raise exception 'migration 0034 expects manual_bookings_expanded from migration 0033, which is missing';
  end if;
  raise notice '0034 preconditions ok';
end $$;

create or replace function public.manual_bookings_expanded(
  p_company uuid default null,
  p_von     date default null,
  p_bis     date default null
)
returns table (
  source_id    uuid,
  company_id   uuid,
  property_id  uuid,
  category_id  uuid,
  period       date,
  amount       numeric,
  note         text,
  is_recurring boolean
)
language sql
stable
set search_path = public
as $$
  -- Non-recurring: pass through unchanged when its period falls in range.
  select b.id as source_id, b.company_id, b.property_id, b.category_id, b.period, b.amount,
         b.note, b.is_recurring
    from public.manual_bookings b
   where b.deleted_at is null
     and (p_company is null or b.company_id = p_company)
     and not b.is_recurring
     and b.period between date_trunc('month', p_von)::date and date_trunc('month', p_bis)::date

  union all

  -- Recurring: one row per calendar month between its own start/end and the requested range.
  -- generate_series(start, stop, step) with start > stop returns zero rows (no separate guard
  -- needed for a template outside the requested range, or one whose recurrence_until precedes it).
  select b.id as source_id, b.company_id, b.property_id, b.category_id, m.month::date as period,
         b.amount, b.note, b.is_recurring
    from public.manual_bookings b
    cross join lateral generate_series(
      greatest(b.period, date_trunc('month', p_von)::date),
      least(coalesce(b.recurrence_until, p_bis), date_trunc('month', p_bis)::date),
      interval '1 month'
    ) as m(month)
   where b.deleted_at is null
     and (p_company is null or b.company_id = p_company)
     and b.is_recurring;
$$;

comment on function public.manual_bookings_expanded(uuid, date, date) is
  'Per-company (or, with p_company null, every company) manual bookings in [p_von, p_bis], with a '
  'recurring row (is_recurring) expanded into one output row per calendar month it covers in that '
  'range -- read-time only, nothing materialized. source_id always points at the template row '
  '(equal to its own id for a one-off item). See migrations 0033, 0034.';

grant execute on function public.manual_bookings_expanded(uuid, date, date) to authenticated;

-- Self-check: p_company = null spans more than one company's bookings, and a real p_company still
-- filters down to just that one. Rolled back via the same restrict_violation trick as 0033.
do $$
declare
  v_c1     uuid;
  v_c2     uuid;
  v_cat    uuid;
  v_id1    uuid;
  v_id2    uuid;
  v_start  date := date_trunc('month', now())::date;
  v_n_all  int;
  v_n_one  int;
begin
  select id into v_c1 from public.companies where deleted_at is null order by id limit 1;
  select id into v_c2 from public.companies where deleted_at is null and id <> v_c1 order by id limit 1;
  select id into v_cat from public.bwa_categories
   where deleted_at is null and bwa_block <> 'einnahmen' and not is_catchall and not is_nicht_guv
   limit 1;
  if v_c1 is null or v_c2 is null or v_cat is null then
    raise notice '0034 self-check: need at least 2 companies and 1 usable category to probe, skipping';
  else
    insert into public.manual_bookings (company_id, category_id, period, amount, note)
    values (v_c1, v_cat, v_start, 11.00, '0034 self-check c1') returning id into v_id1;
    insert into public.manual_bookings (company_id, category_id, period, amount, note)
    values (v_c2, v_cat, v_start, 22.00, '0034 self-check c2') returning id into v_id2;

    select count(*) into v_n_all
      from public.manual_bookings_expanded(null, v_start, v_start)
     where source_id in (v_id1, v_id2);
    if v_n_all <> 2 then
      raise exception '0034 self-check FAILED: expected p_company=null to return both companies'' '
        'bookings, got % row(s)', v_n_all;
    end if;

    select count(*) into v_n_one
      from public.manual_bookings_expanded(v_c1, v_start, v_start)
     where source_id in (v_id1, v_id2);
    if v_n_one <> 1 then
      raise exception '0034 self-check FAILED: expected p_company=<c1> to return only c1''s '
        'booking, got % row(s)', v_n_one;
    end if;

    raise notice '0034 self-check ok: p_company=null spans every company, a real p_company still '
      'filters to just that one';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0034 self-check rollback';
exception when restrict_violation then
  null;
end $$;

commit;
