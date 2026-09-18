-- 0020_hide_split_containers — keep the split-scan CONTAINER row out of the invoice lists.
--
-- THE BUG: a scan holding several receipts produces N+1 rows, not N. Task 03 splits the PDF into one
-- child invoice per receipt AND keeps a parent row (status='aufgeteilt', document_type='Sammelscan')
-- that holds the full original as the GoBD audit anchor. The parent is not an invoice — it has no
-- issuer, no amount, no date — but nothing filtered it out, so it showed up in the incoming-invoice
-- list as a third entry with everything empty, counted in the KPI tiles, and (via useBelege) sat in
-- Offene Posten as an unpaid invoice with no amount.
--
-- Observed: a 2-receipt scan produced 3 rows — children pages '1-1' (16.71) and '2-2' (109.98), both
-- correct, plus the empty container, which then had to be deleted by hand.
--
-- THE FIX is presentational, not structural: the parent row and its original file STAY (that is the
-- audit trail Task 03 deliberately added, and migration 0009's source_document_id/page_range link the
-- parts to it). It is simply no longer presented as an invoice. One predicate on v_invoices_list
-- covers all three server-side readers, because invoices_kpis() and invoices_facets() (migration 0010)
-- both select FROM that view.
--
-- The child rows are untouched and each still carries its own carved PDF, so day-to-day work is
-- unaffected; the full original stays reachable from any child via source_document_id (the Hub now
-- offers it on the child's detail page).
--
-- `is distinct from` and NOT `<>`: with `status <> 'aufgeteilt'` a row whose status is NULL evaluates
-- to NULL and would be silently dropped from every list — the opposite of the "no silent loss" rule.
--
-- The view is patched via pg_get_viewdef rather than retyped, because its review_score expression is
-- long and transcribing it by hand risks changing the review ordering. The DO block asserts the shape
-- it expects and refuses to guess if the view has changed. Idempotent.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0020_hide_split_containers.sql

begin;

do $$
declare
  v_def text;
begin
  select pg_get_viewdef('public.v_invoices_list'::regclass, true) into v_def;

  if position('aufgeteilt' in v_def) > 0 then
    raise notice '0020: v_invoices_list already excludes container rows — nothing to do.';
    return;
  end if;

  -- Only ever seen as the final line (0008 created it, 0010 left it alone). If that is no longer
  -- true, stop: a blind patch could silently widen or narrow the list.
  if position('WHERE b.deleted_at IS NULL;' in v_def) = 0 then
    raise exception '0020: unexpected v_invoices_list shape — expected it to end in '
                    '"WHERE b.deleted_at IS NULL;". Refusing to patch blindly; add the '
                    'predicate "and b.status is distinct from ''aufgeteilt''" by hand.';
  end if;

  v_def := replace(
    v_def,
    'WHERE b.deleted_at IS NULL;',
    'WHERE b.deleted_at IS NULL AND b.status IS DISTINCT FROM ''aufgeteilt'';'
  );

  -- security_invoker is re-stated because 0008 created the view with it; CREATE OR REPLACE would
  -- otherwise fall back to the default and run the view as its owner.
  execute 'create or replace view public.v_invoices_list with (security_invoker = on) as ' || v_def;
end $$;

comment on view public.v_invoices_list is
  'Invoice list for the Hub (+ invoices_kpis / invoices_facets). Excludes soft-deleted rows and the '
  'split-scan CONTAINER rows (status=''aufgeteilt''), which hold the original of a multi-receipt scan '
  'for the audit trail but are not invoices themselves — their children are (see 0009 '
  'source_document_id / page_range).';

commit;

-- Sanity:
--   -- the container must NOT be listed, its children must be:
--   select id, status, page_range from v_invoices_list where source ilike '%<scan filename>%';
--   -- but the row itself is still there, with its original file:
--   select i.status, f.role, octet_length(f.content)
--     from invoices i join invoice_files f on f.invoice_id = i.id
--    where i.status = 'aufgeteilt';
--   -- and a NULL-status invoice is still listed (the is-distinct-from guard):
--   select count(*) from v_invoices_list where status is null;
