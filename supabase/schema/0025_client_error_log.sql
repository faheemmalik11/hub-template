begin;

create table if not exists public.client_error_log (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  message     text not null,
  stack       text,
  route       text,
  boundary    text,
  user_id     uuid references auth.users(id) on delete set null
);

create index if not exists client_error_log_occurred_at_idx
  on public.client_error_log (occurred_at desc);

alter table public.client_error_log enable row level security;

drop policy if exists "client_error_log_insert" on public.client_error_log;
create policy "client_error_log_insert" on public.client_error_log
  for insert to authenticated with check (true);

drop policy if exists "client_error_log_select" on public.client_error_log;
create policy "client_error_log_select" on public.client_error_log
  for select to authenticated using (public.is_admin());

commit;

do $$
declare
  v_missing text[] := '{}';
begin
  if to_regclass('public.client_error_log') is null then
    v_missing := v_missing || 'client_error_log table';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'client_error_log'
       and policyname = 'client_error_log_insert'
  ) then
    v_missing := v_missing || 'client_error_log_insert policy';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'client_error_log'
       and policyname = 'client_error_log_select'
  ) then
    v_missing := v_missing || 'client_error_log_select policy';
  end if;
  if array_length(v_missing, 1) is not null then
    raise exception '0025_client_error_log self-check failed, missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;
