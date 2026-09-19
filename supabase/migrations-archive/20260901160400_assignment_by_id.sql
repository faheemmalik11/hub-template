-- "Zugewiesen an" points at an account, not a string.
--
-- WHY IT MATTERS MORE THAN IT LOOKS. An assignment is not a label: nextLegalActions() treats it as
-- an ADDED actor -- the assignee may act on that invoice even when the resolved rule names other
-- people. It has been matched by `assigned_to = actingAs.name` since it was introduced, so renaming
-- somebody on Team & Rollen silently revoked every assignment they held, with no error anywhere and
-- nothing on screen to say the invoice had stopped being theirs.
--
-- It is also the escape hatch when a rule names somebody who cannot act (deactivated, gone,
-- permission revoked). That is exactly the case where it must not quietly stop working.
--
-- assigned_to is frozen, not dropped: it is what past assignments actually pointed at, and the
-- 'zuweisung' entries in invoice_history reference those names.
--
-- THE INVERTED CHECK IN THE TRIGGER IS THE TRAP HERE. enforce_invoice_write_permissions() asks
-- "did anything change OUTSIDE the governed set" and calls that receipt content requiring
-- invoices.book. A new column is protected by default, which is the right way round -- and means
-- assigned_user_id MUST join v_ignore, or assigning would silently start requiring the booking
-- permission on top of invoices.assign.

begin;

do $$
begin
  if to_regclass('public.invoices') is null then
    raise exception 'preconditions failed: invoices is missing';
  end if;
  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'enforce_invoice_write_permissions'
  ) then
    raise exception 'preconditions failed: enforce_invoice_write_permissions is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. The column
-- ===========================================================================
alter table public.invoices
  add column if not exists assigned_user_id uuid references public.app_users(id) on delete set null;

comment on column public.invoices.assigned_user_id is
  'Who was handed this receipt explicitly, set on the invoice detail screen by somebody holding '
  'invoices.assign. An assignment ADDS an actor: the assignee may act even when the resolved rule '
  'names other people. Replaces assigned_to, which matched by name.';

-- The bell standing "assigned to you" row reads this per user, on every poll.
create index if not exists invoices_assigned_user_idx
  on public.invoices (assigned_user_id)
  where assigned_user_id is not null and deleted_at is null;

-- ===========================================================================
-- 2. Backfill, through approvers.app_user_id first, then by name
-- ===========================================================================
update public.invoices i
   set assigned_user_id = coalesce(
         i.assigned_user_id,
         (select coalesce(a.app_user_id, u.id)
            from public.approvers a
            left join public.app_users u
              on u.name is not null and lower(u.name) = lower(a.name)
           where lower(a.name) = lower(i.assigned_to)
           limit 1),
         (select u.id
            from public.app_users u
           where u.name is not null and lower(u.name) = lower(i.assigned_to)
           limit 1))
 where i.assigned_to is not null
   and i.assigned_user_id is null;

-- Reported, never fatal. An assignment naming somebody who has since left is a legitimate
-- historical state; freezing it loses nothing, and refusing to migrate over it would be absurd.
do $$
declare v_bad text;
begin
  select string_agg(distinct i.assigned_to, ', ')
    into v_bad
    from public.invoices i
   where i.assigned_to is not null
     and i.assigned_user_id is null
     and i.deleted_at is null;
  if v_bad is not null then
    raise notice 'these assignment names matched no account and stay frozen on assigned_to: %', v_bad;
  end if;
end $$;

comment on column public.invoices.assigned_to is
  'HISTORICAL. Superseded by assigned_user_id. Not written any more; existing values are what past '
  'assignments actually pointed at and are referenced by invoice_history ''zuweisung'' entries.';

-- ===========================================================================
-- 3. The write guard follows the column
-- ===========================================================================
create or replace function public.enforce_invoice_write_permissions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  -- Columns governed by another permission, or written by triggers on every update. Anything NOT
  -- in here counts as receipt content and requires invoices.book -- so a column added later is
  -- protected by default, and a column that is governed elsewhere has to be named here.
  v_ignore constant text[] := array[
    'workflow_status', 'approved_by',
    'paid_at', 'paid_source',
    'assigned_to', 'assigned_user_id',
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

  -- Both columns, so a stray write to the frozen one cannot route around the permission.
  if (new.assigned_user_id is distinct from old.assigned_user_id
      or new.assigned_to is distinct from old.assigned_to)
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

  if (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore)
     and not public.has_permission('invoices.book') then
    raise exception 'not permitted: editing a receipt requires the booking permission'
      using errcode = '42501';
  end if;

  return new;
end
$$;

-- ===========================================================================
-- 4. Self-checks
-- ===========================================================================
do $$
declare v_count int;
begin
  select count(*) into v_count
    from information_schema.columns
   where table_schema = 'public' and table_name = 'invoices' and column_name = 'assigned_user_id';
  if v_count <> 1 then
    raise exception 'self-check failed: invoices.assigned_user_id was not created';
  end if;

  -- The trap named in the header: assigning must not also demand invoices.book.
  if position('assigned_user_id' in pg_get_functiondef(
       'public.enforce_invoice_write_permissions()'::regprocedure)) = 0 then
    raise exception 'self-check failed: the write guard does not mention assigned_user_id';
  end if;

  raise notice 'self-checks passed';
end $$;

commit;
