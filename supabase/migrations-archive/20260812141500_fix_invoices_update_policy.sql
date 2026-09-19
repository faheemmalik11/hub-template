-- Fix: assigning a company to an invoice shows a success toast but the change never actually
-- lands — confirmed live: the invoices row still shows the OLD company_code even after a hard
-- reload, even though the invoice_history audit-log write for the same save (fixed by
-- 20260812140000) now succeeds. Classic RLS-filtered-UPDATE-with-no-error: Postgres/PostgREST
-- does not raise an error when an UPDATE's RLS policy filters it down to zero matching rows, it
-- just quietly updates nothing (src/lib/data/queries.ts's useUpdateBeleg does `const { error } =
-- await sb.from("invoices").update(...)`, never checks how many rows were actually affected).
--
-- This is the SAME bug already caught and fixed once for the sibling table outgoing_invoices, in
-- 0065_hub_outgoing_invoices_update_policy.sql ("outgoing_invoices had a SELECT policy... but NO
-- write policy at all... a user deleted an outgoing invoice, got a success toast, but the row was
-- untouched"). That migration's own comment states invoices ALREADY has
-- `for update to authenticated using (true) with check (true)`, matching every other
-- company-scoped table for this pass -- but no tracked migration in this repo ever actually
-- creates that policy on invoices (grepped the full migration history: zero hits). Like
-- has_company_access()/current_app_user_id() before it (documented in 0059 as "applied by hand at
-- some earlier point, not through any tracked migration"), this was very likely a hand-applied,
-- untracked policy that has since silently drifted or been dropped.
--
-- Deliberately unrestricted (matches 0065's precedent for the sibling table, and 0059's own
-- explicit warning): "Screen 3's assign-a-company-to-an-unassigned-invoice flow must not be
-- blocked by the very check that results from that assignment" -- exactly the flow that's broken
-- right now. A company-scoped write check needs per-screen judgment 0059 deliberately deferred,
-- not a blanket has_company_access(company_id) retrofit here.

begin;

drop policy if exists "invoices_update" on public.invoices;
create policy "invoices_update" on public.invoices
  for update to authenticated using (true) with check (true);

commit;
