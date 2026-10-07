-- The Hub tells people when something needs them: a deal waiting for approval, a decision on a deal
-- or a bonus, a sync that stopped working. Each is a bell entry (a `ping` event), written here and
-- nowhere in the screens. Re-runnable.

begin;

create or replace function public.administrator_ids() returns setof uuid
language sql stable security definer set search_path to 'public'
as $$
  select u.id
    from public.app_users u
    join public.roles r on r.id = u.role_id
   where u.is_active and r.administers and r.name <> 'super_admin';
$$;

create or replace function public.send_system_ping(
    p_recipient uuid, p_from text, p_note text, p_path text, p_source text)
returns void
language sql security definer set search_path to 'public'
as $$
  insert into public.notification_events (type, payload, recipient_user_id, created_by)
  values ('ping',
          jsonb_build_object(
            'from_name', p_from,
            'note', p_note,
            'target', jsonb_build_object('kind', 'page', 'path', p_path)),
          p_recipient, p_source);
$$;

create or replace function public.notify_administrators(
    p_note text, p_path text, p_source text, p_except uuid default null, p_from text default 'Hub')
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_recipient uuid;
  v_sent integer := 0;
begin
  for v_recipient in select public.administrator_ids() loop
    if v_recipient is distinct from p_except then
      perform public.send_system_ping(v_recipient, p_from, p_note, p_path, p_source);
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;

revoke execute on function public.administrator_ids() from public, anon, authenticated;
revoke execute on function public.send_system_ping(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_administrators(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.notify_administrators(text, text, text, uuid, text) to service_role;

create or replace function public.notify_deal_status_changed() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_name text;
  v_label text := coalesce(new.property_label, 'Verkauf');
  v_owner uuid := coalesce(new.acquired_by, new.handled_by);
begin
  select coalesce(name, email) into v_actor_name from public.app_users where id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'Hub');

  if new.status = 'ready' then
    perform public.notify_administrators(
      'Provision zur Freigabe: ' || v_label, '/commission-deals/' || new.id, 'deal', v_actor, v_actor_name);
  elsif new.status = 'approved' and v_owner is not null and v_owner is distinct from v_actor then
    perform public.send_system_ping(
      v_owner, v_actor_name, 'Provision freigegeben: ' || v_label, '/commission-deals/' || new.id, 'deal');
  end if;
  return null;
end;
$$;

drop trigger if exists deals_notify_status_changed on public.deals;
create trigger deals_notify_status_changed after update of status on public.deals
    for each row when (old.status is distinct from new.status)
    execute function public.notify_deal_status_changed();

create or replace function public.bonus_type_label(p_type text) returns text
language sql immutable
as $$
  select case p_type
    when 'notary' then 'Notarbonus'
    when 'google_review' then 'Google-Bewertung'
    when 'viewing_new_job' then 'Neuer Auftrag aus Besichtigung'
    when 'company_lead_share' then '10 % Anteil (Firmenlead)'
    when 'own_job_share' then '50 % Anteil (eigener Auftrag)'
    when 'financing_referral' then 'Empfehlung Finanzierung'
    else 'Sonstiges' end
$$;

create or replace function public.notify_bonus_decided() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := public.current_app_user_id();
  v_actor_name text;
  v_what text;
begin
  if new.broker_user_id is not distinct from v_actor then
    return null;
  end if;
  select coalesce(name, email) into v_actor_name from public.app_users where id = v_actor;

  v_what := public.bonus_type_label(new.bonus_type) || ', '
            || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €';
  perform public.send_system_ping(
    new.broker_user_id,
    coalesce(v_actor_name, 'Hub'),
    case new.status
      when 'approved' then 'Bonus freigegeben: ' || v_what
      when 'rejected' then 'Bonus abgelehnt: ' || v_what
                           || coalesce(' (' || nullif(btrim(new.review_note), '') || ')', '')
      else 'Bonus ausgezahlt: ' || v_what end,
    '/broker-bonuses', 'bonus');
  return null;
end;
$$;

drop trigger if exists broker_bonuses_notify_decided on public.broker_bonuses;
create trigger broker_bonuses_notify_decided after update of status on public.broker_bonuses
    for each row when (old.status is distinct from new.status and new.status in ('approved', 'rejected', 'paid'))
    execute function public.notify_bonus_decided();

commit;
