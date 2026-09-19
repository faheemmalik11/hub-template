-- Something outside this migration history granted ALL (select/insert/update/delete) on
-- ai_search_usage to anon and authenticated, and inconsistently enabled row level security with
-- no policy -- the combination left the table either wide open to anyone unauthenticated (anon
-- has ALL, no RLS blocking it) or completely unusable (RLS enabled, zero policies, blocks every
-- role including the app's own authenticated insert). Neither is the intended shape.
--
-- Locking down to the least privilege the app actually needs: authenticated may INSERT its own
-- usage rows and nothing else (no read-back, no update, no delete from the app); anon gets
-- nothing; service_role keeps full access (it bypasses RLS regardless, kept for tooling/ops).
-- RLS stays enabled with an explicit INSERT policy, so this keeps working even if whatever
-- enabled RLS elsewhere runs again.

begin;

revoke all on public.ai_search_usage from anon;
revoke all on public.ai_search_usage from authenticated;
grant insert on public.ai_search_usage to authenticated;

alter table public.ai_search_usage enable row level security;

drop policy if exists "authenticated can insert usage rows" on public.ai_search_usage;
create policy "authenticated can insert usage rows"
  on public.ai_search_usage
  for insert
  to authenticated
  with check (true);

commit;
