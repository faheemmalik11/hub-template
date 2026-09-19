-- Match tables: scope the writes to the caller's companies.
--
-- Covers docs/audit/banktransaktionen/bank-transactions/ISSUES.md (the match-table RLS finding).
--
-- NOT MEASURED AGAINST THE LIVE DATABASE. Unlike 20260819130000 / 20260819140000, this file was
-- written without access to pg_policies: the sandbox this pass ran in cannot reach the project.
-- Before applying it, read the live policies and confirm they still look like what the migration
-- files declare:
--
--   select polname, polcmd, pg_get_expr(polqual, polrelid) as qual,
--          pg_get_expr(polwithcheck, polrelid) as with_check
--     from pg_policy
--    where polrelid in ('public.invoice_transaction_matches'::regclass,
--                       'public.outgoing_invoice_transaction_matches'::regclass);
--
-- WHAT THE MIGRATION FILES DECLARE TODAY (0003 here / 0001 in Immonetz, and 0058 / 0045 for the
-- outgoing side): reads and writes alike are `true` for `authenticated`:
--
--   matches_read    SELECT  using (true)
--   matches_insert  INSERT  with check (true)
--   matches_update  UPDATE  using (true) with check (true)
--
-- while the two tables a match POINTS AT are company-scoped (bank_accounts_select /
-- bank_transactions_select, migration 0059 here / 0046 in Immonetz).
--
-- Why that matters: the front end writes these rows directly (useConfirmMatch / useRejectMatch in
-- src/lib/data/queries.ts), and confirming a match is not a bookkeeping note. A trigger syncs
-- bank_transactions.matching_status from it and the invoice's paid state follows, so an
-- authenticated user restricted to one company can mark another company's invoice paid and its
-- transaction reconciled, on rows their own SELECT policies forbid them from reading.
--
-- The fix mirrors what 0059/0046 did for the bank tables: a write is allowed only when the caller
-- has access to BOTH sides of the pair. has_company_access(null) is true by design (the watch-all
-- bucket for records not yet assigned to a company), so an unassigned invoice, or an account with
-- no company, keeps behaving exactly as it does today.
--
-- Additive and idempotent. No DELETE policy is added: a rejection is a status, never a delete.

begin;

do $$
declare
  v_matches regclass := to_regclass('public.invoice_transaction_matches');
begin
  -- Immonetz's migration files still call this table beleg_transaction_matches; the rename lives
  -- outside those files, so accept either name rather than assuming one.
  if v_matches is null then
    v_matches := to_regclass('public.beleg_transaction_matches');
  end if;
  if v_matches is null then
    raise exception 'no invoice_transaction_matches / beleg_transaction_matches table found';
  end if;

  execute format('drop policy if exists "matches_insert" on %s', v_matches);
  execute format($f$
    create policy "matches_insert" on %s
      for insert to authenticated
      with check (
        exists (
          select 1 from public.bank_transactions t
           where t.id = transaction_id and public.has_company_access(t.company_id)
        )
        and exists (
          select 1 from public.invoices i
           where i.id = invoice_id and public.has_company_access(i.company_id)
        )
      )
  $f$, v_matches);

  execute format('drop policy if exists "matches_update" on %s', v_matches);
  execute format($f$
    create policy "matches_update" on %s
      for update to authenticated
      using (
        exists (
          select 1 from public.bank_transactions t
           where t.id = transaction_id and public.has_company_access(t.company_id)
        )
      )
      with check (
        exists (
          select 1 from public.bank_transactions t
           where t.id = transaction_id and public.has_company_access(t.company_id)
        )
      )
  $f$, v_matches);
end $$;

-- The credit side (outgoing invoices), same shape, where that table exists.
do $$
declare
  v_out regclass := to_regclass('public.outgoing_invoice_transaction_matches');
begin
  if v_out is null then
    return;
  end if;

  execute format('drop policy if exists "outgoing_matches_insert" on %s', v_out);
  execute format($f$
    create policy "outgoing_matches_insert" on %s
      for insert to authenticated
      with check (
        exists (
          select 1 from public.bank_transactions t
           where t.id = transaction_id and public.has_company_access(t.company_id)
        )
        and exists (
          select 1 from public.outgoing_invoices o
           where o.id = outgoing_invoice_id and public.has_company_access(o.company_id)
        )
      )
  $f$, v_out);

  execute format('drop policy if exists "outgoing_matches_update" on %s', v_out);
  execute format($f$
    create policy "outgoing_matches_update" on %s
      for update to authenticated
      using (
        exists (
          select 1 from public.bank_transactions t
           where t.id = transaction_id and public.has_company_access(t.company_id)
        )
      )
      with check (
        exists (
          select 1 from public.bank_transactions t
           where t.id = transaction_id and public.has_company_access(t.company_id)
        )
      )
  $f$, v_out);
end $$;

commit;
