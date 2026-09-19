-- 0011_storage_foundation — clean foundation: normalized line-items/tax, e-invoice XML kept beside
-- the PDF, uniform soft-delete + change history. Additive + idempotent. Forward-only: existing rows
-- keep their jsonb/bytea and stay readable; a separate un-run backfill migrates them later.
--
-- WHY (Briefing A1 / Screen 2 / Screen 18): key data lived in loose JSON (line items + tax as jsonb),
-- the e-invoice XML was discarded, originals sat as raw bytea, and soft-delete/history existed only on
-- invoices+suppliers. This blocks reporting/DATEV/approval. Here we lay real tables + traceability.
--
-- NOTE: `content` bytea is made NULLABLE (the Storage bucket becomes the source of truth for new
-- writes) but is NOT dropped — the Hub still reads it. Dropping it is the separate, gated
-- 0012_drop_invoice_content.sql, to be applied only after the Hub reads from the bucket.
--
-- Apply: python3 pipeline/apply_migration.py supabase/migrations/0011_storage_foundation.sql

begin;

-- 1. Normalized line items (one row per position) — Briefing A1 "individual line items".
create table if not exists public.invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  position    int,
  description text,
  quantity    numeric,
  unit_price  numeric(12,2),
  amount      numeric(12,2),
  vat_rate    numeric(5,2),
  created_at  timestamptz not null default now()
);
create index if not exists invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id);

-- 2. Normalized tax breakdown (one row per VAT rate) — Briefing A1 "breakdown per rate".
create table if not exists public.invoice_tax (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  rate        numeric(5,2),
  net         numeric(12,2),
  vat_amount  numeric(12,2),
  created_at  timestamptz not null default now(),
  unique (invoice_id, rate)
);
create index if not exists invoice_tax_invoice_idx on public.invoice_tax (invoice_id);

-- 3. e-invoice XML alongside the PDF: relax invoice_files from 1:1 (PK invoice_id) to many-per-invoice
--    keyed by role ('original' | 'xml' | 'rendered'). content -> nullable (bucket is the store now).
alter table public.invoice_files add column if not exists id uuid default gen_random_uuid();
alter table public.invoice_files add column if not exists role text not null default 'original';
update public.invoice_files set id = gen_random_uuid() where id is null;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'invoice_files_pkey') then
    alter table public.invoice_files drop constraint invoice_files_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_files_id_pkey') then
    alter table public.invoice_files add constraint invoice_files_id_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_files_invoice_role_uniq') then
    alter table public.invoice_files add constraint invoice_files_invoice_role_uniq unique (invoice_id, role);
  end if;
end $$;
alter table public.invoice_files alter column content drop not null;
create index if not exists invoice_files_invoice_idx on public.invoice_files (invoice_id);

-- 4. Uniform soft-delete on pipeline-owned record tables (invoices/suppliers already have it).
do $$
declare t text;
begin
  foreach t in array array['companies','properties','business_line','property_assignment',
                           'entity_aliases','vat_rates','ingest_exclusions','invoice_files'] loop
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('alter table public.%I add column if not exists deleted_by text', t);
    execute format('alter table public.%I add column if not exists delete_reason text', t);
  end loop;
end $$;

-- 5. Generic change history for every record type (GoBD, Briefing Screen 18 "uniformly"). The
--    invoice-specific invoice_history stays; this covers all other record types.
create table if not exists public.change_history (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  type        text not null,          -- 'delete' | 'update' | 'create' | ...
  text        text,
  data        jsonb,
  actor       text,
  at          timestamptz not null default now()
);
create index if not exists change_history_record_idx on public.change_history (table_name, record_id);

commit;

-- Sanity:
--   \d public.invoice_files       -- id pk, role, content nullable, unique(invoice_id,role)
--   select count(*) from public.invoice_line_items; select count(*) from public.invoice_tax;
--   select count(*) from public.change_history;
