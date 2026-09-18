-- Being handed a receipt tells you so.
--
-- Assignment has been silent since it was built: an admin points an invoice at somebody and the
-- only way that person finds out is by opening the invoice they do not know exists. Meanwhile the
-- notification system already carries the two other personal, actionable moments (a query came
-- back, a receipt was rejected) through the same producer, and the bell already has a group
-- literally named "zugewiesen" for them to sit in.
--
-- A SECOND, QUIETER FIX RIDES ALONG, AND IT IS THE MORE IMPORTANT ONE. The producer resolves its
-- recipient by looking the name up in `approvers`:
--
--     select a.app_user_id into v_recipient from public.approvers a where lower(a.name) = ...
--
-- 20260901160000 froze that table. Existing rows are still there, so this keeps working for
-- everybody who is already in it and fails for NOBODY today -- which is exactly what makes it
-- dangerous: from here on, anyone created on Team & Rollen has no approvers row, so they would
-- never receive a query or rejection notification, with nothing in any log to say why. The
-- recipient now comes from an id the app writes onto the history entry, falling back to a name
-- match against app_users for rows written before this migration.
--
-- SELF-NOTIFICATION IS SUPPRESSED. Assigning an invoice to yourself, or sending a query back to
-- yourself, must not ring your own bell. Best-effort: the actor is free text (an email or a
-- display name, depending on the path that wrote it), so the match is by either.

begin;

do $$
begin
  if to_regclass('public.notification_events') is null then
    raise exception 'preconditions failed: notification_events is missing, apply 20260827110000 first';
  end if;
end $$;

create or replace function public.notify_event_from_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name           text;
  v_recipient      uuid;
  v_actor_user     uuid;
  v_type           text;
  v_invoice_number text;
begin
  if new.type not in ('rueckfrage', 'ablehnung', 'zuweisung') then
    return null;
  end if;

  v_type := case new.type
              when 'rueckfrage' then 'rueckfrage'
              when 'ablehnung'  then 'abgelehnt'
              else 'zuweisung'
            end;

  -- The name, for the payload and for the legacy fallback below. 'returned_to' for the two return
  -- types, 'assigned_to' for an assignment.
  v_name := nullif(btrim(coalesce(
              new.data ->> 'returned_to',
              new.data ->> 'assigned_to',
              '')), '');

  -- The id the app writes. Guarded rather than cast bare: a malformed value must degrade to the
  -- name fallback, not raise.
  begin
    v_recipient := nullif(btrim(coalesce(new.data ->> 'recipient_user_id', '')), '')::uuid;
  exception when others then
    v_recipient := null;
  end;

  -- Rows written before this migration carry only a name. Matched against app_users directly:
  -- the approvers table this used to go through is frozen and gains no new people.
  if v_recipient is null and v_name is not null then
    select u.id into v_recipient
      from public.app_users u
     where u.name is not null and lower(u.name) = lower(v_name)
     limit 1;
  end if;

  -- An un-assignment ("Zuweisung entfernt") has nobody to tell.
  if v_type = 'zuweisung' and v_recipient is null then
    return null;
  end if;

  -- Do not ring your own bell.
  if v_recipient is not null and new.actor is not null then
    select u.id into v_actor_user
      from public.app_users u
     where lower(u.email) = lower(new.actor)
        or (u.name is not null and lower(u.name) = lower(new.actor))
     limit 1;
    if v_actor_user = v_recipient then
      return null;
    end if;
  end if;

  select i.invoice_number into v_invoice_number
    from public.invoices i where i.id = new.invoice_id;

  insert into public.notification_events (type, payload, recipient_user_id)
  values (
    v_type,
    jsonb_strip_nulls(jsonb_build_object(
      'invoice_id', new.invoice_id,
      'invoice_number', v_invoice_number,
      -- Kept under its original key for the two return types so existing consumers and stored
      -- payloads keep their vocabulary; an assignment says assigned_to.
      'returned_to', case when v_type <> 'zuweisung' then v_name end,
      'assigned_to', case when v_type =  'zuweisung' then v_name end,
      'note', nullif(btrim(coalesce(new.text, '')), ''),
      'actor', new.actor
    )),
    v_recipient
  );
  return null;
exception when others then
  -- A notification must never block the workflow write it observes.
  return null;
end;
$$;

drop trigger if exists trg_notify_event_from_history on public.invoice_history;
create trigger trg_notify_event_from_history
  after insert on public.invoice_history
  for each row execute function public.notify_event_from_history();

comment on function public.notify_event_from_history() is
  'Producer: turns invoice_history entries into notification_events. rueckfrage -> rueckfrage, '
  'ablehnung -> abgelehnt, zuweisung -> zuweisung. The recipient comes from data->>recipient_user_id '
  'written by the app, falling back to a name match against app_users for rows written before '
  '20260901160500 (it used to go through approvers, which is frozen and gains no new people). '
  'Self-notification is suppressed, an un-assignment produces nothing, and every failure is '
  'swallowed: a notification must never block the write it observes.';

-- ===========================================================================
-- Self-checks
-- ===========================================================================
do $$
declare v_def text := pg_get_functiondef('public.notify_event_from_history()'::regprocedure);
begin
  -- Matched on the actual read, not the bare word: the body's own comment explains that the
  -- approvers hop is gone, and a substring check on 'approvers' matches that explanation.
  if position('from public.approvers' in v_def) <> 0 then
    raise exception 'self-check failed: the producer still reads the frozen approvers table';
  end if;
  if position('zuweisung' in v_def) = 0 then
    raise exception 'self-check failed: the producer does not handle zuweisung';
  end if;
  if position('recipient_user_id' in v_def) = 0 then
    raise exception 'self-check failed: the producer does not read recipient_user_id';
  end if;
  raise notice 'self-checks passed';
end $$;

commit;
