---
name: book-keeping-integration
description: How this Hub links to book-keeping (the pipeline) and its separate admin registry — the three different databases, the "Run now" request-queue pattern, why the Hub can never hold a mailbox password, and how book-keeping's own migrations get applied per client (by hand, not automatically). Load before touching anything mailbox/pipeline/run-now/folder-browsing shaped, or before assuming a book-keeping feature is live for a given client. Full detail in docs/BOOK_KEEPING_INTEGRATION.md.
---

# book-keeping integration

Full write-up, with verified evidence against a real client's live database: `docs/BOOK_KEEPING_INTEGRATION.md`.
Read this skill for the rules; read the doc before doing real work in this area.

## Three different databases, never confuse them

1. **This Hub** — a client's own Supabase project. Reads/writes `channels`, `channel_folders`,
   `tenant_settings`, `pipeline_runs`, `processing_log`, `documents`. Also, unlike what you'd guess,
   **does physically hold the client's real credentials** (mailbox password included) in its own
   `public.credentials` table — just one the Hub's own app code has no way to read (below).
2. **book-keeping** — the Python pipeline, its own server, cron-driven. Not in this repo.
3. **book-keeping's admin registry** — a *separate* Supabase project altogether
   (`book-keeping-admin-dashboard`), holding every tenant's `TENANT_DB_URL`, schedule, and a second,
   independently-encrypted copy of the same credentials. The admin panel
   (`book-keeping-wt.vercel.app`) talks to this directly.

A client's own project and the admin registry are not the same database — but credentials are
deliberately kept in **both**, not registry-only. Check `public.credentials` on the client's own
project before claiming a secret "isn't in their database."

## Why the Hub still can't read the credential sitting in its own database

Two layers, not "which database": (1) `public.credentials` has RLS on with **zero policies** —
the Hub's `anon`/`authenticated` PostgREST keys get nothing from it, ever; only a service-role
connection bypasses that. (2) Even then, `value` is Fernet ciphertext (a `"v2.…"` envelope), keyed
per-tenant, and that tenant key is itself encrypted with `SECRET_ENCRYPTION_KEY` — which lives only
in book-keeping's own server config, never in a Hub's `.env` or code. No path to the table, and no
path to the key, even if there were.

## The hard rule this exists to stop you re-learning

**Never assume a book-keeping-dependent feature is live for a given client.** `pipeline_run_requests`
(the whole "Run now" mechanism) does not exist on every client's database — it is a book-keeping
migration (`migrations/tenant/0009…`) applied **by hand, per client**, not automatically on
provisioning and not something any book-keeping CLI command rolls out for you (checked: no command
in `src/cli/main.py` reads `migrations/tenant/`). Check that client's own live schema
(`supabase db dump --linked --schema public`, after `supabase link --project-ref <ref>`) before
building on top of a table/column/RPC you expect to be there.

## Why the Hub can't browse an IMAP mailbox's folders live

Not because the password is missing from its database — it's RLS- and encryption-locked, per above.
Separately, this repo's folder-browsing code (`src/hub/adapters/document-sources.ts`,
`providerSupportsFolderBrowsing()`) only ever calls Microsoft Graph; there's no IMAP folder-listing
code here, and none in any sibling Hub either (checked `staeyhub` directly). book-keeping itself
*does* have working IMAP folder-listing code (`ImapMailSource.folders()`) and already holds the key
to decrypt the credential — the fix is extending the "Run now" request-queue pattern with a new
request kind so book-keeping does the connecting on the Hub's behalf, not giving the Hub the password
or the decryption key.

## The one channel a Hub has to ask book-keeping anything

The Hub writes a row in its own database (`pipeline_run_requests`, via the `ask_for_a_run` RPC);
book-keeping's `serve --listen` is woken by a `pg_notify` trigger and answers on the same row. This
is the *only* path — book-keeping has no inbound port a browser app can call. Any new "ask
book-keeping to do X" feature should extend this same pattern, not invent a second channel.

## Multi-tenancy, one sentence each

- `bookkeeping due` — one crontab line, checks the admin registry every minute, launches each due
  tenant in its own process so one client's backlog never delays another.
- `bookkeeping serve --listen` — a long-running process polling every tenant's own
  `pipeline_run_requests` for "Run now" presses.
- Every path funnels through the same `one_channel` function — `serve` and the schedule are two
  entry points into identical work, never two implementations that can drift apart.
- No per-client code branch exists in book-keeping — only per-client *data* (admin registry config)
  and per-client *presence* of a given `migrations/tenant/*.sql` file's effects.
