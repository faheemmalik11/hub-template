-- The sync-log filter options, without reading the log to build them.
--
-- The Hub derived the Event and Level dropdowns by selecting `event, level` from bank_sync_logs
-- with a 5000-row cap and taking the distinct values in JavaScript. That is the one place the sync
-- log really did fetch the whole table: the row list itself has always been paged server side
-- (.range + count exact, 25 rows a request), but the filter options pulled thousands of rows on
-- every open of the dialog, and silently went wrong past the cap -- a level that only appears when
-- something breaks would drop out of the filter exactly once the log grew long enough to need it.
--
-- Invoker rights, deliberately. The function sees what the caller's SELECT policy on bank_sync_logs
-- lets it see, so the options can never name a connection the reader cannot read, and soft-deleted
-- rows stay out of the list the same way they stay out of the table.
create or replace function public.bank_sync_log_facets()
returns table (events text[], levels text[])
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(array_agg(distinct event) filter (where event is not null), '{}'::text[]),
    coalesce(array_agg(distinct level) filter (where level is not null), '{}'::text[])
  from public.bank_sync_logs;
$$;

revoke all on function public.bank_sync_log_facets() from public;
grant execute on function public.bank_sync_log_facets() to authenticated;
