# Feature: Nightly purge of abandoned onboarding-practice data

Reference for why this exists, what's actually implemented, and what it deliberately does not do.

## What was asked

Found while cleaning up van Oepen's live database (12 Nov 2026 session): `is_demo` rows from the
Onboarding Practice tutorial were sitting in production, never removed. Tracing it: the tutorial
only discards what it created when someone clicks **Finish** or **Restart** — pausing or just
navigating away leaves everything behind, by design, so a session can be resumed later. But even
that discard is a soft delete (`deleted_at`), and nothing in this product ever hard-deletes a
soft-deleted row, for any table, for any client. So an abandoned practice session — closed tab,
no restart, no finish — leaves `is_demo` rows in the database forever, for the life of every Hub
this template is ever cloned or branched into.

The call made here: a client's own trashed data stays soft-deleted forever on purpose (bookkeeping
retention law likely requires that, and it was never asked to be changed). `is_demo` data is
different — synthetic, reproducible on demand, and nobody is ever coming back to restore it. That
one is safe to actually remove, and worth removing, since nothing else ever will.

## What's implemented

`supabase/schema/0046_purge_demo_data.sql` — one function, one schedule, shipped on for every
client (not a per-tenant switch, since no client would want abandoned practice data kept forever):

- **`public.purge_stale_demo_data()`** — hard-deletes every `is_demo` row older than 48 hours
  (a real practice run finishes in minutes, so this is a generous margin, not a guess at an exact
  session length) across the five tables that carry their own `is_demo` column: `documents`,
  `companies`, `suppliers`, `properties`, `bank_transactions`.
- **Scheduled directly via `pg_cron`** (`purge-stale-demo-data`, `0 3 * * *`), not through the
  `scheduled_jobs`/Edge Function pattern in `0013_scheduled_jobs.sql` — this is pure database work
  with no external call to make and no vault credential to resolve, so routing it through an Edge
  Function would only add a network hop for nothing.

### Three things it had to work around, found only by actually running it live

Each of these only surfaced by running the function against a real database with real demo data —
not from reading the schema. Anyone adding a table to this function's scope should expect the same
kind of surprise and check for it the same way: try it against real data before trusting it clean.

1. **`document_history` is tamper-proof by design** (`guard_document_history_immutable()`,
   `0011_functions.sql`) — it refuses every `UPDATE`/`DELETE`/`TRUNCATE`, which also blocks the
   ordinary cascade delete off `documents`. Lifted only for the one statement that clears a demo
   document's own history, inside the function's own transaction — a failure anywhere else in the
   function rolls the lift back too, since `ALTER TABLE ... DISABLE TRIGGER` is transactional DDL.
2. **`supplier_bank_accounts` refuses to delete a supplier's default account**
   (`refuse_deleting_default_bank_account()`, same file) — a real guard against leaving a real
   supplier with no default account, which doesn't apply when the whole supplier is being removed
   in the same statement. Lifted the same way, scoped to the one `delete from suppliers` statement.
3. **`deals`, `customers` and `outgoing_invoices` carry no `is_demo` column of their own** —
   `company_demo_visible()` (`0010_access.sql`) reads the parent company's/property's flag instead
   for RLS purposes, but the rows themselves are real rows with real `NO ACTION` foreign keys back
   to a demo property or company, and they blocked deleting those once old enough. The function
   collects the demo deal/customer ids once (`v_demo_deal_ids`/`v_demo_customer_ids`) and deletes
   them, and their own non-cascading children (`broker_bonuses`, `deal_donations`,
   `deal_referrer_bonuses`, `deal_parties`), before touching companies/properties/suppliers.

## What's still open

- **No other `is_demo`-adjacent table has been audited this way.** The three found above were
  discovered by hitting their errors one at a time against van Oepen's real data, not by tracing
  every foreign key in the schema up front. A new practice task that creates a different kind of
  row (tied to a demo company/property but without its own `is_demo` column) will hit the same kind
  of surprise and needs the same treatment added to this function.
- **The 48-hour cutoff is a judgement call**, not a number from a spec. If a practice session is
  ever expected to legitimately span more than two days (unlikely, but not something this doc can
  rule out), this purges it mid-way.
- **Real trashed data is deliberately untouched.** This was a conscious decision, not an oversight
  — see "What was asked" above. If that decision is ever revisited, it needs a retention-law answer
  first, not just a bigger `WHERE` clause on this same function.
