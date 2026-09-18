-- 20260911160000_my_profile.sql
-- "Mein Profil": a person may change their own name, their own password and their own profile
-- picture. The sign-in email stays an administrator's job on Team & Rollen, so nothing here
-- writes it.
--
-- app_users writes stay admin-only (migration 0046). Self-service goes through two narrow
-- security-definer RPCs keyed on the caller's JWT email -- the same shape as
-- clear_must_change_password (0048) -- rather than a broad self-UPDATE policy on app_users, which
-- would let any signed-in account edit every one of its own columns, roles included.
--
-- Idempotent throughout: `if not exists`, `create or replace`, `drop policy if exists`.

begin;

-- ===========================================================================
-- 0. Preconditions
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'app_users'
  ) then
    raise exception '20260911160000 preconditions failed: table app_users is missing';
  end if;
end $$;

-- ===========================================================================
-- 1. Where the picture lives
-- ===========================================================================
alter table public.app_users
  add column if not exists picture_url text;

comment on column public.app_users.picture_url is
  'Public url of the profile picture inside the profile-pictures storage bucket. NULL means the app shows the person''s initials instead.';

-- ===========================================================================
-- 2. Reading your own row. app_users is admin-read (0046), so a normal employee cannot select
--    their own name back. Security definer, one row, the caller's own.
-- ===========================================================================
create or replace function public.my_profile()
returns table (id uuid, name text, email text, picture_url text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    raise exception 'my_profile: no authenticated email' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id, u.name, u.email, u.picture_url
      from public.app_users u
     where lower(u.email) = lower(v_email);
end;
$$;

revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ===========================================================================
-- 3. Changing your own name
-- ===========================================================================
create or replace function public.set_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if v_email = '' then
    raise exception 'set_my_name: no authenticated email' using errcode = 'insufficient_privilege';
  end if;
  if v_name = '' then
    raise exception 'set_my_name: the name must not be empty' using errcode = 'check_violation';
  end if;
  if length(v_name) > 120 then
    raise exception 'set_my_name: the name is longer than 120 characters' using errcode = 'check_violation';
  end if;

  update public.app_users
     set name = v_name,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'set_my_name: no app_users row for %', v_email;
  end if;
end;
$$;

revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;

-- ===========================================================================
-- 4. Changing your own picture. NULL clears it.
-- ===========================================================================
create or replace function public.set_my_picture_url(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
  v_url   text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_email = '' then
    raise exception 'set_my_picture_url: no authenticated email' using errcode = 'insufficient_privilege';
  end if;
  -- Only a url inside our own bucket. Without this the column would accept any address on the
  -- internet, and every screen showing the picture would fetch it from there.
  if v_url is not null and position('/storage/v1/object/public/profile-pictures/' in v_url) = 0 then
    raise exception 'set_my_picture_url: the url does not point at the profile-pictures bucket'
      using errcode = 'check_violation';
  end if;

  update public.app_users
     set picture_url = v_url,
         updated_at = now()
   where lower(email) = lower(v_email);

  if not found then
    raise exception 'set_my_picture_url: no app_users row for %', v_email;
  end if;
end;
$$;

revoke execute on function public.set_my_picture_url(text) from public, anon;
grant execute on function public.set_my_picture_url(text) to authenticated;

-- ===========================================================================
-- 5. The bucket. Public on purpose: a profile picture is shown in the header on every screen and
--    next to names in lists, so signed urls would mean a refresh loop for a thumbnail. Writing is
--    restricted to the folder named after the caller's own auth id.
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do nothing;

drop policy if exists "profile_pictures_read" on storage.objects;
create policy "profile_pictures_read" on storage.objects
  for select using (bucket_id = 'profile-pictures');

drop policy if exists "profile_pictures_insert_own" on storage.objects;
create policy "profile_pictures_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_pictures_update_own" on storage.objects;
create policy "profile_pictures_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_pictures_delete_own" on storage.objects;
create policy "profile_pictures_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-pictures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

-- ===========================================================================
-- 6. Self-checks -- catalog only, there is no session here to carry a JWT.
-- ===========================================================================
do $$
declare
  v_bad text[] := array[]::text[];
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'picture_url'
  ) then
    v_bad := v_bad || 'app_users.picture_url is missing';
  end if;

  if not exists (select 1 from storage.buckets where id = 'profile-pictures' and public) then
    v_bad := v_bad || 'the profile-pictures bucket is missing or not public';
  end if;

  if exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public'
       and routine_name in ('my_profile', 'set_my_name', 'set_my_picture_url')
       and grantee in ('anon', 'PUBLIC')
  ) then
    v_bad := v_bad || 'anon can still execute one of the profile functions';
  end if;

  if array_length(v_bad, 1) > 0 then
    raise exception '20260911160000 self-check FAILED: %', array_to_string(v_bad, '; ');
  end if;
  raise notice '20260911160000 self-check ok: column, bucket and grants are in place';
end $$;

-- Run from the app with a real session: an address outside our own bucket must be rejected.
--   select public.set_my_picture_url('https://example.com/me.png');
