-- Approvers gain the soft-delete trio and join the Papierkorb.
--
-- Ported from immonetz (migrations 20260813090000 + 20260813100000, folded into one here since
-- staeyhub starts from a clean state and does not need the follow-up correction those two split
-- across). Adapted to this project's schema: 12 trash-eligible tables, not 13 (no `business_line`),
-- and approval_rules has TWO approver steps, not three.
--
-- Until now an approver could only be deactivated (is_active = false), never removed: the row
-- stayed in the Freigabe-Regeln list forever. Deactivation and deletion are different intents
-- ("they are away" vs "this entry was a mistake / this person has left"), and every other
-- rules-style table here already carries deleted_at/deleted_by/delete_reason and appears in
-- v_trash.

alter table public.approvers
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    text,
  add column if not exists delete_reason text;

-- Partial index: every read path filters `deleted_at is null` and deleted rows are the rare
-- minority, so indexing only those keeps v_trash's scan cheap without paying for the common case.
create index if not exists approvers_deleted_at_idx
  on public.approvers (deleted_at)
  where deleted_at is not null;

-- restore_record() gates on this allowlist, so an approver is not restorable until it appears
-- here. `set search_path` added while redefining: it was missing on this function (immonetz's
-- copy has it), and an IMMUTABLE SQL function resolving unqualified names through a caller-
-- controlled search_path is worth closing off.
create or replace function public.trash_eligible_tables()
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select array[
    'invoices', 'suppliers', 'customers', 'outgoing_invoices', 'manual_bookings',
    'approval_rules', 'assignment_rules', 'ingest_exclusions', 'opos_whitelist_rules',
    'bwa_categories', 'properties', 'companies', 'approvers'
  ];
$function$;

-- An approver may be TRASHED and RESTORED, but never hard-purged, so purge eligibility becomes an
-- explicit exclusion list rather than "everything except invoices". `approvers.name` is the target
-- of three foreign keys here (approval_rules_step_1/2_approver_fkey, NO ACTION, so purging a named
-- approver fails with a raw FK error) and of approvers_deputy_name_fkey (ON DELETE SET NULL, so
-- purging somebody used as a deputy SUCCEEDS and silently blanks that deputy — quiet data loss,
-- and exactly the stranded reference soft delete exists to prevent).
create or replace function public.trash_purge_eligible_tables()
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select array(
    select t from unnest(public.trash_eligible_tables()) as t
    where t not in ('invoices', 'approvers')
  );
$function$;

-- v_trash gains the approvers branch, restated in full because CREATE OR REPLACE VIEW replaces the
-- whole query body.
--
-- `with (security_invoker = true)` IS NOT OPTIONAL. Postgres replaces a view's reloptions wholesale
-- on CREATE OR REPLACE VIEW, so omitting the clause silently CLEARS the setting this view already
-- carries and reverts it to running as its owner. v_trash is granted to `authenticated`, so that
-- would hand any logged-in user every soft-deleted invoice/company/property regardless of their
-- access grants. This exact regression was shipped on immonetz and caught in review; keep the
-- clause on every future redefinition.
create or replace view public.v_trash with (security_invoker = true) as
  select 'invoices'::text as table_name, id,
         coalesce(issuer, invoice_number, id::text) as label,
         deleted_at, deleted_by, delete_reason
    from public.invoices where deleted_at is not null
  union all
  select 'suppliers'::text, id, name, deleted_at, deleted_by, delete_reason
    from public.suppliers where deleted_at is not null
  union all
  select 'customers'::text, id, name, deleted_at, deleted_by, delete_reason
    from public.customers where deleted_at is not null
  union all
  select 'outgoing_invoices'::text, id, coalesce(voucher_number, id::text),
         deleted_at, deleted_by, delete_reason
    from public.outgoing_invoices where deleted_at is not null
  union all
  select 'manual_bookings'::text, id, coalesce(note, id::text),
         deleted_at, deleted_by, delete_reason
    from public.manual_bookings where deleted_at is not null
  union all
  select 'approval_rules'::text, id, coalesce(note, id::text),
         deleted_at, deleted_by, delete_reason
    from public.approval_rules where deleted_at is not null
  union all
  select 'assignment_rules'::text, id, coalesce(note, id::text),
         deleted_at, deleted_by, delete_reason
    from public.assignment_rules where deleted_at is not null
  union all
  select 'ingest_exclusions'::text, id, term, deleted_at, deleted_by, delete_reason
    from public.ingest_exclusions where deleted_at is not null
  union all
  select 'opos_whitelist_rules'::text, id, term, deleted_at, deleted_by, delete_reason
    from public.opos_whitelist_rules where deleted_at is not null
  union all
  select 'bwa_categories'::text, id, code, deleted_at, deleted_by, delete_reason
    from public.bwa_categories where deleted_at is not null
  union all
  select 'properties'::text, id, coalesce(name, code), deleted_at, deleted_by, delete_reason
    from public.properties where deleted_at is not null
  union all
  select 'companies'::text, id, name, deleted_at, deleted_by, delete_reason
    from public.companies where deleted_at is not null
  union all
  select 'approvers'::text, id, name, deleted_at, deleted_by, delete_reason
    from public.approvers where deleted_at is not null;

-- No new RLS policy needed: a soft delete is an UPDATE, covered by the existing approvers update
-- policy, and the hard purge runs inside purge_record(), which is SECURITY DEFINER.
