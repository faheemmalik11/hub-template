begin;

do $$
begin
  if to_regnamespace('vault') is null then
    raise exception 'supabase_vault is not installed; the channel secret store needs it';
  end if;
  if to_regclass('public.notification_channels') is null then
    raise exception 'notification_channels not found; apply the notification system migration first';
  end if;
end $$;

alter table public.app_users
  add column if not exists slack_user_id text;

comment on column public.app_users.slack_user_id is
  'Slack member id, resolved once from this user''s email by notify-dispatch and cached here. '
  'Member ids are per workspace, so notify-dispatch clears them when the workspace changes.';

create or replace function public.channel_secret_name(p_channel text)
returns text
language sql
immutable
as $$
  select 'channel_secret:' || p_channel;
$$;

create or replace function public.set_channel_secret(p_channel text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_id uuid;
  v_old text;
  v_pattern text;
  v_secret text := nullif(regexp_replace(coalesce(p_secret, ''), '\s', '', 'g'), '');
begin
  if not public.is_admin() then
    raise exception 'set_channel_secret: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(config ->> 'secret_pattern', '') into v_pattern
    from public.notification_channels
   where key = p_channel;

  if not found then
    raise exception 'set_channel_secret: unknown channel %', p_channel;
  end if;

  if v_secret is not null and v_pattern <> '' and v_secret !~ v_pattern then
    raise exception 'set_channel_secret: value does not match the format % expects', p_channel;
  end if;

  v_name := public.channel_secret_name(p_channel);
  select id into v_id from vault.secrets where name = v_name limit 1;
  if v_id is not null then
    select decrypted_secret into v_old from vault.decrypted_secrets where id = v_id;
  end if;

  if v_secret is null then
    if v_id is not null then
      delete from vault.secrets where id = v_id;
    end if;
    update public.notification_channels
       set enabled = false, updated_at = now()
     where key = p_channel and enabled;
    return;
  end if;

  if v_id is null then
    begin
      perform vault.create_secret(v_secret, v_name, 'Credential for notification channel ' || p_channel);
    exception when unique_violation then
      select id into v_id from vault.secrets where name = v_name limit 1;
      perform vault.update_secret(v_id, v_secret);
    end;
  elsif v_old is distinct from v_secret then
    perform vault.update_secret(v_id, v_secret);
  end if;
end;
$$;

revoke execute on function public.set_channel_secret(text, text) from public;
revoke execute on function public.set_channel_secret(text, text) from anon;
grant execute on function public.set_channel_secret(text, text) to authenticated;

create or replace function public.get_channel_secret(p_channel text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.notification_channels where key = p_channel) then
    return null;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = public.channel_secret_name(p_channel)
   limit 1;
  return v_secret;
end;
$$;

revoke execute on function public.get_channel_secret(text) from public;
revoke execute on function public.get_channel_secret(text) from anon;
revoke execute on function public.get_channel_secret(text) from authenticated;
grant execute on function public.get_channel_secret(text) to service_role;

create or replace function public.channel_secret_present(p_channel text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return false;
  end if;
  return exists (
    select 1 from vault.secrets where name = public.channel_secret_name(p_channel)
  );
end;
$$;

revoke execute on function public.channel_secret_present(text) from public;
revoke execute on function public.channel_secret_present(text) from anon;
grant execute on function public.channel_secret_present(text) to authenticated;

commit;
