-- 20260916110000_bank_transactions_list_view.sql
-- Create v_bank_transactions_list, which this Hub has always read but never had.
--
-- Migration 0066 already recorded that the view "only ever existed on immonetz's live database"
-- and that no migration here creates it. The live schema confirms it: there is no such view. So
-- the two places that read it fail against PostgREST today, and have done since they were written:
--
--   src/lib/data/queries.ts            the bank reconciliation KPI tile, the "hat Vorschlag" count
--   supabase/functions/notify-dispatch the same signal for notifications
--
-- The definition is immonetz's (0056_bank_transactions_suggested_match_filter.sql), which is where
-- the reading code came from.
--
-- WHY THE VIEW RATHER THAN A COLUMN: bank_transactions.matching_status is owned by the
-- sync_transaction_matching_status trigger and only ever holds 'offen' | 'zugeordnet' |
-- 'ignoriert'. It flips to 'zugeordnet' only once a match is CONFIRMED, so a transaction carrying
-- an unconfirmed candidate still reads 'offen' and there is no way to filter the list down to
-- "has a suggestion awaiting review". That is a read-derived signal, not something to persist.
--
-- Both match tables are checked. A real transaction only ever has rows in the direction it
-- belongs to (debit to invoice_transaction_matches, credit to outgoing_invoice_transaction_
-- matches), the same convention the matchSummary computation in queries.ts follows.
--
-- `select bt.*` carries every column through unchanged, including the generated ones.
--
-- SECURITY_INVOKER IS NOT OPTIONAL. Without it a view's access to its underlying tables runs as
-- the view's OWNER for RLS purposes, and the owner here is a superuser, who bypasses RLS
-- entirely. Migration 0066 exists because that is what happened: a real employee granted access
-- to exactly one company saw 1445 other-company bank transactions through this very view on
-- another project. Created with the option from the start here.
--
-- Nothing in this view is touched by the table rename: bank_transactions and both match tables
-- keep their names, and none of the columns it reads moves.

begin;

do $preconditions$
begin
    if to_regclass('public.bank_transactions') is null then
        raise exception 'bank_transactions is missing';
    end if;
    if to_regclass('public.invoice_transaction_matches') is null then
        raise exception 'invoice_transaction_matches is missing';
    end if;
    if to_regclass('public.outgoing_invoice_transaction_matches') is null then
        raise exception 'outgoing_invoice_transaction_matches is missing';
    end if;
end $preconditions$;

create or replace view public.v_bank_transactions_list with (security_invoker = true) as
select bt.*,
       (exists (
            select 1 from public.invoice_transaction_matches m
             where m.transaction_id = bt.id and m.status in ('kandidat', 'auto')
        ) or exists (
            select 1 from public.outgoing_invoice_transaction_matches m
             where m.transaction_id = bt.id and m.status in ('kandidat', 'auto')
        )) as has_suggested_match
  from public.bank_transactions bt;

grant all on table public.v_bank_transactions_list to anon;
grant all on table public.v_bank_transactions_list to authenticated;
grant all on table public.v_bank_transactions_list to service_role;

-- Partial indexes for the exact predicate above, so the KPI tile does not sequentially scan both
-- match tables. Mirrors the shape of the existing *_transaction_confirmed_idx indexes.
create index if not exists matches_transaction_suggested_idx
    on public.invoice_transaction_matches (transaction_id)
 where status in ('kandidat', 'auto');

create index if not exists outgoing_matches_transaction_suggested_idx
    on public.outgoing_invoice_transaction_matches (transaction_id)
 where status in ('kandidat', 'auto');

commit;

-- PostgREST answers from a cached schema, so the new view is a 404 until it reloads.
notify pgrst, 'reload schema';
