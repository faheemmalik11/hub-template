-- Enforce the invoice capabilities at the DATA layer, not only in the UI.
--
-- WHAT WAS WRONG. `invoices_update` was `using (true) with check (true)` -- the write-side gap
-- docs/ROLES_AND_ACCESS.md §3 item 3 has carried since migration 0046. Every capability except
-- payment was therefore advisory: the permission model hid the buttons, and PostgREST accepted the
-- write anyway. Demonstrated live before this migration, as Petra (holds `invoices.approve` only):
--
--   update invoices set workflow_status='freigegeben_vorgesetzter' ...  -> UPDATE 1
--   update invoices set paid_at=now() ...                               -> UPDATE 1
--
-- She set the payable state and marked an invoice paid, holding neither `invoices.approve_final`
-- nor `invoices.pay`. Only `payment_orders` was actually protected, because that table's own INSERT
-- policy carries a permission clause.
--
-- TWO PARTS.
--   1. The row filter: company scoping on UPDATE, mirroring the SELECT policy. `has_company_access`
--      returns true for a NULL company, so the intake flow (assigning a company to an unassigned
--      receipt -- the case migration 0046 deferred this for) still works: the old row passes USING
--      because it has no company, the new row passes WITH CHECK if the caller can see the company
--      they picked.
--   2. The transition guard: which permission each state change needs. A row filter cannot express
--      this -- it is about WHICH columns changed and to what, not which rows are visible.
--
-- SERVICE ROLE IS EXEMPT, BY DESIGN. The ingestion pipeline, the Edge Functions and the cron jobs
-- all write with the service-role key and carry no JWT. RLS does not apply to them either. The
-- guard therefore returns early when no caller email resolves, rather than blocking every
-- background write -- those paths do their own authorization (payment-initiate checks
-- `invoices.pay` and the two-person rule itself before it ever writes).
--
-- 'bezahlt' AND 'uebergeben_datev' are DERIVED states, written by trg_advance_workflow_on_payment
-- and trg_advance_workflow_on_datev_handover in response to paid_at / datev_handed_over_at. Those
-- AFTER triggers issue their own UPDATE, which re-enters this guard under the same session, so both
-- states must be allowed -- but only when their source column is actually set. Allowing them
-- unconditionally would let anyone write workflow_status='bezahlt' with no payment behind it.

begin;

create or replace function public.enforce_invoice_write_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  -- No caller identity: service role, a cron job or the pipeline. See the header.
  if v_email = '' then
    return new;
  end if;

  -- Marking an invoice paid is a money statement, whichever column it is written through.
  if new.paid_at is not null and old.paid_at is null
     and not public.has_permission('invoices.pay') then
    raise exception 'not permitted: marking an invoice paid requires the payment permission'
      using errcode = '42501';
  end if;

  if new.assigned_to is distinct from old.assigned_to
     and not public.has_permission('invoices.assign') then
    raise exception 'not permitted: assigning an invoice requires the assign permission'
      using errcode = '42501';
  end if;

  if new.workflow_status is distinct from old.workflow_status then
    -- The override permission is the escape hatch for correcting a wrong status; it stands in for
    -- any of the checks below, which is exactly what the "Status korrigieren" action is.
    if not public.has_permission('invoices.override_workflow') then
      case new.workflow_status
        -- The state payment unlocks from. The whole point of the final-approval permission.
        when 'freigegeben_vorgesetzter', 'abgeschlossen' then
          if not public.has_permission('invoices.approve_final') then
            raise exception 'not permitted: this status requires the final-approval permission'
              using errcode = '42501';
          end if;
        when 'in_pruefung', 'rueckfrage', 'freigegeben_assistenz', 'abgelehnt', 'nicht_relevant' then
          if not public.has_permission('invoices.approve') then
            raise exception 'not permitted: this status requires the approval permission'
              using errcode = '42501';
          end if;
        -- Derived from their own source column by the two AFTER triggers. Allowed only when that
        -- column is actually set, so nobody can claim the state without the fact behind it.
        when 'bezahlt' then
          if new.paid_at is null then
            raise exception 'not permitted: bezahlt is derived from paid_at, set that instead'
              using errcode = '42501';
          end if;
        when 'uebergeben_datev' then
          if new.datev_handed_over_at is null then
            raise exception 'not permitted: uebergeben_datev is derived from datev_handed_over_at'
              using errcode = '42501';
          end if;
        -- Resetting to the start of the chain is a correction, not a step.
        else
          raise exception 'not permitted: setting this status requires the override permission'
            using errcode = '42501';
      end case;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_invoice_write_permissions on public.invoices;
create trigger trg_enforce_invoice_write_permissions
  before update on public.invoices
  for each row execute function public.enforce_invoice_write_permissions();

-- Company scoping on writes, mirroring invoices_select.
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update to authenticated
  using (has_company_access(company_id))
  with check (has_company_access(company_id));

commit;
