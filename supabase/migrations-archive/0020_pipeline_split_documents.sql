-- 0009_split_documents — Process 4 (Bulk Scan & Splitting): parent/child link + page range.
--
-- WHY: a single scan can contain several receipts ("Anja legt fünf Belege auf den Scanner -> ein
-- PDF", Briefing: "muss aufgeteilt werden, sonst zählt nur der erste"). Until now the pipeline read
-- exactly one receipt per file and silently dropped the rest — a missing receipt at month-end.
-- Splitting carves the scan into one child `invoices` row per receipt. To keep the original and its
-- parts linked for the audit trail (GoBD), each child references the parent scan row via
-- `source_document_id`, and `page_range` records which pages of the original the child came from.
-- The parent scan row carries status='aufgeteilt' (a new, non-payable status; `invoices.status` has
-- no CHECK constraint, so the value needs no migration) and holds the full original file.
--
-- Also enables the "no silent failure" rule (Briefing A8): password-protected / unreadable files are
-- routed cleanly to a status='zu_pruefen' row (handled in code, no schema change needed here).
--
-- Additive + idempotent. Apply with:
--   python3 pipeline/apply_migration.py supabase/migrations/0009_split_documents.sql

begin;

alter table public.invoices add column if not exists source_document_id uuid references public.invoices(id);
alter table public.invoices add column if not exists page_range text;
create index if not exists invoices_source_document_idx on public.invoices (source_document_id);

commit;

-- Sanity: \d public.invoices  -- expect source_document_id (uuid, FK -> invoices.id) + page_range (text)
