-- Make `invoices.book` mean something.
--
-- It has been in the catalogue since the permission model landed and enforced nowhere: grepped
-- across src/ and supabase/, nothing read it. A permission that gates nothing is worse than a
-- missing one — the Team screen offers a switch that changes no behaviour, which is exactly the
-- defect this whole pass has been removing.
--
-- WHAT IT NOW GATES. Appendix A7 defines the assistant as "capture receipts, check, assign, set
-- notes" — editing the CONTENT of a receipt. So: any change to an invoice column that is not
-- already governed by another permission requires `invoices.book`.
--
-- WHY THE CHECK IS INVERTED. Listing every content column would be a list to forget to update the
-- next time a column is added — and a forgotten column silently means "not protected". Instead the
-- guard names the columns governed elsewhere and asks whether anything ELSE changed:
--
--   workflow_status, approved_by       -> invoices.approve / approve_final (same trigger, above)
--   paid_at, paid_source               -> invoices.pay
--   assigned_to                        -> invoices.assign
--   datev_handed_over_at               -> derived, DATEV handover writes it server-side
--   updated_at, fts, embedding, ...    -> written by triggers on every update, never by a person
--
-- Anything outside that set is receipt content. A new column is therefore protected by default,
-- which is the right way round.
--
-- NOT CHANGED HERE: soft delete. `deleted_at`/`deleted_by`/`delete_reason` are excluded, so who may
-- delete a receipt is exactly what it was. Deletion has no permission key today; giving it one is a
-- separate decision, not something to slip in under "booking".
--
-- BEHAVIOUR CHANGE, STATED PLAINLY: `invoices.book` is granted to admin, super_admin and assistant
-- — NOT supervisor, whose A7 definition is "approve what is assigned to them", not booking. So
-- Alexis and Lukas can no longer edit receipt fields unless an admin ticks the box for them on
-- Team & Rollen. Neither has ever signed in, so nothing in flight breaks, but it is a real
-- narrowing and should be a deliberate choice rather than a surprise.

begin;

create or replace function public.enforce_invoice_write_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Columns governed by another permission, or written by triggers on every update.
  v_ignore constant text[] := array[
    'workflow_status', 'approved_by',
    'paid_at', 'paid_source',
    'assigned_to',
    'datev_handed_over_at',
    -- Deletion has no permission of its own today, and inventing one here would narrow who may
    -- delete without that being asked for. Left exactly as it was; worth a key of its own later.
    'deleted_at', 'deleted_by', 'delete_reason',
    'updated_at', 'fts', 'embedding'
  ];
begin
  -- No caller identity: service role, a cron job or the pipeline. They authorize themselves.
  if v_email = '' then
    return new;
  end if;

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
    if not public.has_permission('invoices.override_workflow') then
      case new.workflow_status
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
        else
          raise exception 'not permitted: setting this status requires the override permission'
            using errcode = '42501';
      end case;
    end if;
  end if;

  -- Everything else on the row is receipt content. Compared as jsonb minus the governed columns,
  -- so a column added later is covered without editing this function.
  if (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore)
     and not public.has_permission('invoices.book') then
    raise exception 'not permitted: editing a receipt requires the booking permission'
      using errcode = '42501';
  end if;

  return new;
end
$$;

commit;
