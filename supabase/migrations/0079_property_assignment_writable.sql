-- 0079_property_assignment_writable — let admins maintain property → company → business line.
--
-- WHY: property_assignment is the authoritative answer to "which company does this receipt belong
-- to", and the VAT treatment follows the business line. But it has only a SELECT policy — immonetz
-- wrote it exclusively from their Python pipeline via service_role, so no human could ever create
-- an assignment through the app.
--
-- Stäy has no such pipeline, and the client's own proposal is that the customer maintains this:
-- "make customer upload properties through stayhub and ask them to which company it belongs at
-- form submission, or notify them afterwards that they need to connect this property to a
-- company". That is also exactly how immonetz filled the table in practice — no migration ever
-- seeded it. So the data has to be enterable in the UI.
--
-- Admin-only, matching every other master-data write in this schema (companies, properties).
-- Assigning a property to the wrong company puts receipts in the wrong books with the wrong VAT.

begin;

drop policy if exists property_assignment_admin_insert on public.property_assignment;
create policy property_assignment_admin_insert on public.property_assignment
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists property_assignment_admin_update on public.property_assignment;
create policy property_assignment_admin_update on public.property_assignment
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy on purpose. The table carries deleted_at/deleted_by/delete_reason, and an
-- assignment is audit-relevant: it explains which company a past receipt was booked to. Removing
-- the row would erase that explanation, so "removing" an assignment is a soft delete via UPDATE.
comment on table public.property_assignment is
  'property × business line → company. Authoritative for resolving a receipt''s company; the VAT '
  'treatment follows the business line. Admin-writable from /objekte; soft-delete only, because a '
  'past assignment explains how earlier receipts were booked.';

-- Reading assignments per property is the common query on the property screen and on invoice
-- detail; without this it is a sequential scan once the table grows.
create index if not exists property_assignment_property_idx
  on public.property_assignment (property_id) where deleted_at is null;

commit;
