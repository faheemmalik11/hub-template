-- 0047_trash_view.sql
-- Unified trash view (Briefing Screen 18) over every soft-delete-capable table that also has a
-- real user-facing delete action (same allow-list as restore_record/purge_record, migration
-- 0046). A plain view, NOT security definer -- each column's visibility keeps following its own
-- table's RLS for whoever queries it (an admin's "no grants = unrestricted" already covers the
-- Team/Trash screen use case; no extra enforcement needed here).

begin;

create or replace view public.v_trash as
  select 'invoices' as table_name, id, coalesce(issuer, invoice_number, id::text) as label,
         deleted_at, deleted_by, delete_reason
    from public.invoices where deleted_at is not null
  union all
  select 'suppliers', id, name, deleted_at, deleted_by, delete_reason
    from public.suppliers where deleted_at is not null
  union all
  select 'customers', id, name, deleted_at, deleted_by, delete_reason
    from public.customers where deleted_at is not null
  union all
  select 'outgoing_invoices', id, coalesce(voucher_number, id::text), deleted_at, deleted_by, delete_reason
    from public.outgoing_invoices where deleted_at is not null
  union all
  select 'manual_bookings', id, coalesce(note, id::text), deleted_at, deleted_by, delete_reason
    from public.manual_bookings where deleted_at is not null
  union all
  select 'approval_rules', id, coalesce(note, id::text), deleted_at, deleted_by, delete_reason
    from public.approval_rules where deleted_at is not null
  union all
  select 'assignment_rules', id, coalesce(note, id::text), deleted_at, deleted_by, delete_reason
    from public.assignment_rules where deleted_at is not null
  union all
  select 'ingest_exclusions', id, term, deleted_at, deleted_by, delete_reason
    from public.ingest_exclusions where deleted_at is not null
  union all
  select 'opos_whitelist_rules', id, term, deleted_at, deleted_by, delete_reason
    from public.opos_whitelist_rules where deleted_at is not null
  union all
  select 'bwa_categories', id, code, deleted_at, deleted_by, delete_reason
    from public.bwa_categories where deleted_at is not null
  union all
  select 'properties', id, coalesce(name, code), deleted_at, deleted_by, delete_reason
    from public.properties where deleted_at is not null
  union all
  select 'companies', id, name, deleted_at, deleted_by, delete_reason
    from public.companies where deleted_at is not null
  union all
  select 'business_line', id, name, deleted_at, deleted_by, delete_reason
    from public.business_line where deleted_at is not null;

comment on view public.v_trash is
  'Unified read model for the Papierkorb screen (Briefing Screen 18): every soft-deleted row '
  'across the tables restore_record()/purge_record() (migration 0046) know how to handle, '
  'normalized to (table_name, id, label, deleted_at, deleted_by, delete_reason).';

grant select on public.v_trash to authenticated;

commit;
