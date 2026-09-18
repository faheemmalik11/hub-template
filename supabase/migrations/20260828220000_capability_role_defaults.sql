-- Capabilities belong in the role defaults too, not only as per-person rows.
--
-- THE BUG THIS FIXES. The first seed put the four capability permissions into `user_permissions`
-- only, because that is where the answer lived (the can_book/can_approve/can_final_approve/can_pay
-- columns). `role_permissions` got the page permissions and nothing else. Effect: an employee
-- created AFTER the migration inherited the pages their role grants and none of the capabilities,
-- so a brand-new supervisor could open Auswertungen but could not approve or pay, while a
-- supervisor who existed on migration day could do both. Verified live before this fix: a fresh
-- supervisor resolved to exactly
-- `opos_whitelist.write, page.auswertungen, page.protokoll, page.bankverbindungen`.
--
-- THE RULE, now consistent: `role_permissions` says what a role means. `user_permissions` exists
-- only to DEVIATE from that, in either direction. A row that merely restates the role default is
-- noise -- worse, it freezes that person's answer, so a later change to what the role means would
-- silently skip them.
--
-- So this migration does two things: give each role its capabilities, then delete the per-person
-- rows that now say nothing the role does not already say. Deviations are kept.
--
-- The role→capability mapping below is the same one the code used to hardcode:
--   approverRoleForEmployeeRole() mapped admin/super_admin/supervisor → 'manager' (final approval),
--   assistant → 'assistant' (approve, but not final);
--   requirePaymentRole accepted supervisor/admin/super_admin.
-- Transcribed here so the behaviour is identical and the mapping is now DATA, editable per role.

begin;

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join lateral (
    select unnest(
      case r.name
        when 'super_admin' then array['invoices.book','invoices.approve','invoices.approve_final','invoices.pay']
        when 'admin'       then array['invoices.book','invoices.approve','invoices.approve_final','invoices.pay']
        when 'supervisor'  then array['invoices.approve','invoices.approve_final','invoices.pay']
        when 'assistant'   then array['invoices.approve']
        else array[]::text[]
      end
    )
  ) as caps(k)
 where exists (select 1 from public.permissions p where p.key = caps.k)
on conflict do nothing;

-- Drop the per-person rows that agree with the role. The super admin is excluded: its rows are
-- protected by guard_super_admin_permissions(), which refuses the delete, and leaving them is
-- harmless since the trigger also forces them true.
delete from public.user_permissions up
 using public.app_users u
  join public.roles r on r.id = u.role_id
 where up.user_id = u.id
   and r.name <> 'super_admin'
   and up.granted = exists (
     select 1 from public.role_permissions rp
      where rp.role_id = u.role_id and rp.permission_key = up.permission_key
   );

commit;
