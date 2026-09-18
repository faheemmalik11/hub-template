-- The chain directory carries the person's role.
--
-- WHY. Every picker that names a person names their role beside it -- the approval-rule steps, the
-- deputy select on Team & Rollen -- because "Petra Kistner" alone does not tell you whether picking
-- her produces a working chain. Two pickers could not: "Acting as" and "Zugewiesen an" on the
-- invoice screen, which read chain_people() rather than the admin-only employee list.
--
-- It also lets those two EXCLUDE the owner account. The super admin is technical and is never a
-- step, an assignee or a deputy; the Acting as picker represents it with its own first entry
-- instead, so listing it again among the people was a duplicate of the option above it.
--
-- THE WIDENING, STATED PLAINLY. 20260901160200 justified this function as "exactly the columns
-- approvers already exposed, and nothing else", and approvers exposed only its own coarse
-- assistant/manager tier, not the real app role. This goes one column past that: every signed-in
-- account can now see who is an Administrator. That is a deliberate trade -- the alternative was
-- for the two pickers to show roles to admins and bare names to everybody else, from two different
-- data paths, which is worse to read and worse to maintain. It is a name-and-job-title directory,
-- not company-scoped data. Email, company access and the permission set stay out.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.routines
     where routine_schema = 'public' and routine_name = 'chain_people'
  ) then
    raise exception 'preconditions failed: chain_people() is missing, apply 20260901160200 first';
  end if;
end $$;

-- Return type changes, so the old signature has to go first: CREATE OR REPLACE cannot alter the
-- OUT columns of an existing function.
drop function if exists public.chain_people();

create function public.chain_people()
returns table (
  id               uuid,
  name             text,
  role_name        text,
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
         r.name as role_name,
         u.is_active,
         u.escalation_days,
         u.deputy_user_id,
         u.area,
         u.covers_all_areas
    from public.app_users u
    left join public.roles r on r.id = u.role_id
   order by u.name nulls last;
$$;

comment on function public.chain_people() is
  'The approval-chain directory: who can be a step in a rule, who deputises for whom, who owns '
  'which area, and what each person''s role is. Readable by any signed-in account because the '
  'invoice list, the overdue warnings and the assignment picker all name these people to everyone. '
  'SECURITY DEFINER so it can see past app_users_admin_read; it returns a fixed column list, so '
  'widening it is a deliberate edit here rather than a consequence of adding a column to app_users. '
  'Deliberately excludes email, company access and the permission set.';

revoke execute on function public.chain_people() from public, anon;
grant execute on function public.chain_people() to authenticated;

do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.chain_people() p
   where p.role_name is null and p.is_active;
  if v_count > 0 then
    raise notice '% active account(s) have no role and will render without one in the pickers', v_count;
  end if;
  raise notice 'self-checks passed';
end $$;

commit;
