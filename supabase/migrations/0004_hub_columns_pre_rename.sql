-- 0003 - Hub columns that the pipeline base schema does NOT create.
--
-- WHY: these columns were added by immonetz's pipeline migrations 0001-0007, which are marked
-- ARCHIVAL (they use pre-rename German identifiers and cannot run against an English base).
-- The base schema in 0002 is the PIPELINE's canonical schema and only owns pipeline columns --
-- the Hub's own additions (workflow_status, assignment, soft-delete, storage, supplier contact)
-- live only in those archival files.
--
-- So the ADD COLUMN statements are extracted from them and translated to English using the exact
-- mapping from 0008_rename_to_english.sql. All are , so this is re-runnable.

begin;

alter table public.invoices add column if not exists workflow_status text not null default 'eingegangen';
alter table public.invoices add column if not exists assigned_to text;
alter table public.invoices add column if not exists order_number text;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists paid_at timestamptz;
alter table public.invoices add column if not exists updated_at timestamptz default now();
alter table public.invoices add column if not exists deleted_at timestamptz;
alter table public.invoices add column if not exists deleted_by text;
alter table public.invoices add column if not exists delete_reason text;
alter table public.suppliers add column if not exists bic text;
alter table public.suppliers add column if not exists bank_name text;
alter table public.suppliers add column if not exists phone text;
alter table public.suppliers add column if not exists email text;
alter table public.suppliers add column if not exists contact_person text;
alter table public.suppliers add column if not exists deleted_at timestamptz;
alter table public.suppliers add column if not exists deleted_by text;
alter table public.suppliers add column if not exists delete_reason text;
alter table public.invoice_files add column if not exists storage_bucket text;
alter table public.invoice_files add column if not exists storage_path text;
alter table public.invoice_files add column if not exists checksum_sha256 text;
alter table public.invoices add column if not exists traffic_light text;
alter table public.invoices add column if not exists confidence_score numeric(4,3);
alter table public.invoices add column if not exists already_paid boolean;
alter table public.bank_accounts add column if not exists company_id           uuid references public.companies(id);
alter table public.bank_accounts add column if not exists bank_name       text;
alter table public.bank_accounts add column if not exists banksapi_provider_id text;

commit;
