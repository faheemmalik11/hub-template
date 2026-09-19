-- 20260827090000_notifications_seen.sql
-- Phase 1 of the notification system (docs/NOTIFICATIONS.md): the header bell needs to know
-- what is NEW for this user, which is "invoices created after the last time they opened the
-- bell". That instant is per user and must survive devices, so it lives on app_users, not in
-- localStorage.
--
-- The write goes through a narrow self-service RPC instead of a self-UPDATE RLS policy on
-- app_users, for the same reason as clear_must_change_password (migration 0048): every existing
-- app_users write policy is admin-only, and a general self-UPDATE policy would open every own
-- column to every authenticated user when this needs exactly one timestamp.
--
-- Every statement is idempotent, so re-running the whole file is safe.

begin;

alter table public.app_users
  add column if not exists notifications_seen_at timestamptz;

comment on column public.app_users.notifications_seen_at is
  'When this user last opened the notification bell. Written only via mark_notifications_seen(). Null = never opened (the bell falls back to a bounded window).';

-- Best-effort by design, unlike clear_must_change_password which must fail loudly: a session
-- whose app_users row is missing or deactivated should not surface an error from a bell click.
-- Edge cases handled:
--   no JWT / no email claim  -> silent no-op (nothing to stamp)
--   no matching app_users row -> silent no-op
--   duplicate rows for one email (data anomaly) -> all stamped, harmless
--   deactivated user          -> stamped; is_active gates the app elsewhere, not this timestamp
create or replace function public.mark_notifications_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''), '');
begin
  if v_email = '' then
    return;
  end if;

  update public.app_users
     set notifications_seen_at = now(),
         updated_at = now()
   where lower(email) = lower(v_email);
end;
$$;

revoke execute on function public.mark_notifications_seen() from public;
revoke execute on function public.mark_notifications_seen() from anon;
grant execute on function public.mark_notifications_seen() to authenticated;

-- The bell polls every 60s per signed-in user. Two partial indexes keep those counts index-only
-- as the invoices table grows:
--   "new since last look": created_at range scan over live rows only.
--   "overdue": due_date range scan; most rows have no due_date at all today, so the partial
--   index stays tiny and the predicate matches the bell's and Offene-Posten's filter shape.
create index if not exists invoices_active_created_at_idx
  on public.invoices (created_at)
  where deleted_at is null and archived_at is null and not_relevant_at is null;

create index if not exists invoices_due_date_idx
  on public.invoices (due_date)
  where due_date is not null;

commit;

-- ---------------------------------------------------------------------------
-- Self-check (run manually, not part of the transaction above):
--
-- do $$
-- begin
--   -- No JWT in a raw SQL session: must be a silent no-op, not an error.
--   perform public.mark_notifications_seen();
--   if not exists (select 1 from information_schema.columns
--                  where table_schema = 'public' and table_name = 'app_users'
--                    and column_name = 'notifications_seen_at') then
--     raise exception 'notifications_seen_at column missing';
--   end if;
--   raise notice 'self-check ok';
-- end $$;
