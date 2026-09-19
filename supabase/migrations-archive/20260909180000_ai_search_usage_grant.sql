-- ai_search_usage was created with no grants at all, matching pipeline_runs' server-only pattern.
-- But the AI search server function inserts through the CALLER's own RLS-scoped client (the
-- publishable/anon key, authenticated as the signed-in user), not a service-role client -- so
-- every insert attempt has been failing silently (caught by the tracking code's own try/catch,
-- which never fails the search itself over a tracking write) and nothing has actually been
-- recorded. No RLS needed: this table has no row-level distinction to make (every authenticated
-- user may log their own usage), and no SELECT/UPDATE/DELETE grant is added -- the app only ever
-- inserts, and reading the log back is an operator/admin concern, not an app one.

begin;

grant insert on public.ai_search_usage to authenticated;

commit;
