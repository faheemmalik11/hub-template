-- Bonuses worked out from a sale. Paste into the Supabase SQL editor as the database owner; safe to run twice.
-- Run supabase/presets/deal-details-for-an-existing-client.sql first (the deal gets the people and costs it uses),
-- and broker-for-an-existing-client.sql before that if the bonus tables are not there yet.
-- It switches nothing on: see the last lines.

-- Bonuses worked out from a sale. An administrator creates the suggestion from the deal, the broker
-- confirms it, and the usual review follows. Inert until a role holds `bonuses.suggest`, which no
-- role does by default. Re-runnable.

begin;

alter table public.broker_bonuses add column if not exists deal_id uuid references public.deals(id);

alter table public.broker_bonuses drop constraint if exists broker_bonuses_status_known;
alter table public.broker_bonuses add constraint broker_bonuses_status_known
    check (status in ('suggested', 'submitted', 'approved', 'rejected', 'paid'));

create unique index if not exists broker_bonuses_one_per_deal_and_type
    on public.broker_bonuses (deal_id, bonus_type)
    where deal_id is not null and status <> 'rejected';

create table if not exists public.bonus_settings (
    single_row boolean primary key default true check (single_row),
    notary_amount numeric(12, 2) not null default 500 check (notary_amount > 0),
    follow_up_amount numeric(12, 2) not null default 300 check (follow_up_amount > 0),
    own_lead_share_percent numeric(5, 2) not null default 50 check (own_lead_share_percent > 0 and own_lead_share_percent <= 100),
    company_lead_share_percent numeric(5, 2) not null default 10 check (company_lead_share_percent > 0 and company_lead_share_percent <= 100),
    personnel_flat_amount numeric(12, 2) not null default 1500 check (personnel_flat_amount >= 0),
    company_lead_deducts_costs boolean not null default true,
    updated_at timestamptz not null default now()
);

insert into public.bonus_settings (single_row) values (true) on conflict do nothing;

drop trigger if exists bonus_settings_touch on public.bonus_settings;
create trigger bonus_settings_touch before update on public.bonus_settings
    for each row execute function public.set_updated_at();

alter table public.bonus_settings enable row level security;

drop policy if exists bonus_settings_read on public.bonus_settings;
create policy bonus_settings_read on public.bonus_settings for select to authenticated
    using (public.has_permission('bonuses.review') or public.has_permission('bonuses.submit'));

drop policy if exists bonus_settings_write on public.bonus_settings;
create policy bonus_settings_write on public.bonus_settings for update to authenticated
    using (public.has_permission('bonuses.review'))
    with check (public.has_permission('bonuses.review'));

grant select, update on public.bonus_settings to authenticated;

drop policy if exists broker_bonuses_own_confirm on public.broker_bonuses;
create policy broker_bonuses_own_confirm on public.broker_bonuses for update to authenticated
    using (public.has_permission('bonuses.submit')
           and broker_user_id = public.current_app_user_id() and status = 'suggested')
    with check (public.has_permission('bonuses.submit')
                and broker_user_id = public.current_app_user_id() and status = 'submitted'
                and reviewed_by is null and reviewed_at is null);

drop policy if exists broker_bonuses_own_decline on public.broker_bonuses;
create policy broker_bonuses_own_decline on public.broker_bonuses for delete to authenticated
    using (public.has_permission('bonuses.submit')
           and broker_user_id = public.current_app_user_id() and status = 'suggested');

create or replace function public.notify_bonus_submitted() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public.notify_administrators(
    'Neuer Bonus zur Prüfung: ' || public.bonus_type_label(new.bonus_type) || ', '
      || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €',
    '/broker-bonuses', 'bonus', new.broker_user_id,
    coalesce((select coalesce(name, email) from public.app_users where id = new.broker_user_id), 'Hub'));
  return null;
end;
$$;

drop trigger if exists broker_bonuses_notify_submitted on public.broker_bonuses;
create trigger broker_bonuses_notify_submitted after insert on public.broker_bonuses
    for each row when (new.status = 'submitted')
    execute function public.notify_bonus_submitted();

drop trigger if exists broker_bonuses_notify_confirmed on public.broker_bonuses;
create trigger broker_bonuses_notify_confirmed after update of status on public.broker_bonuses
    for each row when (old.status = 'suggested' and new.status = 'submitted')
    execute function public.notify_bonus_submitted();

create or replace function public.notify_bonus_suggested() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.broker_user_id is distinct from public.current_app_user_id() then
    perform public.send_system_ping(
      new.broker_user_id, 'Hub',
      'Bonus zur Bestätigung: ' || public.bonus_type_label(new.bonus_type) || ', '
        || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €',
      '/broker-bonuses', 'bonus');
  end if;
  return null;
end;
$$;

drop trigger if exists broker_bonuses_notify_suggested on public.broker_bonuses;
create trigger broker_bonuses_notify_suggested after insert on public.broker_bonuses
    for each row when (new.status = 'suggested')
    execute function public.notify_bonus_suggested();

commit;

begin;
insert into public.permissions (key, kind, parent_key, category, label_de, label_en, default_enabled, sort_order) values
  ('bonuses.suggest', 'section', 'page.broker_bonuses', 'documents', 'Boni aus Verkäufen vorschlagen', 'Suggest bonuses from sales', false, 941)
on conflict (key) do update
   set kind = excluded.kind, parent_key = excluded.parent_key, category = excluded.category,
       label_de = excluded.label_de, label_en = excluded.label_en,
       default_enabled = excluded.default_enabled, sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'bonuses.suggest' from public.roles r where r.administers
on conflict do nothing;
commit;

-- To switch it on:
-- insert into public.feature_settings (feature_key, enabled) values ('bonuses.suggest', true)
--   on conflict (feature_key) do update set enabled = true, updated_at = now();
