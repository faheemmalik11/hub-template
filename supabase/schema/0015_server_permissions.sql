-- Whether a named person may do a named thing, for callers that have no session.
--
-- The server routes run on the service-role key, which bypasses row level security entirely, so
-- has_permission() cannot help them: it resolves the caller from auth.jwt(), and there is no JWT.
--
-- Rewriting that rule in TypeScript is how the two drift. This asks the same question with the
-- person named explicitly, and resolves it through live_features() like everything else, so a
-- feature the client has switched off is refused on the server too.

begin;

create or replace function public.person_may(p_email text, p_capability text) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  with person as (
    select u.id, u.role_id, r.protected, r.administers
      from public.app_users u
      left join public.roles r on r.id = u.role_id
     where lower(u.email) = lower(coalesce(p_email, ''))
       and u.is_active
     limit 1
  ),
  live as (select key from public.live_features())
  select coalesce((
    select case
      -- The break-glass account keeps everything the client uses. It still cannot use a feature
      -- that is switched off, because that is not a rights question.
      when p.protected then p_capability in (select key from live)
      when p.administers and p_capability in (select key from live) then true
      else coalesce(
        (select up.granted
           from public.user_permissions up
          where up.user_id = p.id and up.permission_key = p_capability),
        exists (
          select 1 from public.role_permissions rp
           where rp.role_id = p.role_id and rp.permission_key = p_capability
        )
      ) and p_capability in (select key from live)
    end
    from person p
  ), false);
$$;

revoke execute on function public.person_may(text, text) from public, anon;
grant execute on function public.person_may(text, text) to authenticated, service_role;

commit;
