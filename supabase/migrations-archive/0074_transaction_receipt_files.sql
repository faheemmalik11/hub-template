-- 0074_transaction_receipt_files — store receipt DOCUMENTS, not just references.
--
-- WHY: Pleo receipts were being recorded as metadata only (id, mime type, size). The files stayed
-- on Pleo's servers and invoice_files was empty. For GoBD the document itself has to be retained
-- in our system -- a note saying "a receipt exists at Pleo" is not evidence, and it disappears if
-- the Pleo account is closed or the data is purged.
--
-- Pleo's download URLs expire after 24 HOURS, so files must be pulled during a sync run. The
-- pleo-receipts function re-requests fresh URLs each time rather than relying on stored ones.
--
-- DESIGN: reuse invoice_files rather than adding a parallel table. It already carries everything
-- needed (mime, size, checksum, soft-delete with reason for GoBD). The only change is that a file
-- may now hang off a bank_transaction instead of an invoice: a Pleo card purchase IS the receipt,
-- and no invoice record exists for it.

begin;

-- ---------------------------------------------------------------------------
-- 1. A file may belong to an invoice OR a transaction
-- ---------------------------------------------------------------------------
alter table public.invoice_files
  add column if not exists transaction_id uuid references public.bank_transactions(id) on delete cascade;

-- The provider's own file id, so a re-run recognises what it already stored.
alter table public.invoice_files
  add column if not exists external_id text;

alter table public.invoice_files
  add column if not exists source text;

-- invoice_id was NOT NULL, which made transaction-attached receipts impossible.
alter table public.invoice_files alter column invoice_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_files_owner_check') then
    alter table public.invoice_files
      add constraint invoice_files_owner_check
      check (invoice_id is not null or transaction_id is not null);
  end if;
end $$;

-- The old (invoice_id, role) unique index no longer fits: a transaction can carry several
-- receipts, all with role 'original'. Scope uniqueness to the provider's file id instead.
create unique index if not exists invoice_files_source_external_idx
  on public.invoice_files (source, external_id)
  where external_id is not null;

create index if not exists invoice_files_transaction_id_idx
  on public.invoice_files (transaction_id) where transaction_id is not null;

comment on column public.invoice_files.transaction_id is
  'Set when the document belongs to a bank_transaction rather than an invoice -- e.g. a Pleo card '
  'receipt, where the purchase itself is the document and no invoice record exists.';
comment on column public.invoice_files.external_id is
  'The provider''s file id (e.g. Pleo receipt id). Dedup key so re-runs do not store a file twice.';

-- ---------------------------------------------------------------------------
-- 2. Private storage bucket for the documents
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

-- Read for signed-in users; writes only via service_role (the sync). Deliberately not public:
-- these are real financial documents.
drop policy if exists "receipts_read_authenticated" on storage.objects;
create policy "receipts_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

commit;
