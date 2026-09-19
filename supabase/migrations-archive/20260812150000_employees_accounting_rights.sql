-- 20260812150000_employees_accounting_rights
--
-- Three itemized accounting capabilities per employee, distinct from the coarse admin/
-- supervisor/assistant role: booking/checking invoices (Buchhaltung), approving them
-- (Freigabe) and marking them paid (Zahlung). Previously the only lever was the 3-tier
-- role, which conflated "can see this screen at all" with "may actually book/approve/pay" --
-- e.g. an assistant who does the bookkeeping had no way to be flagged as such short of a
-- role change that would also hand them approval/admin powers they shouldn't have.
--
-- These are independent of the `approvers` table (Freigabe-Regeln): `approvers` rows are the
-- configured approval chain (who steps in for which area), these columns are "is this person
-- generally trusted with this class of action at all" -- a person can hold can_approve here
-- without being wired into any specific approval rule yet, and vice versa.
--
-- No new RLS policy needed: app_users_admin_update (0059) already covers every column on
-- app_users, gated on is_admin().

begin;

alter table public.app_users
  add column if not exists can_book    boolean not null default false,
  add column if not exists can_approve boolean not null default false,
  add column if not exists can_pay     boolean not null default false;

comment on column public.app_users.can_book is
  'Buchhaltung: may book/check invoices. Independent of role_name and of the approvers table.';
comment on column public.app_users.can_approve is
  'Freigabe: may approve invoices. Independent of role_name and of the approvers table -- '
  'holding this does not by itself add them to any approval_rules chain.';
comment on column public.app_users.can_pay is
  'Zahlung: may mark invoices paid / run payment. Independent of role_name and of '
  'approvers.payment_handler.';

commit;
