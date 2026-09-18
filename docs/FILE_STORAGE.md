# File storage (Supabase Storage only)

## The decision

> In the Pipeline the files should only be stored in Supabase. No other storage should be used.
> And the Supabase storage will be used to display on the frontend.

Client instruction, given after the pipeline had been running a "Phase 1 dual-write" (every file
written to both Postgres `bytea` and a Supabase Storage bucket, `content` bytea treated as the
reliable/primary source — see `ai-mail-extraction/docs/TASK-06-storage-foundation.md`). This doc
describes what changed to make Storage the **only** place a new file's bytes are written, and how
the Hub now displays/downloads files from it.

## What's implemented

### Pipeline (`book-keeping`, separate repo)

`ai-mail-extraction`, named elsewhere in this doc, is that repo's former name. Its
`docs/TASK-06-storage-foundation.md` was not carried over to `book-keeping`, so those citations
are historical.

- `pipeline/db.py` (`_attach_and_commit`) — **unconditional now, no env-var switch.** Every
  committed (`commit=True`) upload always goes to Storage; `invoice_files.content` is written as
  `NULL` on success. `storage_bucket`/`storage_path`/`checksum_sha256` are populated instead. The
  old `SUPABASE_STORAGE_ENABLED` flag and `storage.enabled()` function have been removed entirely
  — there is no disabled/bytea-only mode left for a real commit.
- **No fallback on failure for the primary file.** An `'original'`-role upload failure **raises**
  `storage.StorageError` — there is no bytea safety net to quietly drop into, and no config knob
  to disable Storage and get one back. The existing rollback logic (delete any already-uploaded
  objects, roll back the DB transaction) still runs; the receipt is not left half-inserted.
- **The `'xml'` sidecar is still non-fatal.** If it fails to upload, its `invoice_files` row is
  simply skipped (not bytea-fallback-inserted) — it's a nice-to-have alongside the PDF, not the
  primary legal record, so losing the whole receipt over it would be worse than a missing sidecar.
- **The only place `content` bytea is still written at all** is the `commit=False` dry-run path
  (`pipeline/run_local.py`'s default mode, `insert_beleg(..., commit=False)`), which never calls
  Storage in the first place — a dry run is rolled back by its caller, so there's nothing to read
  the bytes back from otherwise.
- Every environment that runs a real ingest now needs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  configured and `python3 pipeline/verify_storage.py --smoke` passing — **run against the live
  project's `belege-files` bucket and confirmed passing** (bucket exists, is private,
  upload/duplicate-rejection/download/delete all work) before this cutover.
- Tests: `pipeline/test_storage_only_write.py` (new) — verifies content stays `NULL` on a
  successful upload, an `'original'` failure raises and rolls back the whole receipt, an `'xml'`
  failure is skipped without losing the PDF, and the `commit=False` dry-run path never calls
  Storage at all and keeps `content` for inspection.

### Hub (this repo) — reading from Storage instead of bytea

The `belege-files` bucket is **private** with no `storage.objects` RLS policies of its own, so the
browser's publishable-key client can never read it directly. Reading now goes through a new
server function instead of the old bytea column:

- **`src/lib/api/invoice-files.functions.ts`** (`getInvoiceFileUrl`) — a `createServerFn` that:
  1. Re-checks the caller can actually see the invoice using **their own RLS-scoped client**
     (`context.supabase` from `requireSupabaseAuth`), via an `invoices!inner(id)` embed on the
     `invoice_files` query. `invoice_files` itself carries a permissive `select ... using (true)`
     policy (predates the `has_company_access()` company-scoping work, migration 0046) — the
     inner join is what actually enforces that boundary for this new read path.
  2. Mints two short-lived (10 min) signed URLs with the **service-role** client
     (`src/integrations/supabase/client.server.ts`, never exposed to the browser): a plain
     **preview** URL (renders inline — used for the PDF iframe / image `src`) and a **download**
     URL with `{ download: <suggested filename> }`, which sets `Content-Disposition: attachment`
     server-side so the browser saves it under the uniform filename convention
     (`docs/FILENAME_CONVENTION.md`) even though the URL is cross-origin (the HTML `download`
     attribute is ignored for cross-origin links, which is why this can't just be a `<a download>`
     the way the old bytea blob URL was).
- **`src/lib/data/queries.ts`** (`useInvoiceFileUrl`) — React Query wrapper around it.
- **`src/components/belege/document-preview.tsx`** — prefers the signed URLs whenever
  `invoice_files.storage_bucket`/`storage_path` are set. Falls back to the old bytea/hex → Blob →
  object-URL path **only** for rows that predate the Storage cutover and have no Storage copy at
  all (no backfill has been run — see "What this doesn't cover" below).
- **`src/lib/data/types.ts`** (`BelegDatei`) — `content` is now `string | null` (was
  non-null); `storage_bucket`/`storage_path`/`role`/`id` added.

### Hub uploads (this repo) — writing to Storage too

Until 2026-08-28 the Hub's own upload screens did **not** follow the decision above. They are the
last piece to move.

- **Incoming** (`src/routes/eingangsrechnungen/upload.tsx`) read the whole file into memory,
  converted every byte to a two-character hex string, and sent the result as JSON to be written
  into `invoice_files.content` as `bytea`. For a 100 MB file that is roughly 100 million short
  strings and a 200-million-character string: well over a gigabyte of browser memory to move
  100 MB, and every byte through PostgREST.
- **Outgoing** (`src/routes/ausgangsrechnungen/hochladen.tsx`) reached Storage, but proxied the
  bytes through a server function as base64, paying a 33% size tax and capping uploads at 15 MB.

Both now upload **browser to Storage directly** via the portable module in
`src/features/file-upload/` (see its `PORTING.md`). The server only writes rows afterwards, from
the filename, size, bucket, path and checksum the browser hands back.

|          | Bucket                   | Rows written by                                    |
| -------- | ------------------------ | -------------------------------------------------- |
| Incoming | `belege-files`           | `src/lib/api/invoice-upload.functions.ts`          |
| Outgoing | `outgoing-invoice-files` | `src/lib/api/outgoing-invoice-upload.functions.ts` |

Both write with the **service-role client**, because `public.invoices` carries no INSERT policy
(only SELECT and UPDATE), so a browser client cannot create an invoice row at all. Both delete the
uploaded object again if the row insert fails, so a failed commit leaves no orphan behind.

Uploads need one RLS policy on `storage.objects`
(`supabase/migrations/20260829091000_storage_upload_policies.sql`): **INSERT only**, for
authenticated users, on those two buckets. Deliberately no select/update/delete — reads stay behind
the signed-URL server functions, and nothing in the browser can overwrite or remove a stored
document.

Two limits are **not** in code and must be set per project: the **Global file size limit** in
Storage Settings caps every bucket, and on the Free plan it cannot exceed 50 MB.

## Operational status

`SUPABASE_STORAGE_ENABLED` no longer exists as a config knob — Storage is mandatory for every real
ingest, in every environment. `python3 pipeline/verify_storage.py --smoke` was run against the
live project's `belege-files` bucket and **passed** (bucket exists, is private, upload/
duplicate-rejection/download/delete all verified) before this cutover — see
`ai-mail-extraction/docs/TASK-06-storage-foundation.md` for the record of that run.

Any environment missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (or pointed at a
misconfigured/public bucket) will now have every real ingest **fail outright** on the `'original'`
file upload rather than silently falling back to bytea — this is intentional (no silent data-loss
mode left), but it does mean a bad `.env` is a hard outage, not a degraded mode. Re-run
`verify_storage.py --smoke` after any credential/bucket change.

## What this doesn't cover

- **AI extraction on outgoing still sends bytes.** `extractOutgoingInvoiceFields` base64s the file
  to read the invoice fields, because the model needs the actual document. That path is capped at
  15 MB; above it the file still uploads and the fields are filled in by hand.
- **No backfill.** The ~115 pre-cutover rows (per `ai-mail-extraction/docs/TASK-06-storage-foundation.md`)
  still only have bytea `content`, no Storage copy. The Hub's bytea fallback keeps them viewable;
  `pipeline/backfill_storage_and_tables.py` (dry-run only, not run) is the staged path to actually
  migrate them, at which point the bytea column itself could eventually be dropped
  (`supabase/migrations/0012_drop_invoice_content.sql` in the pipeline repo, also staged, not run).
  Dropping the column was **not** part of this change — only stopping new dual-writes was.
- **Signed URLs expire** (10 minutes). A preview left open past that won't auto-refresh; reopening
  the invoice detail page re-fetches a fresh one. Not handled as a "regenerate on 403" retry.
- **Company scoping on the read path is new, not retrofitted onto the old one.** The old bytea
  read (`useBelegDatei`, still used for metadata + the legacy fallback) still relies on
  `invoice_files`'s permissive `using (true)` policy and is unchanged by this work — only the new
  signed-URL path enforces `has_company_access()`. Worth closing properly in a follow-up if the
  bytea path outlives the backfill.

## Where to look to verify this against the code

- Pipeline write path: in `book-keeping`, under `src/adapters/db/` and `src/adapters/storage/`.
  Cited here from its old layout, since restructured: `pipeline/db.py` (`_attach_and_commit`),
  `pipeline/storage.py`, `pipeline/test_storage_only_write.py`.
- Hub upload path: `src/features/file-upload/` (`upload.ts`, `config.ts`, `PORTING.md`),
  `src/lib/api/invoice-upload.functions.ts`, `src/lib/api/outgoing-invoice-upload.functions.ts`.
- Hub read path: `src/lib/api/invoice-files.functions.ts`, `src/lib/data/queries.ts`
  (`useInvoiceFileUrl`), `src/components/belege/document-preview.tsx`, `src/lib/data/types.ts`
  (`BelegDatei`).
- Related: `docs/FILENAME_CONVENTION.md` (the uniform naming convention used for the download
  filename), `ai-mail-extraction/docs/TASK-06-storage-foundation.md` (the original Phase-1
  dual-write design this supersedes).
