-- enforce_invoice_write_permissions() checked three permission keys that were never seeded into
-- the catalogue: invoices.pay, invoices.assign and invoices.book. A key with no row in
-- public.permissions can never be granted to any role, so has_permission() returned false for
-- every one of the three checks, for every user, including an administering role. In practice this
-- blocked all three: marking an invoice paid, assigning it to someone, and any other edit (the
-- onboarding practice task's "correct amount" and "assign company/property" steps are an instance
-- of the third). Paste into the Supabase SQL editor as the database owner; safe to run twice.
--
-- The fix replaces the three missing keys with ones the catalogue already has: payments.write
-- ("Create a transfer from an approved document") for marking paid, and documents.write ("Correct
-- fields, set notes, assign a document") for both the assign check and the general edit check.
-- Nobody gains a capability they did not already have under those two keys; this only makes the
-- existing checks resolvable at all.

begin;

CREATE OR REPLACE FUNCTION public.enforce_invoice_write_permissions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Columns governed by another permission, or written by triggers on every update. Anything NOT
  -- in here counts as receipt content and requires documents.write -- so a column added later is
  -- protected by default, and a column that is governed elsewhere has to be named here.
  v_ignore constant text[] := array[
    'workflow_status', 'approved_by',
    'paid_at', 'paid_source',
    'assigned_to', 'assigned_user_id',
    'handed_over_at',
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
     and not public.has_permission('payments.write') then
    raise exception 'not permitted: marking an invoice paid requires the payment permission'
      using errcode = '42501';
  end if;

  -- Both columns, so a stray write to the frozen one cannot route around the permission.
  if (new.assigned_user_id is distinct from old.assigned_user_id
      or new.assigned_to is distinct from old.assigned_to)
     and not public.has_permission('documents.write') then
    raise exception 'not permitted: assigning an invoice requires the assign permission'
      using errcode = '42501';
  end if;

  if new.workflow_status is distinct from old.workflow_status then
    if not public.has_permission('invoices.override_workflow') then
      case new.workflow_status
        when 'approved_final', 'closed' then
          if not public.has_permission('invoices.approve_final') then
            raise exception 'not permitted: this status requires the final-approval permission'
              using errcode = '42501';
          end if;
        when 'in_review', 'query', 'approved_first', 'rejected', 'not_relevant' then
          if not public.has_permission('invoices.approve') then
            raise exception 'not permitted: this status requires the approval permission'
              using errcode = '42501';
          end if;
        when 'paid' then
          if new.paid_at is null then
            raise exception 'not permitted: bezahlt is derived from paid_at, set that instead'
              using errcode = '42501';
          end if;
        when 'handed_over' then
          if new.handed_over_at is null then
            raise exception 'not permitted: uebergeben_datev is derived from handed_over_at'
              using errcode = '42501';
          end if;
        else
          raise exception 'not permitted: setting this status requires the override permission'
            using errcode = '42501';
      end case;
    end if;
  end if;

  if (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore)
     and not public.has_permission('documents.write') then
    raise exception 'not permitted: editing a receipt requires the booking permission'
      using errcode = '42501';
  end if;

  return new;
end
$$;


commit;
