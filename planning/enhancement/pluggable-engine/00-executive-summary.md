# Executive summary: why this folder exists

A stakeholder-facing recap of the audit and the decision behind it, kept beside the technical plan
in `01-findings.md` through `03-phases.md`. Where this summary and those files would ever disagree,
the other three are the technical ground truth — this one is the narrative.

## The goal

This template runs a complete financial-operations cycle on top of Supabase/Postgres — AI document
intake, tax coding, bank sync, invoice-to-payment reconciliation — and is already proven across
several deployment forks, this client's own Hub among them and another client's Hub as a sibling fork. The goal
is to keep scaling it to new clients, industries and countries with minimal code modification per
client.

## The architectural challenge

The audit found real coupling to one region's formatting and to two specific vendors, BANKSapi
(banking) and Pleo (expense cards): hardcoded German date/decimal parsing, a flat `vat_rate` field
that cannot express a multi-rate invoice, vendor-prefixed database columns, and vendor-named
TypeScript types inside shared core files. Each is a point where adding a second country or a second
vendor would mean touching code that every other client's Hub shares.

## The core decision

Extend the existing architecture rather than replace it. This template deploys as **one clone per
client** (`CLAUDE.md`'s own description), and the schema already carries a single-row `tenant_settings`
table with a JSONB `config` column for exactly this purpose — discovered during the audit, not
introduced by it. The decision is to grow that one row's shape to drive locale, tax regime and
vendor choice at runtime, instead of undertaking a full shared-database, multi-tenant-per-request
migration (a `tenant_id` dimension across roughly 68 tables and a rewrite of every RLS policy) that
nothing in this audit actually requires.

## The decoupling sequence, as actually planned

The phases below are detailed in `03-phases.md`; this is the one-line version of each, with the
corrected shape where the first draft of this summary drifted from what the audit found.

1. **Database sanitisation.** Not a new rename to design — `supabase/schema/RENAMES.md` already
   documents it, and the target schema already has `provider_ref`, `provider_account_ref`,
   `provider_hash` plus a `metadata`/`raw_data` JSONB column per table. The actual work is three
   stale lines in `_shared/mappers.ts` and seven Edge Functions that never caught up to the schema.
2. **Core domain type stripping.** `PleoSpender`/`PleoEmployee` move out of `src/data/bank/bank.ts`
   into their own adapter file, mapped into a vendor-blind `CardSpender` shape. Core files never see
   a vendor's own payload shape again.
3. **Normalisation and tax upgrades.** `normalize.ts`'s parsing and `format.ts`'s currency
   formatting take a locale strategy resolved from `tenant_settings.config.locale` instead of
   assuming German formatting inline. The flat `vat_rate` field is joined by a `TaxBreakdown` —
   `document_taxes` already models this per rate (rate, net, VAT amount), so the fix is wiring an
   existing table into extraction and display, not inventing a new shape.
4. **Dynamic resolution at the point of use.** `Deno.env.get("BANKSAPI_MODE")`-style switches are
   replaced by a resolver that reads `tenant_settings.config` once per invocation and returns the
   adapter the client's row names — inside this repo's existing `src/lib/` /
   `supabase/functions/_shared/` layout, not a new top-level folder split.

## Open question answered this session

Whether to generate the concrete `IBankingAdapter`/`ICardAdapter` TypeScript interfaces now: yes —
done, in `02-mechanism.md`, as unwired, additive files (Phase B). Wiring them into the live banking
and payment Edge Functions (Phase C onward) waits for sign-off per file, since that touches
production money-movement code.
