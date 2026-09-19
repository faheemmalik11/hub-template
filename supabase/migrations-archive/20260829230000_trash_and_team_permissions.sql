-- Close the last two places where a permission switch could lie.
--
-- Both were UI-gated on a permission while the thing underneath still tested `is_admin()`. Granting
-- either to a non-admin opened a screen where nothing worked:
--
--   page.papierkorb   the Trash page rendered, but restore_record()/purge_record() both refused
--   page.team         the Team page rendered, but app_users' RLS returned an empty list
--
-- ON page.team AND ESCALATION. app_users' policies are what stop someone editing their own role, so
-- the earlier pass deliberately left them on `is_admin()` as an escalation backstop. That reasoning
-- still holds for WRITES: granting `page.team` must not become a way to hand yourself every other
-- permission. So this splits them —
--
--   SELECT  follows page.team, because reading the list is what the screen does and an empty
--           screen is the lie being fixed;
--   INSERT/UPDATE stay is_admin(), so creating people and changing roles remains a role decision.
--
-- A non-admin holding page.team therefore sees the team and can change nothing. That is a coherent
-- "read-only team view", and it is honest — which an empty table was not.

begin;

drop policy if exists app_users_admin_read on public.app_users;
create policy app_users_admin_read on public.app_users
  for select to authenticated
  using (is_admin() or public.has_permission('page.team'));

drop policy if exists user_company_access_admin_read on public.user_company_access;
create policy user_company_access_admin_read on public.user_company_access
  for select to authenticated
  using (is_admin() or public.has_permission('page.team'));

-- Trash: restore_record() and purge_record() are SECURITY DEFINER and check the caller in their
-- own body, so there is no policy to rewrite. The check is SPLICED into the live definition rather
-- than the body being restated here: both have grown since they were written (a third `p_reason`
-- parameter, trash_eligible_tables(), a change_history entry, and purge_record's GoBD refusal of
-- `invoices`), and retyping them from memory would silently drop whichever part was forgotten.
do $$
declare
  v_def text;
  v_new text;
  v_old constant text := 'if not public.is_admin() then';
begin
  foreach v_def in array array['restore_record', 'purge_record'] loop
    select pg_get_functiondef(p.oid) into strict v_new
      from pg_proc p
     where p.proname = v_def and p.pronamespace = 'public'::regnamespace;

    if position('has_permission' in v_new) > 0 then
      raise notice '% already permission-gated, skipping', v_def;
      continue;
    end if;
    if position(v_old in v_new) = 0 then
      raise exception '%: could not find the admin check to replace', v_def;
    end if;

    v_new := replace(
      v_new,
      v_old,
      format('if not (public.is_admin() or public.has_permission(%L)) then', 'page.papierkorb')
    );
    execute v_new;
  end loop;
end
$$;

commit;

-- The refusal text still said "admin only" after the check learned about page.papierkorb, so a
-- permitted-by-permission caller who tripped a DIFFERENT guard would read the wrong reason.
do $$
declare
  v_fn text;
  v_new text;
begin
  foreach v_fn in array array['restore_record', 'purge_record'] loop
    select pg_get_functiondef(p.oid) into strict v_new
      from pg_proc p
     where p.proname = v_fn and p.pronamespace = 'public'::regnamespace;
    v_new := replace(v_new, format('%s: admin only', v_fn), format('%s: not permitted', v_fn));
    execute v_new;
  end loop;
end
$$;
