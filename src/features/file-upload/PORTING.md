# File upload — portable feature folder

Browser-to-Storage uploads, carried between the hub repos (Staeyhub, Immonetz,
Mayestate, …) as a unit. Same rule as `src/features/invoice-detail/`:

> **Every file in this folder except `config.ts` is meant to be byte-identical
> across repos.** All intentional differences live in `config.ts`. If you are
> editing any other file here for one repo only, stop — what you are changing
> is probably config.

Checking for drift between two repos:

```sh
diff -r --exclude=config.ts <repoA>/src/features/file-upload <repoB>/src/features/file-upload
```

## What's in the folder

| File               | Role                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `upload.ts`        | `uploadToStorage()`. The only place that knows the TUS protocol.                                         |
| `useFileUpload.ts` | Queue, progress, cancel, retry. What screens call.                                                       |
| `FileDropzone.tsx` | Drag-and-drop plus per-file progress rows. Labels are passed in, so the folder holds no translated text. |
| `checksum.ts`      | SHA-256 over the file, matching what the Python pipeline writes.                                         |
| `config.ts`        | **The only per-repo file.** Buckets, size limit, accepted types, path shape.                             |

## Why TUS and not `storage.upload()`

Supabase's standard upload is documented as suitable up to **6 MB**. Above that the
resumable (TUS) endpoint is the supported route, and it is the only one that survives a
dropped connection — a 100 MB upload that fails at 95% otherwise starts from zero.

Three settings are fixed by the server and must not be changed:

- `chunkSize` exactly `6 * 1024 * 1024`
- the endpoint is the **direct storage host** (`<ref>.storage.supabase.co`), not the project URL
- `authorization: Bearer <user access token>`

## What each repo must set up

1. **Buckets exist and are private**, named in `config.ts`.
2. **An INSERT-only RLS policy** on `storage.objects` for those buckets. See
   `supabase/migrations/20260828180000_storage_upload_policies.sql`.
   Deliberately no select/update/delete: reads go through a server function that mints
   short-lived signed URLs, so the browser can write a document but never read the bucket,
   overwrite a file, or delete one.
3. **The global file size limit** raised in Storage Settings. It caps every bucket, and on
   the Free plan it cannot exceed 50 MB, so `UPLOAD_LIMIT_BYTES` above that needs Pro.

## What the caller does with the result

`uploadToStorage()` returns `{ bucket, path, filename, mime, sizeBytes, checksumSha256 }`.
The caller writes those onto its own file row (`storage_bucket`, `storage_path`,
`checksum_sha256`, …). This folder never touches the database, which is what keeps it
portable across repos whose table shapes differ.

## The failure mode this replaced

Before this folder, the Hub's incoming upload read the file into memory, converted every
byte to a two-character hex string, joined them, and sent the result as JSON to be stored in
a Postgres `bytea` column. For a 100 MB file that is roughly 100 million short strings and a
200-million-character string, well over a gigabyte of browser memory to move 100 MB. It also
contradicted `docs/FILE_STORAGE.md`, which records the client's instruction that files live
only in Storage.
