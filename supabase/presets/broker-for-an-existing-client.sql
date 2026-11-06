-- Gives a client whose database already exists the broker features: a broker enters their own
-- commissions and bonuses, an administrator approves them. One file to paste into the Supabase SQL editor.
--
-- It is these, in this order, so a change to any of them means regenerating this file:
--   supabase/schema/0017_broker_commissions.sql   the commission rules (re-runnable)
--   supabase/schema/0018_broker_bonuses.sql       the bonus table and rules (re-runnable)
--   supabase/schema/0020_system_notifications.sql the bell entries for deals and bonuses (re-runnable)
--   supabase/catalogue.sql                        the `deals.*` and `bonuses.*` permissions
--   supabase/presets/broker-role.sql              the Broker role and the features it needs
--
-- Safe to run twice. Run it as the database owner.

-- A broker enters their own commissions, and an administrator reviews and approves them.
--
-- Everything here is inert until a role holds `deals.submit`, which no role does by default: the
-- permission is off in the catalogue, and a policy that asks for it denies everyone who lacks it.
-- Re-runnable, so the same file builds a new database and upgrades one that already exists.
--
-- A person holding `deals.submit` may create a deal on a property the CRM says is theirs, and edit it
-- while it is incomplete or ready. They may not approve it, change what it is about to somebody
-- else's property, or touch it once it is approved: approving is `documents.write`, as before.

begin;

-- Who created a customer, so a person can read back the customers they entered and nobody else's.
alter table public.customers
    add column if not exists created_by uuid references public.app_users(id)
        default public.current_app_user_id();

create or replace function public.is_own_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.properties p
     where p.id = p_property_id
       and p.deleted_at is null
       and p.broker_external_id is not null
       and p.broker_external_id = public.current_crm_external_id()
  );
$$;

create or replace function public.may_edit_own_deal(p_deal_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select public.has_permission('deals.submit')
     and exists (
       select 1 from public.deals d
        where d.id = p_deal_id
          and d.deleted_at is null
          and d.status in ('incomplete', 'ready')
          and public.owns_deal(d.id)
     );
$$;

create or replace function public.may_edit_own_deal_side(p_side_id uuid) returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.deal_sides s
                  where s.id = p_side_id and public.may_edit_own_deal(s.deal_id));
$$;

revoke execute on function public.is_own_property(uuid) from public, anon;
revoke execute on function public.may_edit_own_deal(uuid) from public, anon;
revoke execute on function public.may_edit_own_deal_side(uuid) from public, anon;
grant execute on function public.is_own_property(uuid) to authenticated;
grant execute on function public.may_edit_own_deal(uuid) to authenticated;
grant execute on function public.may_edit_own_deal_side(uuid) to authenticated;

drop policy if exists deals_submit_insert on public.deals;
create policy deals_submit_insert on public.deals for insert to authenticated
    with check (public.has_permission('deals.submit')
                and public.is_own_property(property_id)
                and status = 'incomplete'
                and approved_by is null and approved_at is null
                and deleted_at is null);

-- Read from the row's own property, not through a function that looks the deal up again: a row being
-- inserted cannot be seen by a second query in the same statement, so the insert would be refused
-- when it tries to hand the new row back.
drop policy if exists deals_submit_read on public.deals;
create policy deals_submit_read on public.deals for select to authenticated
    using (public.has_permission('deals.submit') and public.is_own_property(property_id));

drop policy if exists deals_submit_update on public.deals;
create policy deals_submit_update on public.deals for update to authenticated
    using (public.may_edit_own_deal(id))
    with check (public.has_permission('deals.submit')
                and public.is_own_property(property_id)
                and status in ('incomplete', 'ready')
                and approved_by is null and approved_at is null
                and deleted_at is null);

drop policy if exists deal_sides_submit on public.deal_sides;
create policy deal_sides_submit on public.deal_sides for all to authenticated
    using (public.may_edit_own_deal(deal_id))
    with check (public.may_edit_own_deal(deal_id));

-- A payer must be a customer the person can themselves see, so somebody else's customer cannot be
-- attached by knowing its id.
drop policy if exists deal_parties_submit on public.deal_parties;
create policy deal_parties_submit on public.deal_parties for all to authenticated
    using (public.may_edit_own_deal_side(deal_side_id))
    with check (public.may_edit_own_deal_side(deal_side_id)
                and exists (select 1 from public.customers c where c.id = customer_id));

drop policy if exists customers_submit_insert on public.customers;
create policy customers_submit_insert on public.customers for insert to authenticated
    with check (public.has_permission('deals.submit')
                and source = 'app'
                and created_by = public.current_app_user_id());

drop policy if exists customers_submit_read on public.customers;
create policy customers_submit_read on public.customers for select to authenticated
    using (public.has_permission('deals.submit')
           and created_by = public.current_app_user_id());

commit;

-- A broker's bonus claims, entered by the broker and approved by an administrator.
--
-- Inert until a role holds `bonuses.submit` or `bonuses.review`, which no role does by default.
-- Re-runnable, so the same file builds a new database and upgrades one that already exists.

begin;

create table if not exists public.broker_bonuses (
    id uuid primary key default gen_random_uuid(),
    broker_user_id uuid not null references public.app_users(id) default public.current_app_user_id(),
    bonus_type text not null,
    earned_on date not null,
    amount numeric(12, 2) not null,
    property_id uuid references public.properties(id),
    note text,
    status text not null default 'submitted',
    reviewed_by uuid references public.app_users(id),
    reviewed_at timestamptz,
    review_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint broker_bonuses_type_known check (bonus_type in (
        'notary', 'google_review', 'viewing_new_job', 'company_lead_share',
        'own_job_share', 'financing_referral', 'other')),
    constraint broker_bonuses_status_known check (status in ('submitted', 'approved', 'rejected', 'paid')),
    constraint broker_bonuses_amount_positive check (amount > 0),
    constraint broker_bonuses_review_complete check ((reviewed_by is null) = (reviewed_at is null))
);

update public.broker_bonuses set note = left(note, 500) where char_length(note) > 500;
update public.broker_bonuses set review_note = left(review_note, 500) where char_length(review_note) > 500;

alter table public.broker_bonuses drop constraint if exists broker_bonuses_notes_short;
alter table public.broker_bonuses add constraint broker_bonuses_notes_short
    check (char_length(note) <= 500 and char_length(review_note) <= 500);

create index if not exists broker_bonuses_broker on public.broker_bonuses (broker_user_id, earned_on desc);
create index if not exists broker_bonuses_status on public.broker_bonuses (status);

drop trigger if exists broker_bonuses_touch on public.broker_bonuses;
create trigger broker_bonuses_touch before update on public.broker_bonuses
    for each row execute function public.set_updated_at();

create or replace function public.stamp_bonus_review() returns trigger
language plpgsql set search_path to 'public'
as $$
begin
  if new.status <> old.status and new.status <> 'submitted' then
    new.reviewed_by := public.current_app_user_id();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists broker_bonuses_stamp_review on public.broker_bonuses;
create trigger broker_bonuses_stamp_review before update on public.broker_bonuses
    for each row execute function public.stamp_bonus_review();

alter table public.broker_bonuses enable row level security;

drop policy if exists broker_bonuses_review on public.broker_bonuses;
create policy broker_bonuses_review on public.broker_bonuses for all to authenticated
    using (public.has_permission('bonuses.review'))
    with check (public.has_permission('bonuses.review'));

drop policy if exists broker_bonuses_approved_read on public.broker_bonuses;
create policy broker_bonuses_approved_read on public.broker_bonuses for select to authenticated
    using (public.has_permission('bonuses.read') and status in ('approved', 'paid'));

drop policy if exists broker_bonuses_own_read on public.broker_bonuses;
create policy broker_bonuses_own_read on public.broker_bonuses for select to authenticated
    using (public.has_permission('bonuses.submit') and broker_user_id = public.current_app_user_id());

drop policy if exists broker_bonuses_own_insert on public.broker_bonuses;
create policy broker_bonuses_own_insert on public.broker_bonuses for insert to authenticated
    with check (public.has_permission('bonuses.submit')
                and broker_user_id = public.current_app_user_id()
                and status = 'submitted'
                and reviewed_by is null and reviewed_at is null);

drop policy if exists broker_bonuses_own_update on public.broker_bonuses;
create policy broker_bonuses_own_update on public.broker_bonuses for update to authenticated
    using (public.has_permission('bonuses.submit')
           and broker_user_id = public.current_app_user_id() and status = 'submitted')
    with check (public.has_permission('bonuses.submit')
                and broker_user_id = public.current_app_user_id() and status = 'submitted'
                and reviewed_by is null and reviewed_at is null);

drop policy if exists broker_bonuses_own_delete on public.broker_bonuses;
create policy broker_bonuses_own_delete on public.broker_bonuses for delete to authenticated
    using (public.has_permission('bonuses.submit')
           and broker_user_id = public.current_app_user_id() and status = 'submitted');

grant select, insert, update, delete on public.broker_bonuses to authenticated;

create or replace function public.notify_bonus_submitted() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public.notify_administrators(
    'Neuer Bonus zur Prüfung: ' || public.bonus_type_label(new.bonus_type) || ', '
      || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €',
    '/broker-bonuses', 'bonus', new.broker_user_id,
    coalesce((select coalesce(name, email) from public.app_users where id = new.broker_user_id), 'Hub'));
  return new;
end;
$$;

drop trigger if exists broker_bonuses_notify_submitted on public.broker_bonuses;
create trigger broker_bonuses_notify_submitted after insert on public.broker_bonuses
    for each row execute function public.notify_bonus_submitted();

commit;

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
   where u.is_active and r.administers;
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

-- ---- the permissions
begin;
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, default_enabled, sort_order) values
  ('deals.submit', 'action', 'page.commission_deals', 'documents', 'Eigene Provisionen erfassen', 'Enter own commissions',
   'Verkäufe auf den eigenen Objekten anlegen und bearbeiten, bis die Geschäftsführung sie freigibt. Freigeben lässt sich damit nichts.',
   'Create and edit deals on your own properties until an administrator approves them. It approves nothing.', false, 935)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.permissions (key, kind, parent_key, category, label_de, label_en, description_de, description_en, default_enabled, sort_order) values
  ('page.broker_bonuses', 'page', 'module.invoices', 'menu', 'Boni', 'Bonuses', null, null, false, 936),
  ('bonuses.submit', 'action', 'page.broker_bonuses', 'documents', 'Eigene Boni erfassen', 'Enter own bonuses',
   'Eigene Boni mit Datum, Art und Betrag erfassen, bis die Geschäftsführung sie prüft.',
   'Enter your own bonuses with date, type and amount until an administrator reviews them.', false, 937),
  ('bonuses.read', 'action', 'page.broker_bonuses', 'documents', 'Freigegebene Boni sehen', 'See approved bonuses',
   'Die freigegebenen und ausgezahlten Boni aller Makler lesen, zum Beispiel für die Gehaltsabrechnung. Ändern lässt sich damit nichts.',
   'Read every broker''s approved and paid bonuses, for example for payroll. It changes nothing.', false, 940),
  ('bonuses.review', 'action', 'page.broker_bonuses', 'documents', 'Boni prüfen', 'Review bonuses',
   'Die Boni aller Makler sehen, korrigieren, freigeben, ablehnen und als ausgezahlt markieren.',
   'See every broker''s bonuses, correct, approve, reject and mark them paid.', false, 938)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       description_de = excluded.description_de, description_en = excluded.description_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;
commit;

-- ---- the Broker role
-- A broker: sees only the properties the CRM says are theirs, and enters their own commissions for
-- an administrator to review and approve. No overview: they land on their properties. For a client that keeps its properties in a CRM.
--
-- Not part of the catalogue on purpose: a catalogue role would appear on every client's Team screen,
-- and the catalogue gives every role every menu entry. Apply this once, to the client that wants it.
-- Re-runnable: it puts the role's rights back to exactly this list.
--
-- Run as the database owner, for example in the Supabase SQL editor.

begin;

insert into public.roles (name, label, assignable, administers, protected, sort_order) values
  ('broker', 'Makler', true, false, false, 35)
on conflict (name) do update
   set label = excluded.label, assignable = excluded.assignable,
       administers = excluded.administers, protected = excluded.protected,
       sort_order = excluded.sort_order;

-- The bonus pages and the three below are switched on for the client.
insert into public.feature_settings (feature_key, enabled) values
  ('properties.crm_sync', true),
  ('page.commission_deals', true),
  ('deals.submit', true),
  ('page.broker_bonuses', true),
  ('bonuses.submit', true),
  ('bonuses.read', true),
  ('bonuses.review', true)
on conflict (feature_key) do update set enabled = true;

delete from public.role_permissions
 where role_id = (select id from public.roles where name = 'broker');

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join unnest(array[
    'page.profile',
    'module.master_data', 'page.properties', 'properties.crm_sync',
    'module.invoices', 'page.commission_deals', 'deals.submit',
    'page.broker_bonuses', 'bonuses.submit'
  ]) as k
 where r.name = 'broker'
   and exists (select 1 from public.permissions p where p.key = k)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, k
  from public.roles r
  cross join unnest(array['page.broker_bonuses', 'bonuses.review']) as k
 where r.administers
on conflict do nothing;

commit;
