begin;

create or replace function public.set_user_slack_id(p_user uuid, p_slack_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text := btrim(coalesce(p_slack_id, ''));
begin
  if not public.is_admin() then
    raise exception 'set_user_slack_id: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  if p_slack_id is not null and v_value <> '' and v_value !~ '^[UW][A-Z0-9]+$' then
    raise exception 'set_user_slack_id: % is not a Slack member id', v_value;
  end if;

  update public.app_users
     set slack_user_id = case when p_slack_id is null then null else v_value end,
         updated_at = now()
   where id = p_user;

  if not found then
    raise exception 'set_user_slack_id: unknown user %', p_user;
  end if;
end;
$$;

revoke execute on function public.set_user_slack_id(uuid, text) from public;
revoke execute on function public.set_user_slack_id(uuid, text) from anon;
grant execute on function public.set_user_slack_id(uuid, text) to authenticated;

comment on function public.set_user_slack_id(uuid, text) is
  'Links a Hub user to a Slack member. Empty string means never send them a direct message; '
  'null resets to matching by email address.';

commit;
