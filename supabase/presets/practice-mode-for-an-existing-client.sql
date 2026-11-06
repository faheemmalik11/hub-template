-- Practice mode: a person tries the app out on rows of their own, never on anybody's real data.
-- Paste into the Supabase SQL editor as the database owner; safe to run twice.
--
-- This is the mechanism only, matching dev's own commit for it: the is_demo/demo_owner_user_id
-- columns, the per-session switch, and the cleanup call. No demo scenarios are seeded here.
--
-- Not gated by feature_settings or the permissions catalogue: nothing in this client's database or
-- in src/kit/onboarding/practice-mode-session.ts asks for a permission key to call
-- set_practice_mode(), so there is nothing to insert into feature_settings at the bottom of this file.
--
-- What this file does NOT touch, so a person reading only this file does not assume it is covered:
--   learn_assignment_rule_from_match(), merge_suppliers() and notify_event_from_history() each
--   gained a short is_demo guard in the same dev commit (so a practice document cannot teach a real
--   assignment rule, a practice supplier cannot be merged with a real one, and a practice comment
--   cannot ping a real administrator). Their full current bodies are long and unrelated to each
--   other, so they are left for a follow-up pass rather than pasted in here as a side effect of
--   switching practice mode on.

begin;

alter table public.app_users add column if not exists practice_mode_until timestamptz;

-- Set by set_practice_mode(), cleared by passing false. While in the future, this person sees
-- only their own practice rows on the demo-flagged tables, never real ones. See the policies below.
create or replace function public.practice_mode_active() returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select u.practice_mode_until > now() from public.app_users u where u.id = public.current_app_user_id()),
    false
  );
$$;

alter table public.companies add column if not exists is_demo boolean not null default false;
alter table public.companies add column if not exists demo_owner_user_id uuid references public.app_users(id);
create index if not exists companies_is_demo_idx on public.companies (demo_owner_user_id) where is_demo;

alter table public.properties add column if not exists is_demo boolean not null default false;
alter table public.properties add column if not exists demo_owner_user_id uuid references public.app_users(id);
create index if not exists properties_is_demo_idx on public.properties (demo_owner_user_id) where is_demo;

alter table public.suppliers add column if not exists is_demo boolean not null default false;
alter table public.suppliers add column if not exists demo_owner_user_id uuid references public.app_users(id);
create index if not exists suppliers_is_demo_idx on public.suppliers (demo_owner_user_id) where is_demo;

alter table public.documents add column if not exists is_demo boolean not null default false;
alter table public.documents add column if not exists demo_owner_user_id uuid references public.app_users(id);
create index if not exists documents_is_demo_idx on public.documents (demo_owner_user_id) where is_demo;

alter table public.bank_transactions add column if not exists is_demo boolean not null default false;
alter table public.bank_transactions add column if not exists demo_owner_user_id uuid references public.app_users(id);
create index if not exists bank_transactions_is_demo_idx on public.bank_transactions (demo_owner_user_id) where is_demo;

create or replace function public.set_practice_mode(p_active boolean) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_user_id uuid := public.current_app_user_id();
begin
  if v_user_id is null then
    raise exception 'set_practice_mode: no signed-in app user';
  end if;

  update public.app_users
     set practice_mode_until = case when p_active then now() + interval '30 minutes' else null end
   where id = v_user_id;
end $$;

create or replace function public.reset_onboarding_demo_data() returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_user_id uuid := public.current_app_user_id();
begin
  if v_user_id is null then
    raise exception 'reset_onboarding_demo_data: no signed-in app user';
  end if;

  update public.documents set deleted_at = now()
   where is_demo and demo_owner_user_id = v_user_id and deleted_at is null;
  update public.bank_transactions set deleted_at = now()
   where is_demo and demo_owner_user_id = v_user_id and deleted_at is null;
  update public.suppliers set deleted_at = now()
   where is_demo and demo_owner_user_id = v_user_id and deleted_at is null;
  update public.companies set deleted_at = now()
   where is_demo and demo_owner_user_id = v_user_id and deleted_at is null;
  update public.properties set deleted_at = now()
   where is_demo and demo_owner_user_id = v_user_id and deleted_at is null;
end $$;

-- Restrictive, so these narrow what the area policies elsewhere already allow rather than granting
-- anything on their own: a person with no documents.read grant still sees nothing here either way.
-- Without these, is_demo/demo_owner_user_id would exist but enforce nothing, and a person in
-- practice mode would keep seeing real rows alongside their practice ones.
drop policy if exists documents_demo_owner_read on public.documents;
create policy documents_demo_owner_read on public.documents as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists documents_demo_owner_write on public.documents;
create policy documents_demo_owner_write on public.documents as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists documents_demo_owner_write_update on public.documents;
create policy documents_demo_owner_write_update on public.documents as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists suppliers_demo_owner_read on public.suppliers;
create policy suppliers_demo_owner_read on public.suppliers as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists suppliers_demo_owner_write on public.suppliers;
create policy suppliers_demo_owner_write on public.suppliers as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists suppliers_demo_owner_write_update on public.suppliers;
create policy suppliers_demo_owner_write_update on public.suppliers as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists companies_demo_owner_read on public.companies;
create policy companies_demo_owner_read on public.companies as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists companies_demo_owner_write on public.companies;
create policy companies_demo_owner_write on public.companies as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists companies_demo_owner_write_update on public.companies;
create policy companies_demo_owner_write_update on public.companies as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists properties_demo_owner_read on public.properties;
create policy properties_demo_owner_read on public.properties as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists properties_demo_owner_write on public.properties;
create policy properties_demo_owner_write on public.properties as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists properties_demo_owner_write_update on public.properties;
create policy properties_demo_owner_write_update on public.properties as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

drop policy if exists bank_transactions_demo_owner_read on public.bank_transactions;
create policy bank_transactions_demo_owner_read on public.bank_transactions as restrictive for select to authenticated
    using (case when public.practice_mode_active()
                then is_demo and demo_owner_user_id = public.current_app_user_id()
                else not is_demo end);
drop policy if exists bank_transactions_demo_owner_write on public.bank_transactions;
create policy bank_transactions_demo_owner_write on public.bank_transactions as restrictive for insert to authenticated
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());
drop policy if exists bank_transactions_demo_owner_write_update on public.bank_transactions;
create policy bank_transactions_demo_owner_write_update on public.bank_transactions as restrictive for update to authenticated
    using (not is_demo or demo_owner_user_id = public.current_app_user_id())
    with check (not is_demo or demo_owner_user_id = public.current_app_user_id());

-- A match must stay inside one world, both practice or both real. Covers every writer: the manual
-- link function, bank-sync, and the pipeline.
create or replace function public.check_match_same_world() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_document_demo boolean;
  v_transaction_demo boolean;
begin
  select d.is_demo into v_document_demo from public.documents d where d.id = new.document_id;
  select t.is_demo into v_transaction_demo from public.bank_transactions t where t.id = new.transaction_id;
  if v_document_demo is not null
     and v_transaction_demo is not null
     and v_document_demo <> v_transaction_demo then
    raise exception 'a practice row cannot be matched with a real row' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_check_match_same_world on public.document_transaction_matches;
create trigger trg_check_match_same_world
  before insert or update of document_id, transaction_id on public.document_transaction_matches
  for each row execute function public.check_match_same_world();

commit;
