-- The chain directory, readable by everyone signed in.
--
-- THE PROBLEM THIS SOLVES. `approvers_read` is `using (true)`: every authenticated account could
-- read the whole approver list, which is what the invoice list's "Verantwortlich" column, the
-- overdue/deputy warnings and the assignment picker are all built on. `app_users_admin_read` is
-- `is_admin() or has_permission('page.team')`. Move the chain onto app_users (20260901160000) and
-- every one of those surfaces goes blank for an ordinary user -- silently, because an empty result
-- from a scoped select is not an error.
--
-- This restores exactly the columns `approvers` already exposed to everyone since 0048, and
-- nothing else. No email, no role, no company grants: the staff directory, not the user table.
--
-- WHY A SECURITY DEFINER FUNCTION AND NOT A VIEW. A view would need `security_invoker = off` to
-- see past app_users' own policy, and §2.1a of docs/ROLES_AND_ACCESS.md records a real leak in this
-- database caused by exactly that: views running as their superuser owner, bypassing RLS on
-- everything underneath. A function is the same safety with the boundary stated in one place, and
-- it does not add another owner-run view for a future reader to have to re-audit.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'deputy_user_id'
  ) then
    raise exception 'preconditions failed: app_users.deputy_user_id is missing, apply 20260901160000 first';
  end if;
end $$;

create or replace function public.chain_people()
returns table (
  id               uuid,
  name             text,
  is_active        boolean,
  escalation_days  int,
  deputy_user_id   uuid,
  area             text,
  covers_all_areas boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         u.name,
         u.is_active,
         u.escalation_days,
         u.deputy_user_id,
         u.area,
         u.covers_all_areas
    from public.app_users u
   order by u.name nulls last;
$$;

comment on function public.chain_people() is
  'The approval-chain directory: who can be a step in a rule, who deputises for whom, and who owns '
  'which area. Readable by any signed-in account because the invoice list, the overdue warnings '
  'and the assignment picker all name these people to everyone -- the same reach approvers_read '
  'had with using(true). SECURITY DEFINER so it can see past app_users_admin_read; it returns a '
  'fixed column list, so widening it is a deliberate edit here rather than a consequence of adding '
  'a column to app_users. Deliberately excludes email, role and company access.';

revoke execute on function public.chain_people() from public, anon;
grant execute on function public.chain_people() to authenticated;

commit;
