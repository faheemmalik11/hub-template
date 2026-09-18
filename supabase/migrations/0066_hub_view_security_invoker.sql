-- 0053_view_security_invoker.sql
-- CRITICAL FIX: every view in this project (v_invoices_list, v_invoices_review,
-- v_bank_transactions_list, v_trash) was created without `security_invoker = true`, the
-- Postgres 15+ view option. Without it, a view's underlying-table access runs as the VIEW'S
-- OWNER (here `postgres`, a superuser) for RLS purposes -- NOT as the querying user. Since
-- superusers bypass RLS entirely, every one of these views has been silently ignoring
-- has_company_access() on invoices/bank_transactions since migration 0046 first rewrote those
-- SELECT policies. Real, live user impact confirmed: a real employee (Anja, granted access to
-- exactly one company) saw 102 other-company invoices via v_invoices_review (the exact view
-- src/lib/data/queries.ts's useBelegeListe/useBelegeKanban read from for the Eingangsrechnungen
-- screen) and 1445 other-company bank transactions via v_bank_transactions_list -- i.e. the two
-- most heavily-used screens in the app were not enforcing company scoping at all, contradicting
-- the entire point of Appendix A7 / migration 0046. This was NOT a regression from this branch's
-- work; it predates it and simply was not exercised by a real restricted user until now.
--
-- The underlying `invoices`/`bank_transactions` tables' own RLS is correct (confirmed via direct
-- table queries under a real restricted session) -- only the view layer was bypassing it.
--
-- `security_invoker = true` makes the view evaluate underlying-table permissions AND RLS as the
-- calling user, exactly like querying the base table directly. This is a semantics-preserving fix
-- for every legitimate caller (admin/super_admin still see everything, since they either have no
-- grants recorded -- unrestricted default -- or would need explicit grants to be scoped) and only
-- changes behavior for a user who actually has narrowed company_access grants, which is exactly
-- the case that was broken.
--
-- v_supplier_duplicates is included for consistency even though suppliers is intentionally NOT
-- company-scoped (cross-company master data, `using (true)` policies) -- setting
-- security_invoker there is a no-op today but keeps the convention uniform so a future
-- company-scoped view doesn't have to remember to opt in.

begin;

alter view public.v_invoices_list set (security_invoker = true);
alter view public.v_invoices_review set (security_invoker = true);
-- v_bank_transactions_list only ever existed on immonetz's live database -- no migration in
-- any repo creates it, and nothing in src/ or the generated types reads it. Guarded so this
-- migration is correct against a database that has it AND one that never did.
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_bank_transactions_list') then
    execute 'alter view public.v_bank_transactions_list set (security_invoker = true)';
  end if;
end $$;
alter view public.v_trash set (security_invoker = true);
alter view public.v_supplier_duplicates set (security_invoker = true);

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- begin
--   -- Requires a real restricted user_company_access grant to exercise meaningfully; the
--   -- verification for this migration was done live against real data (Anja, granted exactly
--   -- one company) rather than a synthetic self-check, since the whole point is confirming a
--   -- VIEW now matches what the base table's RLS already does correctly.
--   raise notice 'see docs/ROLES_AND_ACCESS.md for the live verification steps';
-- end $$;
