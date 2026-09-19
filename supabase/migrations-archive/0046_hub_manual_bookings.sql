-- 0033_manual_bookings.sql
-- Briefing Screen 11 ("Manual booking"): personnel costs, depreciation, and certain taxes never
-- arrive via mailbox or bank, so they need a hand-entry path that feeds the same evaluation on
-- equal footing with receipt-based figures -- the bridge from the existing "cost analysis" level
-- (Auswertungen, Screen 10) to the "real BWA" (level 2) the tax advisor actually needs.
--
-- WHAT ALREADY EXISTS, REUSED BY THIS MIGRATION
--
-- bwa_categories (migration 0030) already carries the exact taxonomy this screen needs
-- (PERSONNEL, DEPRECIATION, BUSINESS_TAX, TAX_INCOME_EARNINGS, ...) -- manual_bookings.category_id
-- points straight at it, no parallel taxonomy is introduced here.
--
-- WHAT THIS MIGRATION ADDS
--   1. manual_bookings -- one row per manually entered item OR per recurring template (company ·
--      property (optional) · BWA category · period · amount · note).
--   2. manual_bookings_expanded() -- expands a recurring row into one row per calendar month in a
--      requested range, at READ TIME only (no cron, no materialized monthly rows), so editing a
--      template's amount/category instantly changes every future month it expands into -- the same
--      "recomputes live, no snapshots" rule the briefing states for evaluations in general.
--   3. RLS write policies mirroring bwa_categories/master-data (0011/0030): the Hub is the only
--      writer here (unlike invoices, which the external pipeline also writes via service_role).

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'companies')
  then v_missing := v_missing || 'relation public.companies'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'properties')
  then v_missing := v_missing || 'relation public.properties'; end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'bwa_categories')
  then v_missing := v_missing || 'relation public.bwa_categories'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'migration 0033 preconditions not met, missing: %. Stopping before changing anything.',
      array_to_string(v_missing, ', ');
  end if;
  raise notice '0033 preconditions ok';
end $$;

-- ===========================================================================
-- 1. manual_bookings
-- ===========================================================================
create table if not exists public.manual_bookings (
  id uuid primary key default gen_random_uuid(),

  company_id  uuid not null references public.companies(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  category_id uuid not null references public.bwa_categories(id) on delete restrict,

  -- First-of-month: the economic period this item belongs to, not when it was typed in ("take the
  -- period seriously", briefing Screen 11). A plain date rather than separate year/month ints, so
  -- range filtering and sorting reuse ordinary date operators.
  period date not null,
  amount numeric not null,
  note   text,

  -- A recurring row IS the template: period is its first occurrence, recurrence_until its last
  -- (open-ended if null). Expansion into actual months happens at READ TIME, see
  -- manual_bookings_expanded() below -- never materialized, so editing amount/category/period here
  -- instantly changes every future month it expands into. No scheduled job needed or wanted.
  is_recurring     boolean not null default false,
  recurrence_until date,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Soft delete only, same convention as every other table in this schema (bwa_categories,
  -- companies, properties, business_line, ...): "remains changeable and deletable at any time".
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text,

  constraint manual_bookings_period_is_month_start check (extract(day from period) = 1),
  constraint manual_bookings_amount_nonzero check (amount <> 0),
  constraint manual_bookings_recurrence_after_period
    check (recurrence_until is null or recurrence_until >= period)
);

comment on table public.manual_bookings is
  'Manually entered cost items that never arrive as a receipt or a bank transaction (Briefing '
  'Screen 11): personnel costs, depreciation, corporate/trade tax. A recurring row is a template, '
  'expanded into calendar months at read time by manual_bookings_expanded(), never materialized. '
  'See migration 0033.';
comment on column public.manual_bookings.period is
  'First day of the month this item economically belongs to -- for a recurring row, its first '
  'occurrence.';
comment on column public.manual_bookings.is_recurring is
  'true = this row is a recurring template (period = first month, recurrence_until = last month '
  'or open-ended if null), expanded into real months at read time. false = a single one-off item.';
comment on column public.manual_bookings.category_id is
  'Required BWA line/category (bwa_categories, migration 0030) -- a manual item always has a '
  'clear, deliberately-chosen category, unlike an AI-extracted receipt that might only get a '
  'fuzzy guess, so there is no free-text fallback here (contrast invoices.cost_category).';

create index if not exists manual_bookings_company_period
  on public.manual_bookings (company_id, period) where deleted_at is null;
create index if not exists manual_bookings_category
  on public.manual_bookings (category_id) where deleted_at is null;

alter table public.manual_bookings enable row level security;

drop policy if exists "manual_bookings_read" on public.manual_bookings;
create policy "manual_bookings_read" on public.manual_bookings
  for select to authenticated using (true);
drop policy if exists "manual_bookings_insert" on public.manual_bookings;
create policy "manual_bookings_insert" on public.manual_bookings
  for insert to authenticated with check (true);
drop policy if exists "manual_bookings_update" on public.manual_bookings;
create policy "manual_bookings_update" on public.manual_bookings
  for update to authenticated using (true) with check (true);

-- ===========================================================================
-- 2. manual_bookings_expanded -- recurring rows expanded into real months, read-time only
-- ===========================================================================
create or replace function public.manual_bookings_expanded(
  p_company uuid,
  p_von     date,
  p_bis     date
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
     and b.company_id = p_company
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
     and b.company_id = p_company
     and b.is_recurring;
$$;

comment on function public.manual_bookings_expanded(uuid, date, date) is
  'Per-company manual bookings in [p_von, p_bis], with a recurring row (is_recurring) expanded '
  'into one output row per calendar month it covers in that range -- read-time only, nothing '
  'materialized. source_id always points at the template row (equal to its own id for a one-off '
  'item) so the UI can link an expanded occurrence back to editing its template. See migration '
  '0033.';

grant execute on function public.manual_bookings_expanded(uuid, date, date) to authenticated;

-- ===========================================================================
-- 3. Self-checks
-- ===========================================================================

-- 3a. A one-off booking round-trips unchanged through manual_bookings_expanded, and is excluded
-- once the requested range no longer covers its period. Rolled back via the restrict_violation
-- trick used throughout 0025/0028/0029/0030/0031/0032.
do $$
declare
  v_company  uuid;
  v_category uuid;
  v_id       uuid;
  v_n        int;
  v_amount   numeric;
begin
  select id into v_company from public.companies where deleted_at is null limit 1;
  select id into v_category from public.bwa_categories
   where deleted_at is null and bwa_block <> 'einnahmen' and not is_catchall and not is_nicht_guv
   limit 1;
  if v_company is null or v_category is null then
    raise notice '0033 self-check: no company/category available to probe, skipping 3a';
  else
    insert into public.manual_bookings (company_id, category_id, period, amount, note)
    values (v_company, v_category, date_trunc('month', now())::date, 123.45, '0033 self-check one-off')
    returning id into v_id;

    select count(*), max(amount) into v_n, v_amount
      from public.manual_bookings_expanded(
        v_company, date_trunc('month', now())::date, date_trunc('month', now())::date);
    if v_n <> 1 or v_amount is distinct from 123.45 then
      raise exception '0033 self-check FAILED: expected the one-off booking to round-trip as 1 '
        'row of 123.45, got % row(s), amount %', v_n, v_amount;
    end if;

    select count(*) into v_n
      from public.manual_bookings_expanded(
        v_company, date_trunc('month', now() - interval '2 months')::date,
        date_trunc('month', now() - interval '1 month')::date);
    if v_n <> 0 then
      raise exception '0033 self-check FAILED: one-off booking leaked into a range that does not '
        'cover its period (got % row(s))', v_n;
    end if;

    raise notice '0033 self-check ok: one-off booking round-trips unchanged and respects the '
      'requested period range';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0033 self-check rollback (3a)';
exception when restrict_violation then
  null;
end $$;

-- 3b. A recurring booking expands to exactly the months between its period and recurrence_until
-- (inclusive), and stops there even when the requested range extends further.
do $$
declare
  v_company  uuid;
  v_category uuid;
  v_id       uuid;
  v_n        int;
  v_start    date := date_trunc('month', now())::date;
  v_end      date := (date_trunc('month', now()) + interval '2 months')::date;
begin
  select id into v_company from public.companies where deleted_at is null limit 1;
  select id into v_category from public.bwa_categories
   where deleted_at is null and bwa_block <> 'einnahmen' and not is_catchall and not is_nicht_guv
   limit 1;
  if v_company is null or v_category is null then
    raise notice '0033 self-check: no company/category available to probe, skipping 3b';
  else
    insert into public.manual_bookings
      (company_id, category_id, period, amount, note, is_recurring, recurrence_until)
    values
      (v_company, v_category, v_start, 50.00, '0033 self-check recurring', true, v_end)
    returning id into v_id;

    -- Requested range reaches 6 months past the template's own end -- must still stop at v_end.
    select count(*) into v_n
      from public.manual_bookings_expanded(
        v_company, v_start, (v_end + interval '6 months')::date);
    if v_n <> 3 then
      raise exception '0033 self-check FAILED: expected a recurring booking (% to %) to expand to '
        'exactly 3 months, got %', v_start, v_end, v_n;
    end if;

    raise notice '0033 self-check ok: recurring booking expands to exactly its own [period, '
      'recurrence_until] window regardless of a wider requested range';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0033 self-check rollback (3b)';
exception when restrict_violation then
  null;
end $$;

-- 3c. An open-ended recurring booking (recurrence_until null) expands up to the requested range's
-- own end, not further -- and a soft-deleted booking is excluded entirely.
do $$
declare
  v_company  uuid;
  v_category uuid;
  v_id       uuid;
  v_n        int;
  v_start    date := date_trunc('month', now())::date;
begin
  select id into v_company from public.companies where deleted_at is null limit 1;
  select id into v_category from public.bwa_categories
   where deleted_at is null and bwa_block <> 'einnahmen' and not is_catchall and not is_nicht_guv
   limit 1;
  if v_company is null or v_category is null then
    raise notice '0033 self-check: no company/category available to probe, skipping 3c';
  else
    insert into public.manual_bookings (company_id, category_id, period, amount, is_recurring)
    values (v_company, v_category, v_start, 9.99, true)
    returning id into v_id;

    select count(*) into v_n
      from public.manual_bookings_expanded(
        v_company, v_start, (v_start + interval '3 months')::date);
    if v_n <> 4 then
      raise exception '0033 self-check FAILED: expected an open-ended recurring booking to expand '
        'to exactly 4 months (capped by the requested range), got %', v_n;
    end if;

    update public.manual_bookings set deleted_at = now() where id = v_id;
    select count(*) into v_n
      from public.manual_bookings_expanded(
        v_company, v_start, (v_start + interval '3 months')::date);
    if v_n <> 0 then
      raise exception '0033 self-check FAILED: a soft-deleted booking still appeared in '
        'manual_bookings_expanded (got % row(s))', v_n;
    end if;

    raise notice '0033 self-check ok: an open-ended recurring booking is capped by the requested '
      'range, and a soft-deleted booking is excluded entirely';
  end if;

  raise exception using errcode = 'restrict_violation', message = '0033 self-check rollback (3c)';
exception when restrict_violation then
  null;
end $$;

commit;
