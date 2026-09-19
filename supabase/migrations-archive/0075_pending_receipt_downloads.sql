-- 0075_pending_receipt_downloads — find transactions whose receipt files are not stored yet.
--
-- WHY: the first version of pleo-receipts fetched a fixed window (the oldest N rows), filtered
-- out the ones already done, and downloaded the rest. Once that window was fully downloaded the
-- filter returned nothing and the loop stalled at 197 of ~1,970 files — it never advanced past
-- the window. PostgREST cannot express "transactions with a receipt that has no matching
-- invoice_files row", so the anti-join belongs in SQL.
--
-- It also fixes the progress counter: the old one compared transactions-with-receipts against
-- invoice_files rows, which are different units (one transaction can carry several files), so
-- "remaining" never reached zero.

begin;

create or replace function public.pending_receipt_downloads(p_limit int default 50)
returns table (
  id             uuid,
  external_id    text,
  booking_date   date,
  missing_count  int
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         b.external_id,
         b.booking_date,
         count(*)::int as missing_count
    from public.bank_transactions b
    cross join lateral jsonb_array_elements(b.raw_data->'receipts') as r
   where b.source = 'pleo'
     and jsonb_typeof(b.raw_data->'receipts') = 'array'
     and r->>'id' is not null
     -- the anti-join: this receipt has no stored file
     and not exists (
       select 1 from public.invoice_files f
        where f.transaction_id = b.id
          and f.external_id = r->>'id'
          and f.deleted_at is null
     )
   group by b.id, b.external_id, b.booking_date
   order by b.booking_date nulls last, b.id
   limit greatest(p_limit, 1);
$$;

comment on function public.pending_receipt_downloads(int) is
  'Transactions with Pleo receipts that are not yet stored in invoice_files. Used by the '
  'pleo-receipts function; the anti-join cannot be expressed through PostgREST.';

-- Accurate progress: how many receipt FILES are still missing, not how many transactions.
create or replace function public.pending_receipt_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
    from public.bank_transactions b
    cross join lateral jsonb_array_elements(b.raw_data->'receipts') as r
   where b.source = 'pleo'
     and jsonb_typeof(b.raw_data->'receipts') = 'array'
     and r->>'id' is not null
     and not exists (
       select 1 from public.invoice_files f
        where f.transaction_id = b.id
          and f.external_id = r->>'id'
          and f.deleted_at is null
     );
$$;

revoke all on function public.pending_receipt_downloads(int) from public, anon;
revoke all on function public.pending_receipt_count() from public, anon;
grant execute on function public.pending_receipt_downloads(int) to service_role;
grant execute on function public.pending_receipt_count() to service_role;

commit;
