# The pluggable engine: locale, tax and provider swap-ability

An audit of five coupling points raised by a client review: tenant configuration, vendor-prefixed
bank columns, flat `vat_rate`, `Pleo*` types inside the core data layer, and an env-based banking
vendor switch. Three of the five turned out to already be decided or half-built in the schema; this
folder plans finishing them, not inventing them.

| File | What it holds |
|---|---|
| `00-executive-summary.md` | The stakeholder-facing narrative: goal, challenge, decision, one line per phase |
| `01-findings.md` | What the audit found, already-built vs. actually-missing, with file:line evidence |
| `02-mechanism.md` | The core interfaces and the tenant-config resolver — identical for every client, no page names, no vendor calls |
| `03-phases.md` | The phased plan: what ships now, what waits for sign-off, and why |

## The one-paragraph version

`tenant_settings` already exists as a singleton row with a JSONB `config` column and an audit
trigger — the schema decided "config as data, not env vars" before this audit started. `bank_*`
columns already carry generic names (`provider_ref`, `provider_account_ref`, `raw_data jsonb`) in
`supabase/schema/`; three lines in `_shared/mappers.ts` and seven Edge Functions never caught up to
it. `document_taxes` already models a multi-rate breakdown; nothing reads it. The real, net-new work
is: give the existing config room a shape (locale, tax regime, provider choice), read it through one
resolver instead of `Deno.env.get(...)`, and finish moving `Pleo*` types out of
`src/data/bank/bank.ts`.

## Scope, as agreed

- Locale, currency and tax-rule parsing: market-agnostic, not German-only.
- Vendor swap-ability: BANKSapi, Pleo and DATEV each behind one seam.
- Tenancy model: **extend the existing per-deployment singleton** (`tenant_settings`, one row per
  client database). Not a shared database serving many clients at once — that is a separate,
  repo-wide migration (a `tenant_id` dimension on ~68 tables, RLS rewritten for isolation) and is
  explicitly out of scope here.
- Breaking changes to the vendor-prefixed columns are acceptable: this template has no live client
  on the new schema yet, so there is nothing to migrate around.

## What this folder must never contain

A client's name, a vendor call made from a planning doc's own code sample without the `_shared/`
boundary around it, or a `tenant_id` column — the tenancy decision above rules that out on purpose.
