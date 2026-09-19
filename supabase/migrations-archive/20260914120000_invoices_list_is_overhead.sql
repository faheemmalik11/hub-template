-- 20260914120000_invoices_list_is_overhead: carry `is_overhead` into the two list views.
--
-- WHY. `invoices.is_overhead` (migration 20260911250000) is half of what names an invoice's cost
-- centre: a property plus the company gives the number from `property_companies`, and Gemeinkosten
-- gives the company's `overhead_cost_center`. The invoice DETAIL page resolves this today because
-- it reads the row from `invoices` directly. The list reads `v_invoices_list` /
-- `v_invoices_review`, and neither carries the column, so a list row cannot tell Gemeinkosten from
-- "nobody has decided yet".
--
-- WHY IT IS MISSING. 0055 rebuilt `v_invoices_list` as `select i.*`, which Postgres expands and
-- FREEZES at creation time. Every rebuild since (20260813170000, 20260901210000) wrapped that
-- frozen definition, so a column added to `invoices` afterwards never appears on its own.
-- `v_invoices_review` embeds an expanded copy of the same list, so it has to be wrapped too:
-- replacing `v_invoices_list` does not change a dependent view's stored definition.
--
-- HOW, following the pattern 20260901210000 established for exactly this problem: read each view's
-- current definition with pg_get_viewdef and re-create it wrapped, rather than restating several
-- thousand characters of a definition that has already drifted from its tracked form.
--
--   * `with (security_invoker = true)` is NOT optional. CREATE OR REPLACE VIEW replaces a view's
--     reloptions wholesale, so leaving it out silently clears the flag and the view reverts to
--     running as its owner, which is an RLS bypass on every invoice.
--   * The join is LEFT and on the primary key: it can add the column but can never add, drop or
--     duplicate a row.
--   * The new column lands LAST, which is what CREATE OR REPLACE VIEW permits on a view that
--     already has dependents.
--
-- Idempotent: each block checks for the column first, so a re-run changes nothing.

begin;

-- ---------------------------------------------------------------------------
-- 1. v_invoices_list, the base view.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_list'
       and column_name = 'is_overhead'
  ) then
    raise notice 'v_invoices_list already exposes is_overhead';
  else
    select pg_get_viewdef('public.v_invoices_list'::regclass, true) into v_def;
    execute format(
      'create or replace view public.v_invoices_list with (security_invoker = true) as '
      'select sub.*, i.is_overhead '
      '  from (%s) sub '
      '  left join public.invoices i on i.id = sub.id',
      rtrim(btrim(v_def), ';'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. v_invoices_review, which embeds its own copy of the list's columns.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'v_invoices_review'
       and column_name = 'is_overhead'
  ) then
    raise notice 'v_invoices_review already exposes is_overhead';
  else
    select pg_get_viewdef('public.v_invoices_review'::regclass, true) into v_def;
    execute format(
      'create or replace view public.v_invoices_review with (security_invoker = true) as '
      'select sub.*, i.is_overhead '
      '  from (%s) sub '
      '  left join public.invoices i on i.id = sub.id',
      rtrim(btrim(v_def), ';'));
  end if;
end $$;

grant select on public.v_invoices_list to authenticated;
grant select on public.v_invoices_review to authenticated;

commit;

-- Sanity after applying:
--   select table_name from information_schema.columns
--    where table_schema = 'public' and column_name = 'is_overhead'
--      and table_name in ('invoices', 'v_invoices_list', 'v_invoices_review');   -- 3 rows
--   select relname, reloptions from pg_class
--    where relname in ('v_invoices_list', 'v_invoices_review');                  -- security_invoker=true
