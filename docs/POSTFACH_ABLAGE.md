# Feature: Postfach & Ablage (mailbox + filing intake settings) — `/postfach`

What the client's Briefing Screen 1 asked for ("Source and Destination Folder for both mail and
drive"), what's actually implemented, and what's still open. The screen stores intake config for
`pipeline_new`'s two folder-based channels (`mailbox`, `scan_folder`) — it does not run the
pipeline itself.

## 1. Where the code lives

| Concern                                      | File                                                                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The screen                                   | `src/routes/postfach/index.tsx`                                                                                                                                                                                               |
| Folder tree picker (shared by both sections) | `src/components/postfach/folder-tree-picker.tsx`                                                                                                                                                                              |
| Shared folder-option shape                   | `src/lib/postfach/folder-option.ts`                                                                                                                                                                                           |
| Microsoft Graph mail-folder listing          | `src/lib/graph/mail-folders.server.ts`                                                                                                                                                                                        |
| Dropbox folder listing                       | `src/lib/dropbox/folders.server.ts`                                                                                                                                                                                           |
| `createServerFn` wrappers                    | `src/lib/api/postfach-folders.functions.ts`                                                                                                                                                                                   |
| React Query hooks                            | `src/lib/data/queries.ts` (`useMailSettings`, `useUpdateMailSettings`, `useMailboxFolders`, `useFilingFolders`)                                                                                                               |
| Domain type                                  | `src/lib/data/types.ts` (`MailProvider`, `MailSettings`)                                                                                                                                                                      |
| DB migrations                                | `supabase/migrations/0091_mail_settings_microsoft_dropbox.sql`, `0092_mail_settings_no_move_toggle_return_folders.sql`                                                                                                        |
| Pipeline: channel gating + folder resolution | `pipeline_new/adapters/repo/{mail_config,channels}.py`                                                                                                                                                                        |
| Pipeline: after-extraction move              | `pipeline_new/core/engine/filing.py` (unchanged logic, now actually wired — see §7)                                                                                                                                           |
| Pipeline: not-relevant return                | `pipeline_new/core/engine/not_relevant.py`, `pipeline_new/adapters/repo/receipts.py` (`pending_not_relevant`, `active_siblings_for_message`, `mark_not_relevant_returned`, `configure_not_relevant`/`_return_discarded_item`) |
| Pipeline: Dropbox move capability            | `pipeline_new/adapters/source/dropbox_folder/adapter.py` (`move()`, `files/move_v2`)                                                                                                                                          |

## 2. What changed, and why

Migrations 0026/0044 built `mail_settings` for Google (Gmail + Google Drive), then removed
Microsoft support as a product decision for a previous client context. Neither Gmail nor Google
Drive are used anywhere in this client's actual stack — `pipeline_new/main.py`'s `WIRING` runs
`MAILBOX_PROVIDER=graph` (Microsoft Graph, `accounting@this client.de`) and `DRIVE_PROVIDER=dropbox`
(the this clientBelege app folder). Migration `0091_mail_settings_microsoft_dropbox.sql` replaces the
`google` row with two rows, `microsoft` and `dropbox`, and the Hub side was rewritten to match:
live folder pickers backed by real Graph/Dropbox API calls instead of Google's.

**One wrinkle 0026/0044 didn't have to deal with:** this client's mailbox and filing channels are two
_different_ providers, not one provider serving both like Google did. So `mail_settings.provider
= 'microsoft'` only ever uses that row's `mail_*` columns (its `drive_*` columns stay unused,
default), and `provider = 'dropbox'` only ever uses `drive_*` (its `mail_*` columns stay unused).
The Postfach page reflects this directly: two independent sections, each reading/writing its own
row, each with its own Save button — not one shared form.

## 3. Screen anatomy

`/postfach` renders two sections, each self-contained (`MailboxSection`/`FilingSection` in
`index.tsx`):

- **Mailbox (Microsoft)** — `mail_settings` row `provider='microsoft'`. Fields: `is_active`,
  `mailbox_address` (free text, pre-filled but editable), `mail_source_folders` (multi-select
  folder tree), `mail_processed_folder` (single-select), `mail_return_folder` (single-select —
  where a not-relevant email is handed back to).
- **Ablage / Filing (Dropbox)** — `mail_settings` row `provider='dropbox'`. Fields: `is_active`,
  `drive_source_folders` (multi-select folder tree), `drive_processed_folder` (single-select),
  `drive_return_folder` (single-select — where a not-relevant file is handed back to). No address
  field — Dropbox has no mailbox concept, and the app folder itself is fixed by `DROPBOX_APP_KEY`,
  not user-editable here.

**No "actually move" switch on either section anymore** (migration `0092` dropped
`mail_move_processed`/`drive_move_processed`). Moving is opt-in purely by folder presence: choosing
a processed folder means that channel's successfully extracted receipts get moved there; choosing a
return folder means a not-relevant item gets moved there; leaving either empty means nothing is
touched. Both return-folder fields are real pickers now too (`mail_return_folder` was free text
defaulting to `inbox` before this; there was no `drive_return_folder` at all).

Both folder trees are populated **live** from real API calls (see §4), rendered by the same
`FolderTreePicker` component (renamed from the old Google-only `DriveFolderPicker` — it was always
structurally generic, just named after its one caller).

## 4. How folders are actually fetched

Both listing calls are plain read-only REST calls from `.server.ts` modules (Vite excludes these
from the client bundle), wrapped in `createServerFn`s that require a logged-in Hub user
(`requireSupabaseAuth`) — the underlying app credentials can read the whole mailbox/app folder, so
this must not be reachable by an anonymous request even though folder names aren't sensitive.

- **Microsoft Graph** (`src/lib/graph/mail-folders.server.ts`): app-only client-credentials OAuth
  (`GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`/`GRAPH_CLIENT_SECRET`) gets a token scoped
  `https://graph.microsoft.com/.default`, then walks `/users/{GRAPH_MAILBOX}/mailFolders` and
  recurses into `childFolders` for any folder with `childFolderCount > 0` (Graph's `mailFolders`
  has no arbitrary-depth `$expand` in v1.0), following `@odata.nextLink` for pagination. Returns
  every real folder id + `parentFolderId`, no filtering.
- **Dropbox** (`src/lib/dropbox/folders.server.ts`): refresh-token OAuth
  (`DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN`) mints a short-lived access
  token — or, if `DROPBOX_ACCESS_TOKEN` is set, uses that hand-minted ~4h App Console token
  instead (smoke-test escape hatch, same convention `pipeline_new/.env` documents; a scheduled
  caller must never rely on it). Calls `files/list_folder` with `path: "", recursive: true`
  (paginating via `list_folder/continue`) and returns every folder's `path_display` as its id —
  **a path string, not an internal Dropbox id**, because that's what `pipeline_new`'s
  `DRIVE_SOURCE_FOLDER_ID`/adapter actually consumes. Parent/child nesting for the tree UI is
  derived from the path itself (no parent-id field in Dropbox's API).

## 5. Env keys (two separate copies, same real credentials)

The Hub (`.env`, this app) and `pipeline_new` (`pipeline_new/.env`, the separate Python service)
each need their own copy of the same Microsoft Graph app and Dropbox app credentials — they are
different processes with different `.env` files, not a shared config:

| Key                                                                             | Hub (`.env`)                                                    | `pipeline_new/.env`       |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` / `GRAPH_MAILBOX` | ✅                                                              | ✅                        |
| `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`                                        | ✅                                                              | ✅                        |
| `DROPBOX_REFRESH_TOKEN`                                                         | ❌ blank — blocked on one-time OAuth by `lukas.oldach@this client.de` | ❌ blank, same block      |
| `DROPBOX_ACCESS_TOKEN`                                                          | optional smoke-test token                                       | optional smoke-test token |

Both `.env` files are gitignored (`*.env`). Until `DROPBOX_REFRESH_TOKEN` (or a smoke-test
`DROPBOX_ACCESS_TOKEN`) is set, the filing folder picker fails with a clear German error
(`postfach.filing.ladenFehlgeschlagen`) — the section otherwise renders normally, so `is_active`
and the destination-folder path can still be typed once known.

## 6. Known gaps / not done here

1. **Dropbox is unauthorized** (see §5) — the filing picker cannot list real folders yet, and the
   pipeline's `scan_folder` channel fails at wiring time with a clear config error until
   `DROPBOX_REFRESH_TOKEN` is set.
2. **`mailbox_address` is free text**, not validated against `GRAPH_MAILBOX`. It's stored for
   display/reference; the actual mailbox the Graph call reads is whatever `GRAPH_MAILBOX` is set
   to in `.env`, independent of this field.

Resolved since this doc was first written (kept here as a changelog, not a gap list anymore):

- ~~`pipeline_new`'s config resolver reads a single provider row for both channels~~ — `channels.py`
  now takes the provider per channel (`MAIL_SETTINGS_PROVIDER`/`DRIVE_SETTINGS_PROVIDER` in
  `main.py`'s `WIRING`), and `main.py` gates each channel on its own row's `is_active` before
  `build()` ever runs. See §7.
- ~~No move-on-process implementation~~ — `core/engine/filing.py`'s opt-in-by-folder rule was
  always correct; what was missing was `receipts.py`'s `pending_filing()`/`mark_filed()` actually
  querying/updating `invoices`, plus a `move()` method on the Dropbox adapter (it only had
  read/download before). Both exist now.

## 7. Pipeline-side wiring (added after this doc was first written)

- **Channel gating.** `main.py`'s `execute_run()` calls `channel_settings.is_enabled(conn, cfg,
channel, provider=settings_provider)` right after acquiring the run lock and _before_ `build()`
  — a channel switched off in Postfach & Ablage is skipped without ever constructing a Graph or
  Dropbox client, so it needs no working credentials for that provider at all.
- **After-extraction filing.** `PostgresReceiptStore.pending_filing()`/`mark_filed()` are real
  queries now (previously stubs returning nothing), scoped by `invoices.intake_channel` (`"email"`
  for `mailbox`, `"drive"` for `scan_folder`). `mark_filed()` also repoints
  `invoices.gmail_message_id` to the mover's returned id: Outlook/Graph reissues a **new** message
  id on every folder move (Dropbox's ids, and Gmail's, survive a move) — without this the mailbox
  channel's stored id would go stale the moment anything is ever filed.
- **Not-relevant return.** New `core/engine/not_relevant.py`, called from `main.py` right after
  filing (independently — one failing never blocks the other). Handles the human-review path (the
  Hub sets `invoices.not_relevant_at`, this reads `pending_not_relevant()`, holds the move if
  `active_siblings_for_message()` finds another live receipt from the same mail/scan still under
  review, then moves and stamps `mailbox_reset_at`). A second, synchronous path in `receipts.py`'s
  `persist()` (`configure_not_relevant()`/`_return_discarded_item()`) also returns an
  auto-discarded ("ausgeschlossen") or duplicate ("duplikat") item's source at intake time, since
  those never get an `invoices` row for the queue-based path to find later.
- **Dropbox `move()`.** `files/move_v2`, fetching the item's current name first (Dropbox's move
  API wants a full destination path, not just a folder), `autorename=True` on a name collision.
  Returns the item id unchanged — Dropbox ids survive a move (confirmed in `download()`'s own
  docstring), so no id-repointing is needed for this channel, unlike the mailbox one above.

## 8. Speichern is disabled until something changes (17.08.2026)

The single sticky Speichern in the header is greyed out while the form matches the row the server
returned, so it is only offered when it would actually write — and it goes quiet again after a save,
which is the only confirmation that the write landed and stuck.

Mechanically: each section computes `geaendert` (per-field comparison against `row`, list fields
compared element-wise) and reports it through the save registry's new `setDirty(key, dirty)`. The
header enables the button when `dirtyKeys.size > 0`.

`alleSpeichern` now calls **only the dirty sections**. Both forms write the same `mail_settings`
table through different providers, so saving an untouched section stamped `updated_by`/`updated_at`
on a row nobody had edited — editing Ablage made the mailbox row look freshly changed. Verified
live: editing only the Mail section moved the `microsoft` row's `updated_at` and left `dropbox`
untouched, with one toast rather than two.

`useRegisterSaver` also clears a section's dirty and pending flags on unmount, so a section that
leaves the screen does not keep the button enabled on its behalf.

Same behaviour was added to a sister Hub and to another client's `/buchhaltung/postfach` in the same pass; see
`a sister Hub/docs/audit/postfach/mailbox-settings/ISSUES.md` ("Follow-up round") for the cross-repo
record.
