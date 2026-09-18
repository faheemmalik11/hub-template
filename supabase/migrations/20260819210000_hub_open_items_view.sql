-- Offene Posten, answered by the database instead of by the browser.
--
-- WHAT WAS WRONG. routes/offene-posten decided "is this invoice still an open item" in JavaScript:
--
--   (belegeQ.data ?? []).filter((b) => !isFullyCovered(b.amount_gross, coveredAmount(...)))
--
-- `belegeQ` is useBelege(), which is `select *` over every non-deleted invoice. On the Stäy Hub that
-- is 5,735 kB for 418 rows, of which 5,212 kB is columns this screen never reads: the embedding
-- vector (2,510 kB), the fts tsvector (1,002 kB), the extracted JSONB (1,116 kB) and ocr_fulltext
-- (584 kB). The whole ledger crossed the wire so the browser could work out a boolean, and because
-- openness was not a column, none of the screen's filters could be pushed into the query either.
--
-- NO NEW DEFINITION OF COVERAGE. The rule already exists here, in payment_tolerance(numeric), whose
-- own comment says it is "Mirrored in src/lib/data/format.ts as paymentTolerance() -- keep the two
-- in step". The view is assembled from that, so it cannot drift from the paid trigger, and it
-- mirrors isFullyCovered() + coveredAmount() clause for clause.
--
-- WHY A VIEW AND NOT A COLUMN. A trigger-maintained flag would have to be recomputed on every write
-- to invoices AND to invoice_transaction_matches, and goes stale the moment one path forgets. The
-- row counts here are hundreds, not millions, so the join is cheap and always correct.
--
-- Read only: creates no table, writes no data, adds no policy. security_invoker keeps the caller's
-- RLS on invoices, so the view cannot widen access to a single row.

-- ---------------------------------------------------------------------------
-- 1. Coverage, as one expression
-- ---------------------------------------------------------------------------
create or replace function public.invoice_is_fully_covered(p_gross numeric, p_matched numeric)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- isFullyCovered() in format.ts: no gross amount means never judged covered, and an OVERPAYMENT
  -- counts as covered because more money than owed arrived, so nothing is open. Compared in
  -- numeric, which is exact decimal; the front end rounds to whole cents to reach the same answer
  -- in IEEE754.
  select case
           when abs(coalesce(p_gross, 0)) <= 0 then false
           else round(coalesce(p_matched, 0), 2)
                  >= round(abs(p_gross) - public.payment_tolerance(p_gross), 2)
         end;
$$;

comment on function public.invoice_is_fully_covered(numeric, numeric) is
  'Whether confirmed allocations settle an invoice, within payment_tolerance. Mirrors '
  'isFullyCovered() in src/lib/data/format.ts -- keep the two in step.';

-- ---------------------------------------------------------------------------
-- 2. The view the screen queries
-- ---------------------------------------------------------------------------
-- Every column the screen reads, plus the three it could not have: matched_sum, is_open and
-- open_blocker. The exclusions in the WHERE are exactly the ones useBelege() already applies, kept
-- here so a call site cannot forget one.
--
-- open_blocker NAMES THE ROWS THAT COULD NEVER LEAVE THE LIST. Three kinds of receipt were listed
-- as open items that no action on the screen could ever close, because coverage is measured
-- against the gross amount:
--
--   kein_betrag     amount_gross is 0 or null. isFullyCovered() returns false for "no gross amount
--                   to measure against", so the row is open for ever. 22 such rows on the Stäy Hub,
--                   1 on Immonetz.
--   gutschrift      amount_gross is negative, a supplier credit note: money coming BACK. Coverage
--                   works on abs(), so the row demands to be "paid". A credit is only ever matched
--                   to an OUTGOING invoice by the matcher, so there is no path to closure. 6 such
--                   rows on the Stäy Hub.
--   privat_bezahlt  already_paid: somebody paid it from a private account, so no company bank
--                   movement can ever settle it.
--
-- They are reported, not dropped: the screen shows the count and can list them, so the reviewer can
-- go and fix the amount. Silently hiding them would be the same bug in the other direction.
create or replace view public.v_open_items
with (security_invoker = on) as
select
  i.*,
  coalesce(m.matched_sum, 0) as matched_sum,
  -- coveredAmount() in format.ts: a receipt a human marked paid counts as covered in full, because
  -- some payments (cash, a channel with no bank feed) never produce a matchable transaction.
  public.invoice_is_fully_covered(
    i.amount_gross,
    case when i.paid_at is not null
         then abs(coalesce(i.amount_gross, 0))
         else coalesce(m.matched_sum, 0) end
  ) as is_covered,
  case
    when public.invoice_is_fully_covered(
           i.amount_gross,
           case when i.paid_at is not null
                then abs(coalesce(i.amount_gross, 0))
                else coalesce(m.matched_sum, 0) end) then null
    when coalesce(i.amount_gross, 0) = 0            then 'kein_betrag'
    when i.amount_gross < 0                         then 'gutschrift'
    when coalesce(i.already_paid, false)            then 'privat_bezahlt'
    else null
  end as open_blocker,
  (
        not public.invoice_is_fully_covered(
              i.amount_gross,
              case when i.paid_at is not null
                   then abs(coalesce(i.amount_gross, 0))
                   else coalesce(m.matched_sum, 0) end)
    and coalesce(i.amount_gross, 0) > 0
    and coalesce(i.already_paid, false) = false
  ) as is_open
from public.invoices i
left join (
  -- Aggregated once here rather than per row through invoice_matched_sum(), which would run the
  -- same scan for every invoice on the page.
  select invoice_id, sum(abs(amount_matched)) as matched_sum
    from public.invoice_transaction_matches
   where status = 'bestaetigt'
   group by invoice_id
) m on m.invoice_id = i.id
where i.deleted_at is null
  -- Archived receipts are wrongly ingested ones, and "nicht relevant" is a reviewer saying this is
  -- not a receipt at all. Either one left in would sit here as a permanently open item.
  and i.archived_at is null
  and i.not_relevant_at is null
  -- Container rows of a split multi-receipt scan are not invoices; their children carry the data.
  and i.status <> 'aufgeteilt';

comment on view public.v_open_items is
  'Invoices with matched_sum, is_covered, is_open and open_blocker resolved server-side, so Offene '
  'Posten can ask for the answer instead of loading every invoice and every confirmed match into '
  'the browser. is_open mirrors isFullyCovered()/coveredAmount() in src/lib/data/format.ts.';

-- ---------------------------------------------------------------------------
-- 3. Index support for the filters this exists to enable
-- ---------------------------------------------------------------------------
create index if not exists idx_invoices_company_id on public.invoices (company_id)
  where deleted_at is null;
create index if not exists idx_invoices_property_id on public.invoices (property_id)
  where deleted_at is null;
-- The aggregate's group key. Confirmed rows only, matching the join above.
create index if not exists idx_itm_invoice_confirmed
  on public.invoice_transaction_matches (invoice_id)
  where status = 'bestaetigt';
