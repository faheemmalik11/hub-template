-- 20260817170000_company_invoice_totals_view.sql
-- Per-company invoice totals, computed in Postgres instead of in the browser.
--
-- The Gesellschaften list shows "Verbuchte Belege" (a EUR sum and a count) for every company. It got
-- those by calling useBelege() -- which is deliberately "the whole invoices table", the same hook the
-- dashboard, Auswertungen and Offene Posten read -- and then grouping the rows client-side. So
-- rendering a seven-row master-data list downloaded every invoice in the system. That is fine at a
-- few hundred rows and steadily less fine after that; it is also pure waste, since the browser
-- throws away every field except company_id and amount_gross.
--
-- This view returns one row per company. The Hub reads it directly, so the list transfers a handful
-- of rows instead of the entire invoice table.
--
-- The WHERE clause is a deliberate, exact copy of the filter inside useBelege() in
-- src/lib/data/queries.ts. That matters more than it looks: if the two ever disagree, the list and
-- the company detail page would quote different totals for the same company and nothing would
-- indicate which one is right. Any change to one has to be made in the other.
--   deleted_at is null       -- soft-deleted
--   archived_at is null      -- wrongly ingested, handed back
--   not_relevant_at is null  -- reviewer said this is not a receipt at all
--   status <> 'aufgeteilt'   -- container row of a split multi-receipt scan; its children carry the data
--
-- One deliberate behaviour change. The client-side version also had a `byCode` fallback that counted
-- invoices with no company_id whose company_code string matched. This view groups by company_id
-- only. That is the same call made in the Gesellschaften detail page fix: assignment by id wins, and
-- a bare code string is not evidence of ownership (a renamed and reused code made it actively
-- wrong). There are currently zero invoices with a null company_id in any of the three Hubs, so no
-- number moves today; the difference only shows up for genuinely unassigned invoices, which now
-- count toward no company at all rather than toward whichever one happens to share the string.
--
-- `security_invoker = true` is required, not optional: without it the view would run as its owner and
-- hand every caller totals computed over rows their own RLS policies would not let them read.

begin;

create or replace view public.v_company_invoice_totals
with (security_invoker = true) as
  select
    i.company_id,
    count(*)                             as beleg_anzahl,
    coalesce(sum(i.amount_gross), 0)::numeric as beleg_summe
  from public.invoices i
  where i.company_id is not null
    and i.deleted_at is null
    and i.archived_at is null
    and i.not_relevant_at is null
    and i.status <> 'aufgeteilt'
  group by i.company_id;

grant select on public.v_company_invoice_totals to authenticated;

commit;

-- Sanity (after applying) -- these two must agree for every company:
--   select c.code, t.beleg_anzahl, t.beleg_summe
--     from public.companies c
--     left join public.v_company_invoice_totals t on t.company_id = c.id
--    where c.deleted_at is null
--    order by c.code;
--
--   select c.code, count(i.id), coalesce(sum(i.amount_gross), 0)
--     from public.companies c
--     left join public.invoices i
--       on i.company_id = c.id and i.deleted_at is null and i.archived_at is null
--      and i.not_relevant_at is null and i.status <> 'aufgeteilt'
--    where c.deleted_at is null
--    group by c.code order by c.code;
