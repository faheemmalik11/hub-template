-- Fixed-amount referrer ("Tippgeber") bonuses, by how many of that referrer's deals have already
-- succeeded this calendar year. Fixed amounts replaced a percentage model the client used until
-- 27 October; see docs/REFERRER_BONUSES.md. A referrer is a customer, never an app_user, so this
-- is its own table rather than a row in broker_bonuses, the same reasoning docs/DEAL_DONATIONS.md
-- already gives for deal_donations. Inert until a role holds `bonuses.review`, same gate as broker
-- bonuses. Re-runnable.

begin;

alter table public.bonus_settings
    add column if not exists referrer_tier1_amount numeric(12, 2) not null default 1000
        check (referrer_tier1_amount > 0),
    add column if not exists referrer_tier2_amount numeric(12, 2) not null default 1500
        check (referrer_tier2_amount > 0),
    add column if not exists referrer_tier3_amount numeric(12, 2) not null default 2000
        check (referrer_tier3_amount > 0),
    add column if not exists referrer_tier4plus_amount numeric(12, 2) not null default 2000
        check (referrer_tier4plus_amount > 0);

create table if not exists public.deal_referrer_bonuses (
    id uuid primary key default gen_random_uuid(),
    deal_id uuid not null references public.deals(id),
    referrer_customer_id uuid not null references public.customers(id),
    tier integer not null check (tier > 0),
    amount numeric(12, 2) not null check (amount > 0),
    earned_on date not null,
    status text not null default 'suggested' check (status in ('suggested', 'paid', 'cancelled')),
    cancel_reason text,
    created_by uuid references public.app_users(id),
    created_at timestamptz not null default now(),
    paid_by uuid references public.app_users(id),
    paid_at timestamptz,
    updated_at timestamptz not null default now()
);

-- A cancelled bonus does not block a fresh suggestion for the same deal; a suggested or paid one
-- does, since a deal earns its referrer one bonus, not several.
create unique index if not exists deal_referrer_bonuses_one_active_per_deal
    on public.deal_referrer_bonuses (deal_id)
    where status <> 'cancelled';

create index if not exists deal_referrer_bonuses_referrer_year
    on public.deal_referrer_bonuses (referrer_customer_id, earned_on)
    where status <> 'cancelled';

-- Which referral number this would be for that referrer this calendar year, counting only
-- non-cancelled bonuses already recorded -- the client reads this to default the amount field,
-- same as the donation card defaults to donation_settings.donation_amount.
create or replace function public.referrer_bonus_tier(p_referrer_customer_id uuid, p_earned_on date)
returns integer
language sql stable security definer set search_path to 'public'
as $$
  select count(*)::integer + 1
    from public.deal_referrer_bonuses
   where referrer_customer_id = p_referrer_customer_id
     and status <> 'cancelled'
     and extract(year from earned_on) = extract(year from p_earned_on);
$$;

revoke execute on function public.referrer_bonus_tier(uuid, date) from public, anon;
grant execute on function public.referrer_bonus_tier(uuid, date) to authenticated;

drop trigger if exists deal_referrer_bonuses_touch on public.deal_referrer_bonuses;
create trigger deal_referrer_bonuses_touch before update on public.deal_referrer_bonuses
    for each row execute function public.set_updated_at();

create or replace function public.stamp_deal_referrer_bonus() returns trigger
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

drop trigger if exists deal_referrer_bonuses_stamp_insert on public.deal_referrer_bonuses;
create trigger deal_referrer_bonuses_stamp_insert before insert on public.deal_referrer_bonuses
    for each row execute function public.stamp_deal_referrer_bonus();

drop trigger if exists deal_referrer_bonuses_stamp_paid on public.deal_referrer_bonuses;
create trigger deal_referrer_bonuses_stamp_paid before update on public.deal_referrer_bonuses
    for each row execute function public.stamp_deal_referrer_bonus();

alter table public.deal_referrer_bonuses enable row level security;

drop policy if exists deal_referrer_bonuses_rw on public.deal_referrer_bonuses;
create policy deal_referrer_bonuses_rw on public.deal_referrer_bonuses for all to authenticated
    using (public.has_permission('bonuses.review'))
    with check (public.has_permission('bonuses.review'));

grant select, insert, update, delete on public.deal_referrer_bonuses to authenticated;

create or replace function public.notify_referrer_bonus_suggested() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_referrer_name text;
begin
  select name into v_referrer_name from public.customers where id = new.referrer_customer_id;
  perform public.notify_administrators(
    'Tippgeber-Bonus vorgeschlagen: ' || coalesce(v_referrer_name, 'Tippgeber') || ', '
      || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' €',
    '/commission-deals/' || new.deal_id, 'referrer_bonus', new.created_by,
    coalesce((select coalesce(name, email) from public.app_users where id = new.created_by), 'Hub'));
  return null;
end;
$$;

drop trigger if exists deal_referrer_bonuses_notify_suggested on public.deal_referrer_bonuses;
create trigger deal_referrer_bonuses_notify_suggested after insert on public.deal_referrer_bonuses
    for each row when (new.status = 'suggested')
    execute function public.notify_referrer_bonus_suggested();

commit;
