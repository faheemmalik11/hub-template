# How this Hub links to book-keeping

What the Hub (this repo) and book-keeping (`github.com/fabiantscheu-ship-it/book-keeping`,
`../book-keeping` locally) actually share, how a document gets from a mailbox into `documents`,
and — the part that keeps getting re-discovered from scratch — where mailbox credentials live and
why the Hub can never read them. Written up after a live investigation against a real client's own
project on 2026-11-10, verified against the real schema and the real code, not inferred. Which
project that was is recorded on that client's own branch, not here.

## Three separate things, not one system

1. **This Hub** (hub-template, cloned or branched per client) — a browser app on the client's own
   Supabase project. Reads and lightly writes `documents`, `channels`, `channel_folders`,
   `tenant_settings`, `pipeline_runs`, `processing_log`. Never holds a mailbox password.
2. **book-keeping** — a Python pipeline that actually connects to mailboxes/Dropbox/uploads, runs
   OCR + AI extraction, and writes the results into step 1's same Supabase project. Lives on its own
   server, cron-driven. Not in this repo.
3. **book-keeping's own admin registry** — a *separate* Supabase project
   (`book-keeping-admin-dashboard`, ref `ljebvnhfbqrulcjpiemf`), not any client's own project. Holds
   every tenant's `TENANT_DB_URL`, its schedule, and (see below) a copy of its real credentials. The
   admin panel (`book-keeping-wt.vercel.app`, repo `superadmin_panel_WTdigital`) reads and writes
   this registry directly — it is book-keeping's own internal tool, not a Hub, and not part of this
   repo.

A tenant's own Supabase project (what the Hub reads) and the admin registry (what book-keeping's own
team uses) are two different databases, on two different Supabase projects, always — but credentials
are deliberately stored in **both**, each independently encrypted (see below), not registry-only. Do
not assume a secret is absent from a client's own database without checking its `public.credentials`
table specifically — `channels.settings` and `tenant_settings.secrets` are not the only places one
can live.

## Why the Hub can never browse an IMAP mailbox's folders live

Verified directly against a real client's live project — first wrongly assumed the credential
wasn't in the tenant's own database at all, then found it was, so recording both what's true and
how it was checked:

```
channels: [{"key":"email_imap","kind":"mailbox","provider":"imap","settings":{}}]
tenant_settings.secrets: OPENAI_API_KEY, PROPSTACK_API_KEY, SUPABASE_SERVICE_ROLE_KEY
                         (each an encrypted "v2.…" envelope)
public.credentials:      (channel_key, name, value) — DOES hold IMAP_PASSWORD, IMAP_HOST,
                         IMAP_USERNAME for channel_key = 'email_imap', value itself a "v2.…"
                         Fernet envelope, not plaintext.
```

**The mailbox password lives in the client's own Hub database after all** — in a dedicated
`public.credentials` table (`migrations`/provisioning step `0005_credentials`,
`adapters/db/provisioning/credentials.py`), not in `channels.settings` or `tenant_settings.secrets`
(checking only those two was the mistake the first time around). `rekey-credentials`'s own docstring
confirms the design: "Both homes are moved: the admin database, which the pipeline reads, and the
client's own database, which its Hub reads" — credentials are deliberately kept in *both* places.

The real boundary is two layers, not "which database":
1. **RLS** — `credentials` has row-level security enabled with zero policies granted
   (`locked_to_the_pipeline` in `adapters/db/provisioning/__init__.py`). The Hub's own `anon`/
   `authenticated` PostgREST keys get nothing from this table at all, ever — only a service-role
   connection (which bypasses RLS) can read a row.
2. **Encryption** — even a row read via the service-role key is ciphertext. `value` is encrypted with
   a per-tenant Fernet key (`rekey-credentials`, `composition/config/tenant_keys.py`), and that
   tenant key is itself encrypted with a master key (`SECRET_ENCRYPTION_KEY`) that lives only in
   book-keeping's own server deployment config — never shipped into any Hub's `.env` or code.

So: the Hub's own normal application code has no path to this table (RLS) and no path to the
decryption key (it isn't anywhere in this repo or a Hub's `.env`) even if it somehow read the
ciphertext. That is the actual reason it never holds a usable mailbox password, not "the password
isn't in this database" — correct that if you find it written the other way anywhere else.

Separately, hub-template's own folder-browsing code
(`src/hub/adapters/document-sources.ts`, `providerSupportsFolderBrowsing()`) only ever calls
Microsoft Graph. There is no IMAP folder-listing code in this repo, and none in `staeyhub` either
(checked directly — its `channels` table has no `provider` column at all, because none of its real
clients are on plain IMAP, so the gap never surfaced there). book-keeping itself *does* have real
IMAP folder-listing code (`src/adapters/inbound/imap_mail/client.py`, class `ImapMailSource`,
method `.folders()` — returns `(name, delimiter)` for every real folder) and the admin panel uses it
live. So the capability exists, just not reachable from a Hub today.

**The fix, not yet built**: extend the Hub's existing "Run now" request-queue pattern (below) with a
new request kind that asks book-keeping to list folders and write the answer back onto the tenant's
own database — the Hub still never touches the password, book-keeping still does the only real
connecting, and the result reaches the Hub the same asynchronous way a "Run now" press already does.

## The "Run now" request-queue pattern (and its real gap)

This is the *only* channel a Hub has to ask book-keeping to do anything, because book-keeping has no
inbound port a browser app could call: the Hub writes a row into its own database, and book-keeping
(which already has an outbound connection to it) notices and acts.

- Table: `public.pipeline_run_requests`, defined in book-keeping's own
  `migrations/tenant/0009_run_requests.sql` (status `pending → running → done|failed`), extended by
  `migrations/tenant/0012_a_request_can_name_its_folders.sql` (`folders`, `folder_names` columns) and
  later tenant migrations (`0014` run cost, `0015` read-inside-folder, `0016` reading instructions,
  `0017` upload-starts-a-property).
- RPC: `public.ask_for_a_run(wanted_channel, wanted_folders?, wanted_folder_names?)` — what
  `src/data/pipeline/pipeline.ts`'s `useAskForARun()` calls. A second identical ask returns the
  request already waiting (`on conflict do nothing` + a partial unique index).
- A trigger (`pipeline_run_requests_ring`) does `pg_notify('pipeline_run_requested', …)` so
  `bookkeeping serve --listen` is told rather than having to poll every tenant every minute.
- The Hub polls `useRunRequests()` (3s interval while anything is open) rather than using Realtime
  for the read side; the notify is only for waking up book-keeping's own listener.
- **`useRunRequests()` degrades silently** if the table doesn't exist yet (`if (error) return {}`) —
  by design, so a client not yet on this migration just never shows the button, rather than erroring.

**Real, verified gap**: `pipeline_run_requests` does **not exist on a client database that predates
this migration** — confirmed via `supabase db dump --linked` against a real client project on
2026-11-10 (the table list has `channels`, `channel_folders`, `channel_state`, `pipeline_runs`,
`processing_log`, `tenant_settings`, `schema_migrations` — no `pipeline_run_requests`, no
`package_migrations`); which client that was, and whether it is still true of them, is on that
client's own branch. So "Run now" does not actually work on such a database, and any new request
kind (like "list folders") needs the base migration applied first, not just the new one.

### How these migrations actually get applied — and the part that is still manual

`migrations/tenant/*.sql` are **not** applied by any book-keeping CLI command. Checked directly:
`src/cli/main.py`'s full command list is `run, due, serve, reprocess, documents, requests, chasing,
tasks, tenants, bookmarks, trim_config, options, provision_tenant, rekey_credentials` — nothing reads
`migrations/tenant/`. `provision-tenant` (the one command that does apply SQL to a tenant) reads from
`schema/` instead (the Hub's *own* schema, vendored in from hub-template by
`scripts/sync_hub_schema.py` — see below), via `adapters/db/provisioning/__init__.py`'s
`statements_of()`. The `migrations/tenant/0009…` file's own header says "Apply once per client
project" — this is a by-hand step (psql, or the Supabase SQL editor), done per client when that
feature is rolled out to them, not something that happens automatically when a tenant is created or
when book-keeping itself is upgraded. A client's absence of a migration is normal until someone
runs it for that client specifically — check before assuming it is there.

## Provisioning a brand-new tenant

1. `scripts/sync_hub_schema.py [path/to/hub-template]` — runs hub-template's own
   `node scripts/build-baseline.mjs`, then copies the generated baseline, `catalogue.sql`, and every
   `supabase/schema/*.sql` file into book-keeping's `schema/hub/` (or `schema/hub-kinds/<kind>/` for
   a non-accounting client kind). This is how book-keeping stays in step with this repo's schema
   without a second hand-kept copy — the Hub schema is defined once, here, and vendored in.
2. `bookkeeping provision-tenant --db-url <tenant-db-url> [--step <name>] [--kind <kind>]` — applies
   whichever of `tenant_settings, credentials, channel_tables, master_data_tables, document_tables`
   that tenant's database is still missing, tracked by its own ledger so re-running changes nothing
   already done.
3. Any of book-keeping's own `migrations/tenant/*.sql` features (run-now, folder-reading-instructions,
   upload-starts-a-property, …) — applied by hand, per client, whenever that client is meant to get
   that feature. There is no single command that brings a tenant fully up to date; check
   `package_migrations` on that tenant's own database against the files in `migrations/tenant/` to
   see what is actually missing before assuming it is there.

## How multiple tenants run on one book-keeping deployment

One codebase, one server, every client's config and credentials centralized in the admin registry —
never a client's own project:

- **`bookkeeping due`** — one crontab line, run every minute on the server. Connects once to the
  **admin registry** (`bootstrap.admin_session`), asks which tenants' own schedule (stored in the
  registry, a cron-like spec plus timezone, resolved by `adapters/scheduling/cron_times.next_fire`)
  has come due, then launches each due tenant **in its own OS process**
  (`ThreadPoolExecutor(max_workers=args.at_once)`, default 4 at once) — "one client's long backlog
  never delays another's time." A minute with nobody due costs one query against the registry and
  touches no tenant's own database and decrypts no credential.
- **`bookkeeping serve --listen`** — a second, long-running process. Per tenant, connects to *that
  tenant's own* database, checks `pipeline_run_requests` (`anything_unfinished`), and if the
  tenant is live (`run_now_enabled` — the admin registry's own switch, which a "paused in the admin
  panel" client fails even if their Hub button is pressed), claims and runs whatever is waiting,
  `--at-once` tenants and `--per-client` requests within a tenant at a time.
- **`bookkeeping run --tenant X --channel Y`** — the actual one-shot execution: load that tenant's
  config + decrypt its credentials from the admin registry, open a connection to *that tenant's own*
  database, build a live connector for the channel (`composition/composition_root.py` turns a config
  name like `"gmail"`/`"imap"` into a real client), read/extract/judge/store, write
  `processing_log`/`channel_state`/`pipeline_runs` back onto that tenant's own database.
- Every path funnels through the same `one_channel` function (see the diagram at the top of
  `src/cli/main.py`) — `serve` and the schedule are two different *entry points* into identical work,
  not two different implementations that could drift apart.

## What this means in practice for Hub work

- Never assume a feature that depends on book-keeping (Run now, folder browsing, region checks that
  read `tenant_settings`, anything pipeline-shaped) is actually live for a given client — check that
  client's own live database for the table/column/RPC first. `useRunRequests()`'s silent-empty
  fallback is the pattern to follow for any new Hub code that depends on a book-keeping migration:
  degrade quietly, never error, when the table/column isn't there yet.
- A change to book-keeping's pipeline behavior affects every tenant it serves — there is no
  per-client code branch in book-keeping itself, only per-client *data* (config and credentials) in
  the admin registry, and per-client *presence* of a `migrations/tenant/*.sql` file's effects.
- The Hub's own schema (this repo's `supabase/schema/*.sql`) is the single source of truth book-keeping
  vendors in, not the other way around — a schema change here needs
  `python scripts/sync_hub_schema.py` run in book-keeping before a *new* tenant's provisioning picks
  it up (an *existing* tenant's database only changes when something is actually applied to it).
