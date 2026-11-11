begin;

create table if not exists public.lexware_rate_limit (
    id boolean primary key default true,
    next_allowed_at timestamptz not null default now(),
    constraint lexware_rate_limit_single_row check (id)
);

insert into public.lexware_rate_limit (id) values (true) on conflict (id) do nothing;

-- No policy is added on purpose: only the security-definer function below ever touches this row,
-- so every other caller, including a signed-in admin, is correctly refused by default.
alter table public.lexware_rate_limit enable row level security;

-- Lexware allows 2 requests/second across all endpoints. Every call to the shared Lexware client,
-- from any Edge Function invocation, asks this function first and sleeps for the milliseconds it
-- returns. The row lock below makes the wait correct even when several invocations call this at
-- the same instant, which a module-level counter inside one Edge Function could never guarantee.
create or replace function public.lexware_throttle_wait() returns integer
    language plpgsql security definer set search_path to 'public'
    as $$
declare
  v_now timestamptz := clock_timestamp();
  v_next timestamptz;
  v_wait_ms integer;
begin
  select next_allowed_at into v_next from public.lexware_rate_limit where id for update;
  if v_next < v_now then
    v_next := v_now;
  end if;
  update public.lexware_rate_limit set next_allowed_at = v_next + interval '500 milliseconds' where id;
  v_wait_ms := greatest(0, ceil(extract(epoch from (v_next - v_now)) * 1000))::integer;
  return v_wait_ms;
end;
$$;

revoke execute on function public.lexware_throttle_wait() from public, anon, authenticated;
grant execute on function public.lexware_throttle_wait() to service_role;

commit;
