-- 0001 - BASE SCHEMA. Source: ai-mail-extraction/pipeline/db_schema.sql.
-- The Python pipeline OWNS these tables; the Hub migrations only extend them.
-- Imported for Staey WITHOUT immonetz master data. Re-sync if the pipeline schema changes.

-- Kanonisches Datenschema für die Eingangsrechnungs-Pipeline (englische Bezeichner ab 0008).
-- Quelle: specs/SPEC-DATENBANK-ANFORDERUNGEN.md. Idempotent (IF NOT EXISTS).
-- Der Hub (anderer Chat) baut die UI/Auth AUF diesen Tabellen auf — nicht neu anlegen.
-- Namen sind seit supabase/migrations/0008_rename_to_english.sql englisch; Index-/Constraint-Namen
-- hier MÜSSEN mit 0008 übereinstimmen, sonst legt ensure_schema() Duplikate an.

create extension if not exists pgcrypto;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);
-- Company seed removed for Staey: these were immonetz's six companies (IMKO/IMGM/JPGB/
-- PNPR/NOGR/IMOS). Staey's five companies come from the client's list (communication
-- thread 1) and must be seeded in a separate Staey-specific migration.
-- Catch-all owner (see supabase/migrations/0010). Whatever cannot be resolved to a real company is
-- assigned to NZO (+ status zu_pruefen) so it stays a VISIBLE bucket in company-grouped evaluations
-- instead of a NULL company that silently disappears (Briefing A3). NZO is a system bucket: it is
-- never seeded into entity_aliases and is excluded from the resolver, so it is never matched FROM a
-- receipt.
insert into companies (code, name) values ('NZO','Nicht zugeordnet') on conflict (code) do nothing;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_id text,
  iban text,
  address text,
  created_at timestamptz default now()
);
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists bic text;
alter table suppliers add column if not exists phone text;
alter table suppliers add column if not exists email text;
alter table suppliers add column if not exists normalized_name text;   -- identity fallback key (see 0005)
create index if not exists suppliers_name_idx on suppliers (lower(name));
create index if not exists suppliers_normalized_name_idx on suppliers (normalized_name);
create index if not exists suppliers_vat_id_idx on suppliers (vat_id);
create index if not exists suppliers_iban_idx on suppliers (iban);
create or replace view v_supplier_duplicates as
  select 'name'::text as key_type, normalized_name as key_value, count(*) as n, array_agg(id order by id) as ids
    from suppliers where normalized_name is not null and normalized_name <> ''
    group by normalized_name having count(*) > 1
  union all
  select 'vat_id', vat_id, count(*), array_agg(id order by id)
    from suppliers where vat_id is not null and vat_id <> ''
    group by vat_id having count(*) > 1;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  company_code text,
  supplier_id uuid references suppliers(id),
  issuer text,
  document_type text default 'Eingangsrechnung',
  document_date date,
  service_date date,
  invoice_number text,
  amount_net numeric(12,2),
  vat_rate numeric(5,2),
  vat_amount numeric(12,2),
  amount_gross numeric(12,2),
  currency text default 'EUR',
  is_small_amount boolean default false,
  intake_channel text default 'email',
  source text,
  property_code text,
  storage_path text,
  ocr_fulltext text,
  status text default 'erkannt',
  extracted jsonb,
  validation jsonb,
  gmail_message_id text,
  created_at timestamptz default now()
);
create index if not exists invoices_document_date_idx on invoices (document_date);
create index if not exists invoices_supplier_idx on invoices (supplier_id);
create index if not exists invoices_status_idx on invoices (status);

-- Leistungszeitraum (von/bis) + Kategorie + Inhalt sauber als Spalten
alter table invoices add column if not exists service_period_from date;
alter table invoices add column if not exists service_period_to date;
alter table invoices add column if not exists cost_category text;
alter table invoices add column if not exists service_description text;
alter table invoices add column if not exists line_items jsonb;       -- Einzelposten
alter table invoices add column if not exists tax jsonb;              -- USt-Aufschlüsselung je Satz
alter table invoices add column if not exists issuer_address text;
alter table invoices add column if not exists recipient_name text;
alter table invoices add column if not exists recipient_address text;
alter table invoices add column if not exists customer_number text;
alter table invoices add column if not exists payment_reference text;
alter table invoices add column if not exists payment_method text;
alter table invoices add column if not exists tax_note text;

-- Erkennungs-Ampel (gruen/gelb/rot) + gedeckelter Konfidenz-Score + "bereits bezahlt"-Merker.
-- Getrennt vom workflow_status (Briefing A6): sagt "wie sicher sind die Daten?",
-- nicht "wo im Freigabe-/Zahlungsweg?". NULL ist erlaubt (Altbestand vor dem Backfill).
alter table invoices add column if not exists traffic_light text;
alter table invoices add column if not exists confidence_score numeric(4,3);
alter table invoices add column if not exists already_paid boolean;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_traffic_light_chk') then
    alter table invoices add constraint invoices_traffic_light_chk
      check (traffic_light in ('gruen','gelb','rot'));
  end if;
end $$;
create index if not exists invoices_traffic_light_idx on invoices (traffic_light);

-- Volltextsuche (deutsch): Nr./Steller (A) + Leistungsbeschreibung/Volltext-Inhalt (B)
-- Additiv: nur anlegen, wenn die Spalte fehlt (kein drop+recreate mehr). Der Hub hat die View
-- v_invoices_list auf dieser Spalte aufgebaut; ein DROP COLUMN schlägt deshalb mit
-- "DependentObjectsStillExist" fehl (siehe Vorfall 2026-07-14). Soll sich die tsvector-Definition
-- künftig ändern, ist das eine bewusste, separate Migration in Abstimmung mit dem Hub-Team
-- (die View müsste dafür mit-migriert werden) — nicht ein impliziter Nebeneffekt von ensure_schema().
alter table invoices add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('german', coalesce(invoice_number,'') || ' ' || coalesce(issuer,'')), 'A') ||
    setweight(to_tsvector('german', coalesce(service_description,'') || ' ' || coalesce(ocr_fulltext,'')), 'B')
  ) stored;
create index if not exists invoices_fts_idx on invoices using gin (fts);

-- Semantische Suche (RAG): pgvector-Embeddings über den Volltext
create extension if not exists vector;
alter table invoices add column if not exists embedding vector(1536);

-- Original-Belege als Datei direkt in der DB (kein Storage-Key nötig; abrufbar)
-- invoice_files: mehrere Dateien je Beleg, unterschieden per `role` ('original' | 'xml' | 'rendered')
-- — E-Rechnungen werden als PDF UND als XML abgelegt (Briefing Screen 2; siehe 0011). Das Original
-- ist (autoritativ) im Storage-Bucket; `content` bytea ist nur noch Übergangs-Kopie und wird per
-- 0012 später entfernt (erst wenn der Hub aus dem Bucket liest).
create table if not exists invoice_files (
  id uuid default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  filename text,
  mime text,
  size_bytes int,
  content bytea,
  role text not null default 'original',
  created_at timestamptz default now(),
  constraint invoice_files_id_pkey primary key (id),
  constraint invoice_files_invoice_role_uniq unique (invoice_id, role)
);

-- Phase 1 (dual-write, additiv/idempotent, siehe supabase/migrations/0003_storage_columns.sql):
-- Original im privaten Bucket "belege-files" ablegen (autoritativ ab 0011).
alter table invoice_files add column if not exists storage_bucket text;
alter table invoice_files add column if not exists storage_path text;
alter table invoice_files add column if not exists checksum_sha256 text;
-- Vorwärts-Migration einer alten 1:1-invoice_files (PK invoice_id) auf das neue Schema (siehe 0011);
-- auf frischen DBs sind diese No-Ops (die CREATE oben legt bereits die neue Form an).
alter table invoice_files add column if not exists id uuid default gen_random_uuid();
alter table invoice_files add column if not exists role text not null default 'original';
alter table invoice_files add column if not exists deleted_at timestamptz;
alter table invoice_files add column if not exists deleted_by text;
alter table invoice_files add column if not exists delete_reason text;
update invoice_files set id = gen_random_uuid() where id is null;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'invoice_files_pkey') then
    alter table invoice_files drop constraint invoice_files_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_files_id_pkey') then
    alter table invoice_files add constraint invoice_files_id_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_files_invoice_role_uniq') then
    alter table invoice_files add constraint invoice_files_invoice_role_uniq unique (invoice_id, role);
  end if;
end $$;
alter table invoice_files alter column content drop not null;
create index if not exists invoice_files_invoice_idx on invoice_files (invoice_id);

-- Normalisierte Einzelposten + USt-Aufschlüsselung (Briefing A1) — zusätzlich zur rohen jsonb-Ablage
-- in invoices.extracted (die als revisionssicherer Rohbeleg erhalten bleibt). Siehe 0011.
create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  position int,
  description text,
  quantity numeric,
  unit_price numeric(12,2),
  amount numeric(12,2),
  vat_rate numeric(5,2),
  created_at timestamptz not null default now()
);
create index if not exists invoice_line_items_invoice_idx on invoice_line_items (invoice_id);
create table if not exists invoice_tax (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  rate numeric(5,2),
  net numeric(12,2),
  vat_amount numeric(12,2),
  created_at timestamptz not null default now(),
  unique (invoice_id, rate)
);
create index if not exists invoice_tax_invoice_idx on invoice_tax (invoice_id);

-- Beleg-Historie (Audit je Beleg; wird von db.soft_delete_beleg geschrieben). Lag bisher nur in
-- Migration 0001/0008 — hier ergänzt, damit ein frisches ensure_schema die Tabelle ebenfalls anlegt.
create table if not exists invoice_history (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  type text not null,
  text text,
  data jsonb,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists invoice_history_invoice_idx on invoice_history (invoice_id);

-- Generische Änderungs-/Löschhistorie für ALLE übrigen Stammdaten-Typen (GoBD, Briefing Screen 18
-- "einheitlich für alle Satzarten"). db.soft_delete()/record_history() schreiben hier. Siehe 0011.
create table if not exists change_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  type text not null,
  text text,
  data jsonb,
  actor text,
  at timestamptz not null default now()
);
create index if not exists change_history_record_idx on change_history (table_name, record_id);

create table if not exists imported_messages (
  gmail_message_id text not null,
  attachment_id text not null default '',
  invoice_id uuid references invoices(id),
  imported_at timestamptz default now(),
  status text default 'ok',
  primary key (gmail_message_id, attachment_id)
);

create table if not exists processing_log (
  id bigint generated always as identity primary key,
  gmail_message_id text,
  subject text,
  sender text,
  status text,
  reason text,
  invoice_id uuid references invoices(id),
  processed_at timestamptz default now()
);

-- RLS: lesen für authenticated (Hub). Schreiben via service_role/DB (umgeht RLS).
do $$
declare t text;
begin
  foreach t in array array['companies','suppliers','invoices','imported_messages','processing_log','invoice_files'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_read on %I', t);
    execute format('create policy auth_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Code <-> name-variant mapping used by resolve_codes.py (structure only; project-specific seed
-- lives in supabase/migrations/0003_entity_aliases.sql). Here so the pipeline is self-contained on reuse.
create table if not exists entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,          -- 'gesellschaft' | 'objekt' | (future types)
  entity_code text not null,          -- canonical code, e.g. 'IMKO'
  alias text not null,                -- raw variant; normalization happens in resolve_codes.py
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now()
);
create unique index if not exists entity_aliases_uniq on entity_aliases (entity_type, entity_code, alias);
create index if not exists entity_aliases_lookup_idx on entity_aliases (entity_type) where is_active;

-- Properties (Objekte/Projekte) + invoices.property_id (see supabase/migrations/0004_objekte.sql).
-- No company column: a property maps to its company via `property_assignment` (property × business
-- line → company), NOT 1:1 — see supabase/migrations/0006_business_lines.sql + 0007.
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  address text,
  vat_status text,                    -- VAT status of the property
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table invoices add column if not exists property_id uuid references properties(id);

-- Process 4 (Bulk Scan & Splitting), see supabase/migrations/0009_split_documents.sql.
-- A single scan can hold several receipts ("Anja legt fünf Belege auf den Scanner -> ein PDF";
-- Briefing: "muss aufgeteilt werden, sonst zählt nur der erste"). Splitting carves the scan into
-- one child invoices row per receipt; the children link back to the parent scan row
-- (status='aufgeteilt') via source_document_id, and page_range records which pages of the original
-- each child came from (GoBD-Nachvollziehbarkeit: Original und Teile bleiben verknüpft).
alter table invoices add column if not exists source_document_id uuid references invoices(id);
alter table invoices add column if not exists page_range text;
create index if not exists invoices_source_document_idx on invoices (source_document_id);

-- Geschäftsbereiche (business lines) — the segment a property is used in. See
-- supabase/migrations/0006_business_lines.sql. Briefing Part 1 / Screen-7 DFD (Process 7.3): a
-- property does NOT map 1:1 to a company; it maps via (property × business line) → company. VAT
-- hangs on the business line (sale = tax-exempt, rental = partly liable), not on the property.
create table if not exists business_line (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- LTR | STR | DEV | SVC
  name text not null,                 -- canonical German name
  name_en text,                       -- English (briefing terminology)
  vat_treatment text not null,        -- steuerpflichtig | steuerfrei | gemischt (same vocab as properties.vat_status)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_line_vat_chk') then
    alter table business_line add constraint business_line_vat_chk
      check (vat_treatment in ('steuerpflichtig','steuerfrei','gemischt'));
  end if;
end $$;
insert into business_line (code, name, name_en, vat_treatment) values
  ('LTR','Dauervermietung (Buy & Hold)',              'Long-term rental',    'gemischt'),
  ('STR','Kurzzeitvermietung (Rent-to-Rent)',         'Short-term rental',   'steuerpflichtig'),
  ('DEV','Immobilien-Entwicklung zum Verkauf',        'Development for sale','steuerfrei'),
  ('SVC','Immobilien-Optimierung als Dienstleistung', 'Services',            'steuerpflichtig')
on conflict (code) do nothing;

-- property × business line → company. The junction that resolves a receipt's company once its
-- property and business line are known (DFD 7.3). UNIQUE (property_id, business_line_id): exactly
-- one company per property-and-line ("a single assignment resolves cleanly"). The SAME property
-- may appear under several business lines with different companies — e.g. BEDO27/GRNE are
-- long-term rental (PNPR) AND short-term rental (IMKO); this is why a 1:1 property→company link
-- is not enough and this table is authoritative for resolution.
create table if not exists property_assignment (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  business_line_id uuid not null references business_line(id),
  company_id uuid not null references companies(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, business_line_id)
);
create index if not exists property_assignment_property_idx on property_assignment (property_id);
create index if not exists property_assignment_company_idx  on property_assignment (company_id);
create index if not exists property_assignment_bl_idx       on property_assignment (business_line_id);

-- Derived company/VAT assignment on the receipt (see supabase/migrations/0010). Company is resolved
-- via property × business line → company (property_assignment above); vat_treatment is the business
-- line's treatment (Briefing Screen 5: "VAT hangs on the business line"). assignment_source records
-- HOW the company was found (property_assignment | property_assignment+name | name | unresolved) for
-- transparency on Screen 3. vat_treatment has NO check constraint so 'unbekannt' is allowed alongside
-- steuerpflichtig|steuerfrei|gemischt.
alter table invoices add column if not exists vat_treatment      text;
alter table invoices add column if not exists business_line_id   uuid references business_line(id);
alter table invoices add column if not exists business_line_code text;
alter table invoices add column if not exists assignment_source  text;
create index if not exists invoices_business_line_idx on invoices (business_line_id);

-- RLS: read for authenticated (Hub); the pipeline writes via service_role (bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['business_line','property_assignment'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_read on %I', t);
    execute format('create policy auth_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Valid VAT rates the validation gate accepts (see supabase/migrations/0006_vat_rates.sql). Editable rows.
create table if not exists vat_rates (
  id uuid primary key default gen_random_uuid(),
  country text,
  rate numeric(5,2) not null,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vat_rates_country_rate_idx on vat_rates (country, rate);
insert into vat_rates (country, rate, note) values
  ('DE',19,'Germany standard'),('DE',7,'Germany reduced'),('DE',0,'Germany zero / exempt'),
  ('ES',21,'Spain standard'),('ES',10,'Spain reduced'),('ES',4,'Spain super-reduced')
on conflict (country, rate) do nothing;

-- Recipients/terms NOT to import yet (see supabase/migrations/0008_ingest_exclusions.sql). Editable rows;
-- the pipeline skips a matching invoice before creating an invoice row (source untouched, nothing deleted).
-- `scope` decides WHERE the term is matched:
--   'party'    (default) — the extracted recipient/issuer NAME, matched AFTER the AI read (legacy behaviour).
--   'sender'   — the mail From: header, matched BEFORE the AI read (skips the OpenAI cost).
--   'subject'  — the mail subject line, matched before the read.
--   'filename' — the attachment/file name, matched before the read.
--   'envelope' — any of sender/subject/filename, matched before the read.
create table if not exists ingest_exclusions (
  id          uuid primary key default gen_random_uuid(),
  term        text not null,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now()
);
alter table ingest_exclusions add column if not exists scope text not null default 'party';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ingest_exclusions_scope_chk') then
    alter table ingest_exclusions add constraint ingest_exclusions_scope_chk
      check (scope in ('party','sender','subject','filename','envelope'));
  end if;
end $$;
-- Uniqueness is per (term, scope) so the same term may exist in more than one scope. The old
-- term-only unique index is dropped in favour of the composite one.
drop index if exists ingest_exclusions_term_uniq;
create unique index if not exists ingest_exclusions_term_scope_uniq
  on ingest_exclusions (lower(term), scope);
insert into ingest_exclusions (term, scope, note) values
  ('Mieteinander',      'party', 'Out of scope for now (client decision 2026-07-10)'),
  ('Miteinander',       'party', 'Common misspelling of Mieteinander'),
  ('Mieteinander GmbH', 'party', 'Out of scope for now (client decision 2026-07-10)')
on conflict (lower(term), scope) do nothing;

-- Einheitliches Soft-Delete auf allen pipeline-eigenen Stammdaten-Tabellen (GoBD, Briefing Screen 18).
-- invoices/suppliers/invoice_files haben die Spalten bereits; hier die übrigen. Additiv/idempotent.
-- Hub-eigene Tabellen (bank_*, mailbox_*, tenants, roles, …) werden bewusst NICHT hier angefasst.
do $$
declare t text;
begin
  foreach t in array array['companies','properties','business_line','property_assignment',
                           'entity_aliases','vat_rates','ingest_exclusions'] loop
    execute format('alter table %I add column if not exists deleted_at timestamptz', t);
    execute format('alter table %I add column if not exists deleted_by text', t);
    execute format('alter table %I add column if not exists delete_reason text', t);
  end loop;
end $$;

-- Pipeline-Lauf-Heartbeat für das Health-Panel (Briefing Betrieb/Monitoring: "running / last run /
-- errors"). Jeder Ingest-Lauf schreibt hier eine Zeile. Siehe supabase/migrations/0013_pipeline_runs.sql.
create table if not exists pipeline_runs (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,                         -- 'email' | 'drive' | 'upload'
  status          text not null default 'running',       -- 'running' | 'ok' | 'error'
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  processed_count int not null default 0,
  error_count     int not null default 0,
  ki_used         int not null default 0,
  note            text
);
create index if not exists pipeline_runs_source_started_idx on pipeline_runs (source, started_at desc);
create index if not exists pipeline_runs_started_idx on pipeline_runs (started_at desc);
do $$
begin
  execute 'alter table pipeline_runs enable row level security';
  execute 'drop policy if exists auth_read on pipeline_runs';
  execute 'create policy auth_read on pipeline_runs for select to authenticated using (true)';
end $$;

-- Drive file edited in place after it was already imported (same file id, same filename, new
-- content): content_hash lets ingest_drive.py tell that apart from an unrelated re-run. NULL on
-- every existing row (Gmail, uploads, pre-migration Drive) means "nothing to compare" — treated as
-- unchanged. See supabase/migrations/0023_imported_messages_content_hash.sql.
alter table imported_messages add column if not exists content_hash text;

-- Briefing Screen 2 (subject, sender, mail text, send date) — body/sent_at were the two missing
-- pieces: subject/sender already wrote to processing_log, body_text was already extracted in
-- gmail_source.get_message() but only used transiently, and send date was never parsed at all. NULL
-- on every existing row; the Hub frontend treats that as "not available" for that historic entry.
-- See supabase/migrations/0024_processing_log_email_metadata.sql.
alter table processing_log add column if not exists body text;
alter table processing_log add column if not exists sent_at timestamptz;
