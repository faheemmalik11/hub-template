-- What the ingestion pipeline's provisioning would have recorded, had it built this database.
--
-- The pipeline keeps a ledger of the setup steps it has applied, and the admin panel reads it to
-- decide whether a client's database is ready. A database built from this schema has every table
-- and column those steps create, but no ledger saying so, and the panel then treats a finished
-- database as an unfinished one: it refuses to read the stored credentials, and every source
-- reports that it still needs something.
--
-- So the steps are recorded here, by the ids the pipeline uses. The claim is only honest because
-- scripts/check-pipeline-columns.mjs holds this schema to the pipeline's own column list; if that
-- check ever fails, this file is asserting something untrue and the failure is the warning.

begin;

create table if not exists public.schema_migrations (
    id text primary key check (length(btrim(id)) > 0),
    applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

insert into public.schema_migrations (id) values
  ('0001_tenant_settings'),
  ('0002_channels'),
  ('0003_master_data'),
  ('0004_documents'),
  ('0005_credentials')
on conflict (id) do nothing;

commit;
