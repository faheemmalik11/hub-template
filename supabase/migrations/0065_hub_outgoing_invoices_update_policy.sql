-- 0052_outgoing_invoices_update_policy.sql
-- outgoing_invoices had a SELECT policy (has_company_access) but NO write policy at all -- not
-- even the wide-open "authenticated can write" convention every comparable company-scoped table
-- already has (invoices, manual_bookings, customers, approval_rules all have
-- `for update to authenticated using (true) with check (true)`, per migration 0046's own
-- disclosed note that write-side RLS is deliberately left open for this pass). Nothing wrote to
-- outgoing_invoices directly from the client until useSoftDeleteOutgoingInvoice (this branch),
-- so the gap was never exercised. Caught live: a user deleted an outgoing invoice, got a success
-- toast, but the row was untouched -- RLS silently filtered the UPDATE to 0 affected rows (no
-- error is thrown for an RLS-filtered UPDATE with no matching rows), so it stayed off the trash
-- view too, since deleted_at was never actually set.
--
-- Matches the exact policy shape already used on every sibling table -- no narrower scoping than
-- the rest of the codebase already has for this pass.

begin;

drop policy if exists "outgoing_invoices_update" on public.outgoing_invoices;
create policy "outgoing_invoices_update" on public.outgoing_invoices
  for update to authenticated using (true) with check (true);

commit;
