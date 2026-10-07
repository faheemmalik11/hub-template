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
declare
  v_broker text;
  v_type text;
  v_recipient uuid;
begin
  select coalesce(name, email) into v_broker from public.app_users where id = new.broker_user_id;
  v_type := case new.bonus_type
    when 'notary' then 'Notarbonus'
    when 'google_review' then 'Google-Bewertung'
    when 'viewing_new_job' then 'Neuer Auftrag aus Besichtigung'
    when 'company_lead_share' then '10 % Anteil (Firmenlead)'
    when 'own_job_share' then '50 % Anteil (eigener Auftrag)'
    when 'financing_referral' then 'Empfehlung Finanzierung'
    else 'Sonstiges' end;

  for v_recipient in
    select u.id
      from public.app_users u
      join public.roles r on r.id = u.role_id
     where u.is_active and r.administers and r.name <> 'super_admin' and u.id <> new.broker_user_id
  loop
    insert into public.notification_events (type, payload, recipient_user_id, created_by)
    values ('ping',
            jsonb_build_object(
              'from_name', v_broker,
              'note', 'Neuer Bonus zur Prüfung: ' || v_type || ', '
                      || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €',
              'target', jsonb_build_object('kind', 'page', 'path', '/broker-bonuses')),
            v_recipient, 'bonus');
  end loop;
  return new;
end;
$$;

drop trigger if exists broker_bonuses_notify_submitted on public.broker_bonuses;
create trigger broker_bonuses_notify_submitted after insert on public.broker_bonuses
    for each row execute function public.notify_bonus_submitted();

commit;
