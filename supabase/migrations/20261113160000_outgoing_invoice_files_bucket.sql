begin;

insert into storage.buckets (id, name, public)
values ('outgoing-invoice-files', 'outgoing-invoice-files', false)
on conflict (id) do nothing;

commit;
