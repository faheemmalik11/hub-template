-- 20260827180000_open_items_view_urgency_columns.sql
-- Republish v_open_items so the payment-urgency columns reach the Hub.
--
-- WHY THIS IS NEEDED AT ALL. v_open_items selects `i.*`, which reads as "every column of invoices".
-- Postgres does not keep it that way: the star is expanded to a fixed column list when the view is
-- created, and never re-expanded afterwards. The extraction service's migration
-- (book-keepping 0008_urgency_columns) added five columns to invoices -- urgency, days_until_due,
-- early_payment_deadline, early_payment_discount_percent, early_payment_discount_amount -- and the
-- view kept serving its frozen 89-column list. Measured on the live project before this migration:
-- invoices had 91 columns, v_open_items 89, and none of the five were reachable through it.
--
-- `create or replace view` cannot do this: replacing a view may only APPEND columns, and the star
-- expands the new ones in the middle of the list (they sit among the invoice columns, not after
-- matched_sum/is_covered/is_open). So the view is dropped and rebuilt.
--
-- The body below is copied verbatim from 20260819210000_open_items_view.sql. Nothing about the
-- logic changes: same coverage rule, same open_blocker cases, same filters, same security_invoker.
-- Only the frozen column list is refreshed.
--
-- NOTE FOR THE NEXT PERSON: any future column added to invoices needs this republish again, or it
-- will be invisible to Offene Posten and the overview while looking perfectly present on the table.

drop view if exists public.v_open_items;

create view public.v_open_items
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

-- The index the early-payment deadline is filtered and sorted on. Partial, like its due_date
-- sibling: a settled or deleted invoice can never be an open discount opportunity.
create index if not exists idx_invoices_early_payment_deadline
  on public.invoices (early_payment_deadline)
  where deleted_at is null and paid_at is null and early_payment_deadline is not null;
