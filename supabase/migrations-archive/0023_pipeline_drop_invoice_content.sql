-- 0012_drop_invoice_content — FINAL storage cutover: drop the raw-bytes column.
--
-- ⚠️ DO NOT APPLY YET. This is the staged last step of the storage foundation (0011). It removes
-- invoice_files.content (the bytea copy of the original) so the Supabase Storage bucket is the SOLE
-- source of truth. Apply this ONLY after BOTH are true:
--   1. every existing original has been copied into the bucket
--      (run: python3 pipeline/backfill_storage_and_tables.py --apply  — verify storage_path is set
--       on every invoice_files row first), AND
--   2. the immonetz Hub reads originals from the bucket, not from invoice_files.content
--      (frontend change, separate repo) — otherwise the Hub's document view breaks.
--
-- Until both hold, leave this file unapplied. `content` stays populated by the pipeline as a safety
-- copy in the meantime (it is already nullable as of 0011).
--
-- Apply (only when the two conditions above are met):
--   python3 pipeline/apply_migration.py supabase/migrations/0012_drop_invoice_content.sql

begin;

-- Guard: refuse to drop while any row still lacks a bucket copy (prevents data loss).
do $$
declare n_missing int;
begin
  select count(*) into n_missing from public.invoice_files where storage_path is null;
  if n_missing > 0 then
    raise exception 'Abbruch: % invoice_files-Zeile(n) ohne storage_path — erst Backfill in den Bucket ausführen', n_missing;
  end if;
end $$;

alter table public.invoice_files drop column if exists content;

commit;
