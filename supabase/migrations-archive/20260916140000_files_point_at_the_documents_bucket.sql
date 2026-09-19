-- 20260916140000_files_point_at_the_documents_bucket.sql
-- The bytes now live in the `documents` bucket, copied object for object out of `receipts` and
-- `belege-files` by scripts/move-buckets-to-documents.ts. This points the file rows and the
-- storage policies at the new name.
--
-- RUN THE COPY FIRST. This migration only moves pointers. Applied before the objects are across,
-- every original 404s.
--
-- The old buckets stay until the Hub has been seen working against the new one. Deleting them is
-- the one irreversible step and it is done by hand, not here.
--
-- Two more things follow the bytes and are NOT in this file, because they live elsewhere:
--   - archive_bucket and the upload channel's bucket in book-keeping
--     config/tenants/staeyhub.json
--   - BUCKET in supabase/functions/pleo-receipts/index.ts, which needs that function redeployed

begin;

do $preconditions$
declare
    rows_to_move   bigint;
    objects_across bigint;
begin
    if to_regclass('public.document_files') is null then
        raise exception
            'document_files is missing. Apply 20260916120000_english_table_names.sql first.';
    end if;

    -- Refuse to run before the copy. `supabase db push` applies every pending migration in
    -- order, so without this guard a push would repoint 2743 file rows at a bucket that is
    -- empty or absent, and every original would 404 with nothing saying why.
    select count(*) into rows_to_move
      from public.document_files
     where storage_bucket in ('receipts', 'belege-files');

    if rows_to_move = 0 then
        raise notice 'no file rows left on the old buckets; nothing to repoint';
        return;
    end if;

    if not exists (select 1 from storage.buckets where id = 'documents') then
        raise exception
            'the documents bucket does not exist. Run scripts/move-buckets-to-documents.ts --commit first.';
    end if;

    select count(*) into objects_across
      from storage.objects where bucket_id = 'documents';

    if objects_across < rows_to_move then
        raise exception
            'documents holds % object(s) but % file row(s) are about to point at it. The copy is not finished.',
            objects_across, rows_to_move;
    end if;
end $preconditions$;

update public.document_files
   set storage_bucket = 'documents'
 where storage_bucket in ('receipts', 'belege-files');

-- The policies name their bucket in the predicate, so a copy leaves `documents` with no policy at
-- all. The Hub reads originals through the service role, which bypasses RLS, but the read policy
-- is what an ordinary signed-in user goes through, and it is what `receipts` had.
drop policy if exists documents_read_authenticated on storage.objects;
create policy documents_read_authenticated
    on storage.objects for select to authenticated
 using (bucket_id = 'documents');

-- The upload screen writes here. `outgoing-invoice-files` keeps its place: those files are not
-- moving. `belege-files` stays in the list until the old buckets are deleted, so an upload that
-- is already in flight does not fail.
drop policy if exists "invoice_files_authenticated_insert" on storage.objects;
create policy "invoice_files_authenticated_insert"
    on storage.objects for insert to authenticated
 with check (bucket_id = any (array['documents', 'belege-files', 'outgoing-invoice-files']));

commit;
