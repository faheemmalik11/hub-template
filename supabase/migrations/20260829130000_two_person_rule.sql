-- Two-person rule: whoever approves an invoice may not be the one who pays it.
--
-- Three parts, in the order they depend on each other:
--   1. invoices.approved_by  -- who gave the final approval. Without it there is nothing to
--      compare the payer against; invoice_history records it in a jsonb text field, which is an
--      audit trail, not a key.
--   2. can_approve / can_pay become the real gate. They have existed since 20260812150000 and the
--      Team screen writes them, but no code has ever read them: the payment gate is the coarse
--      role, so an Admin is trusted with everything by definition and cannot be denied payment.
--      That is what makes the rule unenforceable today -- Saskia is an Admin.
--   3. The payment_orders INSERT policy requires can_pay and refuses the approver.
--
-- THE BACKFILL IS LOAD-BEARING. Both columns default to false and are false for all 8 users, so
-- switching the gate to them without a backfill locks every person out of approving and paying on
-- the next deploy. The backfill reproduces exactly today's effective permissions -- can_pay for the
-- roles requirePaymentRole already accepts, can_approve for everyone wired into the approval chain
-- -- so behaviour on the day this lands is unchanged and every later change is a deliberate one
-- made on the Team screen.

begin;

alter table public.invoices
  add column if not exists approved_by uuid references public.app_users(id) on delete set null;

comment on column public.invoices.approved_by is
  'The app_user who moved this invoice to freigegeben_vorgesetzter. Cleared whenever the invoice '
  'leaves that state (query, rejection, failed payment), so it never names someone whose approval '
  'has since been withdrawn. Read by payment-initiate to refuse a payer who is also the approver.';

create index if not exists idx_invoices_approved_by
  on public.invoices (approved_by)
  where approved_by is not null;

-- EVERYTHING BELOW IS GUARDED ON app_users.can_pay STILL EXISTING.
--
-- On the Stäy database it does not. The columns were dropped out-of-band on 2026-08-28 -- the
-- accident that 20260829190000_drop_legacy_capability_columns.sql documents in its own header --
-- and the permission model that replaced them (user_permissions, has_permission()) was applied by
-- hand at the same time. So this migration is being re-run against a schema that has already moved
-- past it, and the unguarded backfill failed on `column u.can_pay does not exist`, which stopped
-- the whole push.
--
-- Skipping is correct rather than merely convenient: every statement in here is superseded two
-- migrations later by 20260829150000_permissions_model.sql, which drops current_can_pay() outright
-- and rewrites payment_orders_insert to ask has_permission('invoices.pay') instead. The durable
-- part of this file -- invoices.approved_by, its index and its comment, which the two-person rule
-- actually needs -- has already run above and is unconditional.
--
-- On a fresh project the columns do exist, the guard passes, and this runs exactly as written.
do $guard$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'can_pay'
  ) then
    raise notice 'app_users.can_pay is gone; skipping the capability backfill and current_can_pay(). The permission model in 20260829150000 supersedes them.';
    return;
  end if;

  -- Preserve today's behaviour. See the header: without this the new gate denies everyone.
  update public.app_users u
     set can_pay = true
    from public.roles r
   where r.id = u.role_id
     and r.name in ('supervisor', 'admin', 'super_admin')
     and u.can_pay = false;

  update public.app_users u
     set can_approve = true
   where u.can_approve = false
     and exists (
       select 1 from public.approvers a
        where a.is_active
          and (a.app_user_id = u.id or lower(a.name) = lower(coalesce(u.name, '')))
     );

  -- Admins are trusted with both by role today (isForcedByRole in the Team screen draws their
  -- switches on and disabled). Once these columns decide, that forcing has to be a real stored
  -- value an admin can then turn OFF -- otherwise the one role most likely to hold the bank access
  -- can never be excluded from paying, and the rule cannot be applied to the person it is about.
  update public.app_users u
     set can_book = true, can_approve = true, can_pay = true
    from public.roles r
   where r.id = u.role_id
     and r.name in ('admin', 'super_admin')
     and not (u.can_book and u.can_approve and u.can_pay);

  execute $fn$
    create or replace function public.current_can_pay()
    returns boolean
    language sql
    stable
    security definer
    set search_path to 'public'
    as $body$
      select coalesce(
        (select u.can_pay
           from public.app_users u
          where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
            and u.is_active
          limit 1),
        false);
    $body$;
  $fn$;

  revoke execute on function public.current_can_pay() from public, anon;
  grant execute on function public.current_can_pay() to authenticated;

  -- The database half of the rule. payment-initiate enforces it too and returns a readable error;
  -- this is the boundary that holds even if someone calls PostgREST directly.
  execute $pol$
    drop policy if exists payment_orders_insert on public.payment_orders;
  $pol$;
  execute $pol$
    create policy payment_orders_insert on public.payment_orders
      for insert to authenticated
      with check (
        has_company_access(company_id)
        and public.current_can_pay()
        and not exists (
          select 1
            from public.invoices i
            join public.app_users u on u.id = i.approved_by
           where i.id = payment_orders.invoice_id
             and lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      );
  $pol$;
end
$guard$;

commit;
