# BANKSapi Sandbox — Onboarding

_English onboarding for the BANKSapi test sandbox. **Placeholders only — no real secrets in this
file.** Real values live in `~/.secrets/a sister Hub-banksapi` and in Supabase secrets. German
UI/DB/business terms are translated in parentheses on first use._

## Overview

- **Tenant:** `wtdigitaltest`
- **Sandbox valid until:** 2026-08-03
- **Base URL:** `https://banksapi.io`
- **Docs:** https://docs.banksapi.de (Quick Start, MCP docs, Demo Provider)
- **Support:** support@banksapi.de

## Three access levels

1. **API credentials (tenant / client)** — HTTP Basic Auth pair used to obtain tokens. There is no
   single "API key"; the key is `username:secret`.
   - `BANKSAPI_BASIC_USERNAME = <tenant>/<clientId>` (e.g. `wtdigitaltest/<clientId>`)
   - `BANKSAPI_BASIC_PASSWORD = <client-secret>`
2. **Tenant user** — a user created inside the tenant, used for the password grant to reach
   customer data (bank accesses, accounts, movements).
   - `BANKSAPI_TEST_USER = <user>` · `BANKSAPI_TEST_USER_PASSWORD = <password>`
3. **Demo bank login** — the credentials entered **inside the BANKSapi webform** to authorize the
   Demo Provider (a fake bank). These are BANKSapi's public demo values (below), not our secrets.

## Tested users

- `BANKSapi-Atlas-User` — used to explore products via BANKSapi ATLAS (the no-code explorer at
  `banksapi.io/atlas`, which uses the Base64 Basic-Auth header as its "API key").
- `testuser1` — the tenant user used for the programmatic token flow and the demo bank connection.

## Token flow

1. **Client token** (tenant-level):
   ```
   POST {BASE_URL}/auth/oauth2/token
   Authorization: Basic base64(<BASIC_USERNAME>:<BASIC_PASSWORD>)
   Content-Type: application/x-www-form-urlencoded
   grant_type=client_credentials
   ```
2. **User token** (customer-level):
   ```
   POST {BASE_URL}/auth/oauth2/token
   Authorization: Basic base64(<BASIC_USERNAME>:<BASIC_PASSWORD>)
   Content-Type: application/x-www-form-urlencoded
   grant_type=password&username=<TEST_USER>&password=<TEST_USER_PASSWORD>
   ```
   Tokens are Bearer, valid ~2h. **Always trim the token** (a trailing space causes nginx 500s).

## Creating a tenant user

```
POST {BASE_URL}/auth/tenants/users        (Bearer <client token>)
body: { "username": "<user>", "password": "<password>" }
```

(The tenant user must exist before the password grant works.)

## Getting a user token

Use the password grant above with the tenant user's credentials → save as `USER_TOKEN`.

## Reading bank accesses (Bankzugänge)

```
GET {BASE_URL}/customer/v2/bankzugaenge      (Bearer <USER_TOKEN>)
```

Returns an object keyed by access id; each access has `bankprodukte` (bank products = accounts).
An empty `{}` means no bank has been connected yet for that user.

## Reading transactions (Kontoumsätze = account movements)

```
GET {BASE_URL}/customer/v2/bankzugaenge/{accessId}/{productId}/kontoumsaetze   (Bearer <USER_TOKEN>)
```

`productId` is the product's `id` (for IBAN accounts, the IBAN itself), taken from the
`get_kontoumsaetze` relation in the bank-accesses response. Returns a flat array of movements
(`betrag` = amount, `buchungsdatum` = booking date, `verwendungszweck` = payment reference,
`gegenkontoInhaber/Iban/Bic` = counter-account holder/IBAN/BIC, `hash`).

## Connecting a demo bank through the BANKSapi webform (REG/Protect)

```
POST {BASE_URL}/customer/v2/bankzugaenge      (Bearer <USER_TOKEN>)
Content-Type: application/json
Customer-IP-Address: <public IPv4>            # 127.0.0.1 is rejected
body: { "<new-uuid>": {} }
→ 451 Unavailable For Legal Reasons + Location header = the webform URL
```

Open the webform URL (append your `callbackUrl`), select **Demo Provider**, and enter the demo
bank login. On success a bank access is created and its accounts/movements become fetchable.
To clear stuck sessions: `DELETE {BASE_URL}/customer/v2/regprotect/sessions`.

## Demo provider credentials (BANKSapi public demo values)

- **Provider id:** `00000000-0000-0000-0000-000000000000`
- **Logins to try in the webform:** `demo` / `demo` · `test_sca_method` · `test_failing_payment`
- The demo bank's SCA hints are shown in the webform (e.g. iTAN "12", mock PhotoTAN result
  "8534842", mock ChipTAN "936086").

## Known pitfall — token expiry / widget 500

- A **trailing space on a token** (copy/paste) → 500 (nginx). Always trim.
- Tokens expire after ~2h → refresh before reuse; a stale token surfaces as 401/500.
- The **Demo Provider webform can fail** ("The requested function is currently unavailable",
  callback `baReentry=ERROR`, `HTTP500 → BA999`). This is a BANKSapi-side sandbox issue, not our
  integration. If it happens: retry, clear REG/Protect sessions, or contact support with the
  displayed support IDs.

## Security note

- **Never commit real secrets.** This file uses placeholders only. Real values live in
  `~/.secrets/a sister Hub-banksapi` (local) and in **Supabase secrets** (server-side).
- BANKSapi credentials are used **only inside Supabase Edge Functions**, never in the frontend.
- `.env`, `banksapi-sandbox.env`, `zugangsdaten.txt`, token JSON, and service-account keys are
  gitignored and must never be committed.
