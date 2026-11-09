-- A donation tied to a sale above a configured threshold, for an administrator to record when the
-- organisation and its details are known, and mark paid once the transfer is made. Inert until a
-- role holds `donations.manage`, which no role does by default. Re-runnable.

begin;

create table if not exists public.deal_donations (
    id uuid primary key default gen_random_uuid(),
    deal_id uuid not null references public.deals(id),
    organisation text not null,
    iban text,
    contact_person text,
    contact_reachability text,
    handover_date date,
    amount numeric(12, 2) not null check (amount > 0),
    status text not null default 'suggested' check (status in ('suggested', 'paid', 'cancelled')),
    cancel_reason text,
    created_by uuid references public.app_users(id),
    created_at timestamptz not null default now(),
    paid_by uuid references public.app_users(id),
    paid_at timestamptz,
    updated_at timestamptz not null default now()
);

-- A cancelled donation does not block a fresh suggestion for the same deal; a suggested or paid one
-- does, since a deal gives one organisation its donation, not several.
create unique index if not exists deal_donations_one_active_per_deal
    on public.deal_donations (deal_id)
    where status <> 'cancelled';

create table if not exists public.donation_settings (
    single_row boolean primary key default true check (single_row),
    threshold_amount numeric(12, 2) not null default 500000 check (threshold_amount > 0),
    donation_amount numeric(12, 2) not null default 1000 check (donation_amount > 0),
    updated_at timestamptz not null default now()
);

insert into public.donation_settings (single_row) values (true) on conflict do nothing;

drop trigger if exists donation_settings_touch on public.donation_settings;
create trigger donation_settings_touch before update on public.donation_settings
    for each row execute function public.set_updated_at();

drop trigger if exists deal_donations_touch on public.deal_donations;
create trigger deal_donations_touch before update on public.deal_donations
    for each row execute function public.set_updated_at();

create or replace function public.stamp_deal_donation() returns trigger
language plpgsql set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.current_app_user_id();
  elsif new.status = 'paid' and old.status <> 'paid' then
    new.paid_by := public.current_app_user_id();
    new.paid_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists deal_donations_stamp_insert on public.deal_donations;
create trigger deal_donations_stamp_insert before insert on public.deal_donations
    for each row execute function public.stamp_deal_donation();

drop trigger if exists deal_donations_stamp_paid on public.deal_donations;
create trigger deal_donations_stamp_paid before update on public.deal_donations
    for each row execute function public.stamp_deal_donation();

alter table public.donation_settings enable row level security;
alter table public.deal_donations enable row level security;

drop policy if exists donation_settings_read on public.donation_settings;
create policy donation_settings_read on public.donation_settings for select to authenticated
    using (public.has_permission('donations.manage'));

drop policy if exists donation_settings_write on public.donation_settings;
create policy donation_settings_write on public.donation_settings for update to authenticated
    using (public.has_permission('donations.manage'))
    with check (public.has_permission('donations.manage'));

drop policy if exists deal_donations_rw on public.deal_donations;
create policy deal_donations_rw on public.deal_donations for all to authenticated
    using (public.has_permission('donations.manage'))
    with check (public.has_permission('donations.manage'));

grant select, update on public.donation_settings to authenticated;
grant select, insert, update, delete on public.deal_donations to authenticated;

create or replace function public.notify_donation_suggested() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public.notify_administrators(
    'Spende vorgeschlagen: ' || new.organisation || ', '
      || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €',
    '/commission-deals/' || new.deal_id, 'donation', new.created_by,
    coalesce((select coalesce(name, email) from public.app_users where id = new.created_by), 'Hub'));
  return null;
end;
$$;

drop trigger if exists deal_donations_notify_suggested on public.deal_donations;
create trigger deal_donations_notify_suggested after insert on public.deal_donations
    for each row when (new.status = 'suggested')
    execute function public.notify_donation_suggested();

commit;
