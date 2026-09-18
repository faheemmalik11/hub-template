-- 20260817210000_master_data_totals_views.sql
-- Finish moving per-row list totals into Postgres. Companion to
-- 20260817170000_company_invoice_totals_view.sql, which did the same for Gesellschaften.
--
-- Three more lists compute their numbers by downloading every invoice in the system and grouping it
-- in the browser:
--
--   Lieferanten  useBelege()            -> sum + count per supplier_id
--   Objekte      useBelege()            -> sum + count per property_id
--   Kunden       useOutgoingInvoices()  -> sum + count + overdue count per customer_id
--
-- Measured on Stäy: 417 invoice rows transferred to render a 196-row supplier list, of which every
-- field except an id and an amount is thrown away. Correct, but it scales with invoice volume rather
-- than with the size of the list being shown.
--
-- Each view below returns one row per entity. As with the company view, the WHERE clauses are exact
-- copies of the client-side filters they replace, because a divergence would make a list and its
-- detail page quote different numbers with nothing to say which is right.
--
--   invoices (Lieferanten, Objekte) -- mirrors useBelege():
--     deleted_at is null, archived_at is null, not_relevant_at is null, status <> 'aufgeteilt'
--
--   outgoing_invoices (Kunden) -- mirrors the Kunden screen's own rules:
--     deleted_at is null
--     voucher_status not in ('voided','draft')    <- zaehltAlsUmsatz(): a cancellation or a draft is
--                                                    not revenue. This is the audit fix that stopped
--                                                    a customer reading 1.750,00 EUR when only
--                                                    1.000,00 EUR was real.
--     overdue = voucher_status 'open' AND due_date < today   <- istUeberfaellig()
--
-- Same deliberate change as the company view: grouping is by id only. The client code also had a
-- `byCode` fallback for rows with no id. There are currently zero such invoices in any of the three
-- Hubs, so no number moves; an unassigned invoice now counts toward no entity rather than toward
-- whichever one happens to share a code string.
--
-- security_invoker = true on all three: without it the view would run as its owner and hand callers
-- totals computed over rows their own RLS policies would not let them read.

begin;

-- Also carries the invoice FREQUENCY the Lieferanten list sorts by (briefing Screen 12: compare
-- suppliers by amount and by how often they invoice). The client computed it from the full invoice
-- rows, which is the only reason that screen needed them at all:
--
--   computeInvoiceFrequency(): dates = document_date of each invoice, ignoring nulls; null when
--   fewer than two remain; otherwise round((last - first) in days / (count - 1)).
--
-- Reproduced exactly here, including "fewer than two DATED invoices means no frequency" -- an
-- invoice with no document_date must not count toward the divisor.
create or replace view public.v_supplier_invoice_totals
with (security_invoker = true) as
  select
    i.supplier_id,
    count(*)                                  as beleg_anzahl,
    coalesce(sum(i.amount_gross), 0)::numeric as beleg_summe,
    case
      when count(*) filter (where i.document_date is not null) >= 2
        then round(
          (max(i.document_date) - min(i.document_date))::numeric
          / (count(*) filter (where i.document_date is not null) - 1)
        )::int
      else null
    end                                       as avg_tage
  from public.invoices i
  where i.supplier_id is not null
    and i.deleted_at is null
    and i.archived_at is null
    and i.not_relevant_at is null
    and i.status <> 'aufgeteilt'
  group by i.supplier_id;

create or replace view public.v_property_invoice_totals
with (security_invoker = true) as
  select
    i.property_id,
    count(*)                                  as beleg_anzahl,
    coalesce(sum(i.amount_gross), 0)::numeric as beleg_summe
  from public.invoices i
  where i.property_id is not null
    and i.deleted_at is null
    and i.archived_at is null
    and i.not_relevant_at is null
    and i.status <> 'aufgeteilt'
  group by i.property_id;

create or replace view public.v_customer_invoice_totals
with (security_invoker = true) as
  select
    o.customer_id,
    count(*)                                  as rechnung_anzahl,
    coalesce(sum(o.amount_gross), 0)::numeric as rechnung_summe,
    count(*) filter (
      where o.voucher_status = 'open' and o.due_date is not null and o.due_date < current_date
    )                                         as ueberfaellig_anzahl
  from public.outgoing_invoices o
  where o.customer_id is not null
    and o.deleted_at is null
    and o.voucher_status not in ('voided', 'draft')
  group by o.customer_id;

grant select on public.v_supplier_invoice_totals to authenticated;
grant select on public.v_property_invoice_totals to authenticated;
grant select on public.v_customer_invoice_totals to authenticated;

commit;

-- Sanity (after applying) -- each view must agree with the query it replaced:
--   select s.name, t.beleg_anzahl, t.beleg_summe
--     from public.suppliers s
--     left join public.v_supplier_invoice_totals t on t.supplier_id = s.id
--    where s.deleted_at is null order by t.beleg_summe desc nulls last limit 5;
--
--   select c.name, t.rechnung_anzahl, t.rechnung_summe, t.ueberfaellig_anzahl
--     from public.customers c
--     left join public.v_customer_invoice_totals t on t.customer_id = c.id
--    where c.deleted_at is null order by c.name;
--
-- Note the overdue count uses current_date, so it is evaluated by Postgres in the database's time
-- zone rather than the browser's. For a daily boundary on a date-only column that is the same answer
-- everywhere the client would have computed it, and it removes the client clock from the result.
