# Filename convention (uniform receipt naming)

## What the briefing asked for

> Suggest a uniform filename. Pattern (example): `YYYYMMDD COM[_VAT] Issuer Description [Amount]
[Property]` → `20260315 IMKO_UST Sanitär Müller Sanitärinstallation 4.850,00 KLMUE4.pdf`. The
> receipt type is not in the name — it results from the folder. The naming logic is configurable
> in the admin area (structural + descriptive) and is derived from the existing Drive filenames
> (fastest path, adjustable later).

Also relevant — Appendix A8 (quoted in `docs/TRASH_AND_DELETE.md:54-61`), which this
implementation follows:

- Name collision → append a counter, never overwrite.
- Umlauts in codes (`KLMÜ4`) → transliterate for URLs/DATEV import (`KLMUE4`).

## What's implemented

### Hub (this repo)

- **`supabase/migrations/20260804090000_filename_settings.sql`** — a singleton config table
  `public.filename_settings` (`id boolean primary key default true check (id)`, so at most one row
  can ever exist). Columns: `separator`, `vat_suffix`, `include_vat_suffix`, `include_amount`,
  `include_property`, `description_source` (`service_description` | `cost_category` | `none`),
  `transliterate_umlauts`. RLS: any authenticated user can `select`; only `is_admin()` can
  `update` (same admin gate as the rest of the admin screens, migration 0046).
- **`src/lib/data/types.ts`** — `FilenameSettings`, `FilenameDescriptionSource`.
- **`src/lib/data/queries.ts`** — `useFilenameSettings()` (read), `useUpdateFilenameSettings()`
  (admin write). Both go through the untyped `sb` cast since `filename_settings` postdates the
  generated `Database` type, same convention as every other table added since.
- **`src/lib/filename.ts`** — `buildSuggestedFilename(beleg, settings, extension?)`, the pure
  builder function. Order is fixed to match the briefing's pattern; `FilenameSettings` controls
  which optional parts appear and where the description text comes from. Returns `null` when
  there isn't enough data yet (e.g. a receipt still awaiting AI extraction) so callers can fall
  back to the original filename.
- **`src/routes/dateibenennung/index.tsx`** — the admin screen (nav: Verwaltung → Dateibenennung,
  admin-role-gated in the nav same as Team/Papierkorb — real enforcement is the RLS `update`
  policy above, the nav entry is just UX). Structural fields (separator, which optional parts are
  on) + descriptive field (what feeds the description slot), with a live preview built from the
  client's own example values.

### The USt-Kennzeichen is off for this client

Saskia asked for it at the 09.09.2026 meeting (30:16): she did not know what the field was for,
and for this client the answer never varies — always VAT at this client, never at the other companies — so the
toggle only asked people to decide something they had no basis to decide. She could not turn it
off herself because the screen is gated by `PERMISSIONS.pageDateibenennung`.

What was done, and deliberately not done:

- `supabase/migrations/20260911240000_filename_drop_vat_suffix.sql` sets `include_vat_suffix` to
  false on the single settings row.
- `ZEIGE_UST_KENNZEICHEN` in `src/routes/dateibenennung/index.tsx` hides the suffix input and its
  toggle, and takes the suffix out of the Save validation so a hidden field can never be the
  reason Save is dead.
- **The columns and `filename.ts` are unchanged.** Other real-estate clients want the suffix, and
  the column default stays `true` so a fresh tenant still gets it. Re-enabling for this client is one
  boolean plus one update.
- **`src/components/belege/document-preview.tsx`** — accepts an optional `beleg` prop; when
  present (wired from `src/routes/eingangsrechnungen/$nr.tsx`), the preview/download filename is
  the computed suggested name instead of the raw uploaded filename, extension taken from the
  original file.

### Pipeline (`book-keeping`, separate repo)

- **`pipeline/filename.py`** — `fetch_settings(cur)` reads the same `filename_settings` singleton
  row (falls back to the migration's defaults if the table/row is missing, e.g. an older DB
  snapshot); `build_name(cur, beleg_id)` re-reads the invoice row **after** `apply_rules_at_intake`
  has run, so the name reflects the final, post-rule `cost_category`/`company_code`/etc. — not
  the AI's raw pre-rule guess. Mirrors `src/lib/filename.ts`; keep both in sync if the pattern
  changes.
- **`pipeline/storage.py`** — `build_path()`/`upload()` accept an optional `readable_name`; when
  given, it replaces the original upload filename as the input to the existing `_readable_stem()`
  sanitizer (ASCII-fold, umlaut transliteration, unsafe-char stripping, 80-char cap — unchanged,
  reused as-is). The unique identifier is still `file_id` (a fresh uuid4), exactly as before — the
  readable part has never been, and still isn't, load-bearing for uniqueness.
- **`pipeline/db.py`** — `_attach_and_commit()` computes `readable_name` via
  `filename.build_name(cur, beleg_id)` for the `role="original"` upload only (not the `xml`
  sidecar), right before calling `storage.upload(...)`.

## What this does and doesn't cover

- **Does**: compute a uniform, admin-configurable name (a) as the Hub's download/preview filename
  for any invoice with a `beleg` in scope, and (b) as the human-readable part of the path every
  newly ingested file gets in Supabase Storage (bucket `belege-files` — unconditional now, no
  on/off switch; see `docs/FILE_STORAGE.md` and `pipeline/storage.py`).
- **Doesn't**: rename files already sitting in Storage from before this change (`build_path()` is
  only called for new uploads, same as before), and doesn't touch Google Drive. Drive is a
  **read-only ingestion source** in the current pipeline architecture (`pipeline/drive_source.py`
  has no write/create/update calls) — files are never renamed or moved there, so the briefing's
  "rename and move the Drive file" phrasing (Appendix A8, written when Drive itself was assumed to
  be the store) doesn't apply to how the pipeline actually works today. The durable store is
  Supabase Storage (or, for the not-yet-migrated bytea path, `invoice_files.content`), not Drive.
- **Collision handling**: not implemented. `storage.upload()` already refuses to overwrite
  (`x-upsert=false`) but does not append a counter on conflict — a naming collision today fails
  the upload rather than resolving it per Appendix A8. Flagging as an open gap, not silently
  covered.
- **Description source at ingest time**: if an admin sets `description_source = 'cost_category'`
  and no rule/AI guess has produced a category yet, the description slot is simply omitted (same
  "return null instead of a placeholder" behavior as every other missing field) — not treated as
  an error.

## Where to look to verify this against the code

- Migration: `supabase/migrations/20260804090000_filename_settings.sql`.
- Builder + types: `src/lib/filename.ts`, `src/lib/data/types.ts` (`FilenameSettings`).
- Admin screen: `src/routes/dateibenennung/index.tsx`.
- Wiring: `src/components/belege/document-preview.tsx`, `src/routes/eingangsrechnungen/$nr.tsx`.
- Pipeline: in `book-keeping`, under `src/adapters/storage/` and `src/adapters/db/`. Cited here
  from its old layout, since restructured: `pipeline/filename.py`, `pipeline/storage.py`,
  `pipeline/db.py` (`_attach_and_commit`).
- Roadmap status: `docs/PROJECT-ROADMAP.md` Step 6.
