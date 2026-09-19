-- Capabilities decide what a person may do. The role name no longer does.
--
-- 20260828180000 made can_approve/can_pay real, but two hardcoded role strings still overrode them:
--
--   format.ts   actingAs.role === "manager" ? "freigegeben_vorgesetzter" : "freigegeben_assistenz"
--   payment-auth.ts   role in ('supervisor','admin','super_admin')
--
-- So an Assistant with the Payment switch ON still could not pay, and only a "manager" could give
-- the final approval no matter what was switched on. The switches told one story and the code
-- another, which is the same defect this pair of migrations exists to remove -- changing who
-- approves or pays should be an admin action on Team & Rollen, never a deploy.
--
-- can_final_approve is the fourth capability: can_approve says a person may act in the chain at
-- all, this says their approval is the FINAL one -- the state that unlocks payment. Splitting them
-- is what lets Petra (today an Assistant) be the final approver without being handed a role that
-- also grants her admin screens.

begin;

alter table public.app_users
  add column if not exists can_final_approve boolean not null default false;

comment on column public.app_users.can_final_approve is
  'Freigabe (final): this person''s approval moves an invoice to freigegeben_vorgesetzter, the '
  'state payment unlocks from. Without it an approval lands on freigegeben_assistenz. Independent '
  'of role_name -- the role decides which screens someone sees, capabilities decide what they may do.';

-- Preserve today's behaviour exactly: 'manager' was the tier that gave the final approval, and it
-- is derived from AppRole by approverRoleForEmployeeRole() as admin/super_admin/supervisor.
update public.app_users u
   set can_final_approve = true
  from public.roles r
 where r.id = u.role_id
   and r.name in ('supervisor', 'admin', 'super_admin')
   and u.can_final_approve = false;

-- The super admin is the break-glass account: it must never be able to lock itself out of the
-- chain. Enforced in the database rather than by a disabled switch, for the same reason
-- guard_super_admin_row() exists -- app_users_admin_update has no column restriction, so any admin
-- can PostgREST-update the row directly and a disabled prop is not a boundary.
create or replace function public.guard_super_admin_capabilities()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.roles r where r.id = new.role_id and r.name = 'super_admin') then
    new.can_book := true;
    new.can_approve := true;
    new.can_final_approve := true;
    new.can_pay := true;
  end if;
  return new;
end
$$;

drop trigger if exists app_users_super_admin_capabilities on public.app_users;
create trigger app_users_super_admin_capabilities
  before insert or update on public.app_users
  for each row execute function public.guard_super_admin_capabilities();

update public.app_users u
   set can_final_approve = can_final_approve
  from public.roles r
 where r.id = u.role_id and r.name = 'super_admin';

commit;
