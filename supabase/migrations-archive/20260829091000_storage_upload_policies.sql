begin;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects not found; is this a Supabase project?';
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('belege-files', 'belege-files', false),
       ('outgoing-invoice-files', 'outgoing-invoice-files', false)
on conflict (id) do nothing;

drop policy if exists "invoice_files_authenticated_insert" on storage.objects;
create policy "invoice_files_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('belege-files', 'outgoing-invoice-files'));

comment on policy "invoice_files_authenticated_insert" on storage.objects is
  'Upload only. Deliberately no select/update/delete policy: reads stay behind the server '
  'functions that mint short-lived signed URLs after re-checking the caller can see the invoice, '
  'and nothing in the browser may overwrite or remove a stored document.';

commit;
