-- storage.objects carries no write policy for any bucket in this schema, so the browser's own
-- upload (incoming-invoices upload page, and the onboarding practice task's first step) fails with
-- "new row violates row-level security policy" the moment the file reaches storage, before any
-- table is ever touched. The table-level insert policies on documents/document_files already exist
-- and are not the problem. Paste into the Supabase SQL editor as the database owner; safe to run
-- twice. Mirrors mayestate2's own fix for the identical bug (migration
-- 20260819130000_upload_write_policies.sql).

begin;

drop policy if exists documents_bucket_write on storage.objects;
create policy documents_bucket_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'documents' and public.may_write('documents.write'));

drop policy if exists outgoing_invoice_files_bucket_write on storage.objects;
create policy outgoing_invoice_files_bucket_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'outgoing-invoice-files' and public.may_write('documents.write'));

commit;
