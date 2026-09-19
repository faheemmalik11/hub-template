-- 0016_exclusion_rls — let the Hub manage exclusion rules. `ingest_exclusions` has RLS enabled but NO
-- policies (deny-all for the anon/authenticated API), so the Hub could not read or write it. Add
-- authenticated read + insert + update policies (soft-delete / deactivate happen via UPDATE, so no
-- delete policy is needed). The pipeline keeps writing via service_role, which bypasses RLS. Idempotent.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0016_exclusion_rls.sql

begin;

alter table public.ingest_exclusions enable row level security;

do $$
begin
  execute 'drop policy if exists ingest_exclusions_auth_read   on public.ingest_exclusions';
  execute 'create policy ingest_exclusions_auth_read   on public.ingest_exclusions for select to authenticated using (true)';
  execute 'drop policy if exists ingest_exclusions_auth_insert on public.ingest_exclusions';
  execute 'create policy ingest_exclusions_auth_insert on public.ingest_exclusions for insert to authenticated with check (true)';
  execute 'drop policy if exists ingest_exclusions_auth_update on public.ingest_exclusions';
  execute 'create policy ingest_exclusions_auth_update on public.ingest_exclusions for update to authenticated using (true) with check (true)';
end $$;

commit;

-- Sanity: select polname from pg_policy where polrelid='public.ingest_exclusions'::regclass;
