# BANKSapi — going live (demo data cleanup + real accounts)

Written after the client asked for the demo bank connections/accounts to be removed so real
accounts can be added, and after a manual delete of the demo rows reappeared on its own within
the hour — same issue and same fix as ported from a sister Hub's `docs/BANKSAPI_GO_LIVE.md` (the two
repos share this Edge Function code line-for-line as of this writing). Companion to
`docs/BANKSAPI_SANDBOX_ONBOARDING.md` (sandbox setup — **see the staleness warning in §4 below
before trusting it**) and `docs/BANKSAPI_PAYMENT_INITIATION.md` (payment initiation — a separate,
still-mock switch, see §3).

## 0. Status (verified 2026-08-20): go-live is DONE

Steps 1-3 of §3 have been carried out. Verified directly against project
`xsgbdtdwhrrhoeximeon`, not inferred from this doc:

| Secret                         | Value                        | Set on     |
| ------------------------------ | ---------------------------- | ---------- |
| `BANKSAPI_MODE`                | `live`                       | 2026-08-11 |
| `BANKSAPI_ENV`                 | `production`                 | 2026-08-11 |
| `BANKSAPI_PAYMENT_MODE`        | `mock` (correctly untouched) | 2026-08-06 |
| `BANKSAPI_ONE_CONNECT_API_KEY` | present (value not readable) | 2026-08-05 |

Method: `supabase secrets list --project-ref xsgbdtdwhrrhoeximeon` returns sha256 digests
rather than plaintext, so the three mode/env values above were identified by matching those
digests against the sha256 of each candidate string. The API key's plaintext stays unknown by
the same mechanism.

Step 3 (demo-row cleanup) is also done. As of 2026-08-20 the database holds **no**
`is_sandbox = true` rows at all:

| Table               | `is_sandbox = false` | `is_sandbox = true` |
| ------------------- | -------------------- | ------------------- |
| `bank_connections`  | 2                    | 0                   |
| `bank_accounts`     | 13                   | 0                   |
| `bank_transactions` | 2759                 | 0                   |

Since `BANKSAPI_MODE=live`, `mockWrapper()` is no longer reachable, so the hourly `bank-sync`
job can no longer recreate the "Demo Provider"/"Demo Bank" rows described in §1. That failure
mode is closed.

Still genuinely open:

- Whether the ONE/Connect key is a **production or trial** contract is still unconfirmed. The
  secret exists and live syncs are clearly succeeding (2759 real transactions), but the value is
  hashed, so this doc cannot prove which contract it belongs to. Confirm with BANKSapi.
- `BANKSAPI_PAYMENT_CALLBACK_URL` is **not set** as a secret. That is harmless:
  `payment-initiate/index.ts:54-57` falls back to `${SUPABASE_URL}/functions/v1/payment-callback`,
  which is deliberate (see the comment at `:50-53`) and cannot drift from the project.
- `docs/BANKSAPI_SANDBOX_ONBOARDING.md` is still stale (see §4) and still needs rewriting.
- Payment initiation remains mock and out of scope, unchanged.

Local `.env` files do not affect any of this. Every secret above is read via `Deno.env` inside
the deployed Edge Functions; the copies in the repo's `.env` are a record of what to deploy and
control nothing at runtime.

## 1. Why the demo data kept coming back

The demo rows are not seeded by a SQL migration or a one-off script — there is no `insert` of
"Demo"/sample rows anywhere in `supabase/migrations/*.sql`. They are fabricated live, every
time, by the **mock BANKSapi wrapper** in `supabase/functions/_shared/banksapi.ts`:

- `getBanksapi()` (`banksapi.ts:648-650`) picks the implementation by `BANKSAPI_MODE`,
  **defaulting to `"mock"` when the secret is unset**:
  ```ts
  const mode = (Deno.env.get("BANKSAPI_MODE") ?? "mock").toLowerCase();
  return mode === "live" ? liveWrapper() : mockWrapper();
  ```
- `mockWrapper()` (`banksapi.ts:116-136`) always returns one fixed access:
  `accessId: MOCK_ACCESS_ID = "mock-access-1"`, `providerName: "Demo Provider"`,
  `bankName: "Demo Bank"`.
- The `bank-sync` Edge Function runs **hourly via pg_cron** (job `bank-sync-hourly`, scheduled in
  `supabase/migrations/0035_hub_bank_sync_cron.sql`). Unlike a hardcoded URL, this job reads its
  target project URL and service-role key from **Vault secrets** (`project_url`,
  `service_role_key` — see the migration's own setup comment at the top) and posts to
  `<project_url>/functions/v1/bank-sync` at the top of every hour. Every run calls
  `getBanksapi().getBankAccesses()` and **upserts** whatever comes back: it looks up
  `bank_connections` by `banksapi_access_id` (`bank-sync/index.ts:169-170`), inserts if missing
  (`:188`), then upserts each account onto that connection keyed on
  `(connection_id, banksapi_product_id)` (`:269`).

Net effect: as long as `BANKSAPI_MODE` is not `live`, the demo connection/account get **recreated
every hour**, no matter how many times the rows are deleted by hand. Deleting them without first
flipping the mode is why a manual cleanup doesn't stick.

## 2. Env vars that control this (Supabase Edge Function secrets, not `.env` files)

Three independent switches — don't conflate them, each exists on purpose:

| Secret                  | Read at                                      | Default if unset | What it does                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BANKSAPI_MODE`         | `banksapi.ts:649`                            | `mock`           | Read-side switch: mock demo data vs. real BANKSapi accounts/transactions. **This is the one causing the reappearance.**                                                                                                                                                                                                                                                                               |
| `BANKSAPI_ENV`          | `banksapi.ts:663` (`isSandboxConnection`)    | `sandbox`        | Only stamps the `is_sandbox` flag on **newly connected** connections/accounts. Doesn't affect existing rows or the sync loop itself.                                                                                                                                                                                                                                                                  |
| `BANKSAPI_PAYMENT_MODE` | `banksapi.ts:363` (`getBanksapiForPayments`) | `mock`           | **Deliberately separate** from `BANKSAPI_MODE` (see `banksapi.ts:359-362` and `docs/BANKSAPI_PAYMENT_INITIATION.md`) so testing payments never has to go live, and going live for reconciliation never accidentally enables real money movement. **Leave this on `mock` for this go-live** — flipping it is a separate decision (payment initiation), not part of "let the client add real accounts". |

Also confirm before flipping `BANKSAPI_MODE`:

- **`BANKSAPI_ONE_CONNECT_API_KEY`** — must be the real production API key. The code
  (`banksapi.ts:236,435`) already reads this ONE/Connect-style single-API-key variable, but see
  §4 below — this project's own onboarding doc still describes the older Basic Auth
  (`BANKSAPI_BASIC_USERNAME`/`BANKSAPI_BASIC_PASSWORD`) tenant model, so don't trust that doc to
  tell you which credential is actually configured; check the live Supabase secrets directly.
- **`BANKSAPI_BASE_URL`** — defaults to `https://banksapi.io` in code (`banksapi.ts:236,435`) if
  unset; only override if BANKSapi issues a different URL for the live contract.

## 3. Order of operations to go live

Flip the secret **before** deleting rows, or the next hourly tick recreates them again:

1. Confirm with BANKSapi which tenant/API key this project is actually configured against right
   now (see §4 — the checked-in onboarding doc is stale and cannot be trusted for this), and
   whether it's a production contract.
2. Set the secrets on the deployed project:
   ```bash
   supabase secrets set BANKSAPI_MODE=live BANKSAPI_ENV=production \
     BANKSAPI_ONE_CONNECT_API_KEY=<production-key> \
     --project-ref xsgbdtdwhrrhoeximeon
   ```
   (2026-08-07 correction: this doc originally named `pbwfihepsrxgcytkvqgf` here — that project is
   actually named "a sister Hub Philipp Netz" in Supabase, unrelated to this Hub. The real this Hub/this client
   project ref, confirmed from the production pipeline's own `SUPABASE_DB_URL`
   (`db.xsgbdtdwhrrhoeximeon.supabase.co`), is `xsgbdtdwhrrhoeximeon`. No command was ever actually
   run against the wrong ref — this was caught before anything executed.)
   (Leave `BANKSAPI_PAYMENT_MODE` untouched — stays `mock`.)
3. Delete the demo rows. `bank_connections`, `bank_accounts`, and `bank_transactions` each carry
   an `is_sandbox boolean not null default true` column built for exactly this
   (`supabase/migrations/0003_hub_bank_reconciliation.sql:18,42,70`). Grepping every
   `references public.bank_connections` in the schema turns up exactly three FKs onto it:
   `bank_accounts.connection_id` (`:31`, `on delete cascade` — fine),
   `bank_transactions.connection_id` (`:55`, "denormalized for filtering", **no cascade**), and
   `bank_sync_logs.connection_id` (`:113`, nullable, **no cascade**). Deleting `bank_connections`
   directly throws `bank_transactions_connection_id_fkey` then `bank_sync_logs_connection_id_fkey`
   in turn. `bank_sync_logs` is non-sensitive sync-run history only ("NO sensitive content: counts
   - ids only", `:109`) with nothing else depending on it, so it's simplest to clear the whole
     table rather than filter it — no run before go-live is worth keeping:

   ```sql
   truncate table public.bank_sync_logs;

   delete from public.bank_transactions
   where connection_id in (select id from public.bank_connections where is_sandbox = true);

   delete from public.bank_connections where is_sandbox = true;
   ```

   The last statement then cascades through `bank_accounts` (and any transaction rows still
   linked only via `account_id`). This was verified against every FK onto `bank_connections` in
   the current schema — re-check `supabase/schema.sql` if a future migration adds another one.

4. Wait for (or manually trigger) the next `bank-sync` run and confirm in the UI
   (`/bankverbindungen`, `/bankkonten`) that only real, client-added connections/accounts appear
   and no "Demo Provider"/"Demo Bank" row has returned.
5. Have the client go through the BANKSapi webform (REG/Protect) to connect their real bank.

## 4. Open questions / doc drift to resolve first

- **`docs/BANKSAPI_SANDBOX_ONBOARDING.md` is stale for this project.** It documents the old
  `wtdigitaltest` Basic Auth tenant model (`BANKSAPI_BASIC_USERNAME`/`_PASSWORD`,
  `BANKSAPI_TEST_USER`) with a sandbox validity date of 2026-08-03 — already expired as of this
  writing (2026-08-07) — while the actual code in `banksapi.ts` already reads
  `BANKSAPI_ONE_CONNECT_API_KEY`, the newer single-API-key model a sister Hub cut over to on
  2026-08-05 (see a sister Hub's `BANKSAPI_SANDBOX_ONBOARDING.md`). Don't use that onboarding doc to
  decide what credential is live here; verify directly against the Supabase project's secrets.
  Once confirmed, that doc should be rewritten to match, same as a sister Hub's was.
- Whether this project's current tenant/API key is trial or production is unconfirmed. Step 2
  itself **has** been done (see §0, 2026-08-11); what remains unconfirmed is only which BANKSapi
  contract the key belongs to.
- Payment initiation going live (`BANKSAPI_PAYMENT_MODE=live`) is intentionally out of scope here
  — see `docs/BANKSAPI_PAYMENT_INITIATION.md` for that feature's own status before ever flipping
  that switch.
