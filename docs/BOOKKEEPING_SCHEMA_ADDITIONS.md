# Schema additions for an estate agency's bookkeeping

What was added to the baseline so the ingestion pipeline can serve an agency that bills commission
and pays its own costs from a mailbox it does not control. All of it is additive and nullable, so a
Hub that never uses it behaves exactly as before.

Status: the pipeline now writes `tip_amount`, `occasion`, `participants` and `document_links`
(`rules.read_receipt_extras`, `rules.link_reminders`), and the Hub reads them in bank matching, the open
items and the pay-ready counts. Setup is in `ESTATE_AGENCY_BOOKKEEPING_SETUP.md`. The rows that say
"Matching" or "Hub" below are done unless marked; the rest still wait on what is named.

## What was added

| Where | Added | Why | Who has to use it |
|---|---|---|---|
| `documents` | `tip_amount`, `occasion`, `participants` (`0004_documents.sql`) | A restaurant receipt carries a handwritten tip, the reason and the guests. What left the account is `amount_gross + tip_amount`, not the printed total. `tip_amount >= 0` | Pipeline: reads them off the receipt (done). Matching: compares the bank line with `amount_gross + coalesce(tip_amount, 0)` through `amount_paid_out()`: the scorer, `bank-sync`, the allocation trigger and `v_open_items` (done) |
| `document_links` (`0004_documents.sql`) | `document_id`, `related_document_id`, `kind` in `reminder_of`, `credit_for`, `replaces`. Unique per triple, no self link, cascades with either document. RLS in the `documents.read` / `documents.write` area | A supplier's reminder letter names the bill it chases, so the two are never paid separately. Same shape for a credit note and a corrected bill | Pipeline: writes the link when a reminder names an invoice number it holds, in either arrival order (done). Hub: a linked reminder is not an open item and not in `ready_for_payment` or `pay_now` (done); the document page shows it in a notice above the review box (`LinkedDocuments`, `useDocumentLinks`), for a reminder, a credit note and a replacement, from either side |
| `customers` | `crm_external_id`, `accounting_external_id`, each unique among live rows; `source` also allows `crm` (`0003_master_data.sql`) | The same person in the CRM and in the accounting tool, so a sync or an invoice never creates a second one | Deal import (CRM contact), invoice creation (accounting contact) |
| `bank_transactions` | `creditor_id`, `mandate_reference` (`0006_bank.sql`) | A direct debit carries both. They tie a debit to its creditor, so a bill that is debited is never paid again | Bank import: fill them from the statement. Matching: use them to find the supplier |
| `outgoing_invoices` | `kind` (null, `commission`, `coaching` or `referral_credit`), `deal_id` (`0008_workspace.sql`) | An agency issues commission invoices, coaching invoices and referral credits. A referral credit is paid out to whoever recommended the customer, so it names the deal that earned it, not another invoice | Invoice creation. The 10, 15 or 20% tier rule is still open |
| `deals` | `own_lead`, `from_viewing`, `costs_closed_at`, `ready_for_bookkeeping_at`, `referrer_customer_id` (`0008_workspace.sql`) | What the broker bonus rules depend on: the 50% share needs an own lead and closed costs, the viewing bonus needs `from_viewing`, and the referral credit needs a referrer | Propstack import and the commission screen. The bonus rules themselves are still open |
| `app_users` and read policies (`0001_identity.sql`, `0010_access.sql`, `0011_functions.sql`) | `app_users.crm_external_id`, unique. `current_crm_external_id()`, `owns_deal()`, `owns_deal_side()`, `owns_customer_through_a_deal()`. Read-only policies `properties_own_broker_read`, `deals_own_read`, `deal_sides_own_read`, `deal_parties_own_read`, `customers_own_deals_read`. `link_brokers_to_users()`, callable by the service role only | A broker is a Hub user who sees only what the CRM says is theirs: the properties they are the broker of, the deals on those or ones they acquired or handled, and the customers on those deals. Added to what a role already grants, so it widens nothing for anyone who may read everything | The Propstack sync calls `link_brokers_to_users()`, which links a user to a CRM broker by matching email and never overwrites a link already set |
| `customers`, `deals`, `deal_sides`, `deal_parties` (`0017_broker_commissions.sql`) | `customers.created_by`; helpers `is_own_property`, `may_edit_own_deal`, `may_edit_own_deal_side`; seven policies named `*_submit*` | A broker enters their own commission and an administrator approves it. Inert until a role holds `deals.submit`, which no role does by default. See `COMMISSION_INVOICES.md` | The Broker role preset, `supabase/presets/broker-role.sql` |
| `outgoing_invoices` | `expected_payment_on`, `sent_at`, `accounting_external_id`, unique among live rows (`0008_workspace.sql`) | A seller pays when the purchase price reaches them, weeks after the invoice, so there is an expected date and no due date. `sent_at` records the email going out. The id is the number the accounting tool assigned | Payment tracking, the send step, the accounting call |
| `outgoing_invoice_files` | `external_id`, `web_url` | Where the filed copy sits when it was also filed to a drive | The filing step |
| `filing_placements` | `partition_pattern`, for example `{yyyy}/{mm}_{yyyy}` (`0005_sources.sql`) | A drive laid out as year, then month: `2026/09_2026`. The existing `month_partition` is one flat folder per month. Allowed tokens are `{yyyy}` and `{mm}`; no leading or doubled slash, no `..`. Needs a fixed target, like `month_partition`. Takes its place where set | Pipeline: `month_partition_mover` reads only the boolean today |

Also in the baseline from earlier in this work: the seven columns the pipeline writes that the
template lacked (`filing_attempts`, `documents.published_at`, `channel_folders.include_children`)
and the commission tables (`deals`, `deal_sides`, `deal_parties`, see `COMMISSION_INVOICES.md`).

## A broker's access, checked

Tested through the API on a database with the real Propstack data (758 properties, 9 brokers):

- A broker with a large book saw exactly their own 135 properties, 2 deals and 2 customers, and no
  company, supplier, document, bank transaction or invoice. A second broker saw their own 8
  properties. An admin saw all 758.
- A broker could not edit a property, could not set their own `crm_external_id` to another broker's,
  and, without `deals.submit`, could not create a deal. A broker calling `link_brokers_to_users()` was refused (403).
- 292 of the 758 properties belong to the shared `info@` login in the CRM, so only whoever signs in
  as that person sees them.

The Broker role is created once per client from `supabase/presets/broker-role.sql` (or, on an existing
database, `broker-for-an-existing-client.sql`). It holds `page.overview` and `page.profile` (without
them even the landing page says "no access"), `page.properties`, `properties.crm_sync` (without it the
properties page falls back to the plain list), `page.commission_deals` and `deals.submit` for their
sales. It must not hold `master_data.read` or `documents.read`, which would let the person read
everything. The Team screen has a "CRM broker ID" field, shown for a person who holds
`properties.crm_sync`; it is also filled by the email match.

## What needed no change

Checked against the pipeline and left alone, because it is data or code rather than schema:

- **A mailbox over IMAP.** `channels` holds a kind and a provider as names, `channel_folders` the
  folders, `credentials` the login, and `read_cursors.bookmark` is free text for a position. An IMAP
  channel is a row and an adapter, and the adapter now exists in the pipeline (`imap`).
- **A chart of accounts.** `category_account_mapping` is account number and name per company and
  direction. SKR04 is rows.
- **Cash-basis accounting.** `companies.booking_basis = 'payment_date'`.
- **Skonto, direct debit, already paid, small amount.** All columns on `documents` already.
- **A file name of date, type, supplier and address.** A naming strategy in the pipeline
  (`adapters/storage/naming`), configured per tenant; `filename_settings` serves the older strategy.
- **Excluding a sender, a portal.** `ingest_exclusions`.
- **Approval by one person, with a stand-in.** `approval_rules`, `approvers`,
  `app_users.deputy_user_id`: rows.
- **The accountant's upload address.** `handover_routes`: a row.

## Not decided, so not in the schema

| Open | Depends on |
|---|---|
| A record of a SEPA payment file, so a bill is in one file only. `src/kit/lib/sepa` builds the XML but nothing stores a run | Whether the accounting tool takes approved bills (then no file) or not |
| Handing an approved bill to the accounting tool, and remembering its id on `documents` | The tool's API on the client's plan |
| The 10 / 15 / 20 % referral tier, counted by referrals in the calendar year | The client's examples, still missing |
| Broker bonuses: kinds, per-deal triggers, a monthly cut-off, approval, payroll export | Four open questions with the client |
| An employee on an expense claim | Whether claimants are Hub users |
| "Correction requested" as a state apart from `query` | The client, and whether one reason on `query` is enough |

## Proof

Rebuilt the local database from the baseline, dumped before and after: the diff is these additions
and the views that now carry the new document columns. Each constraint was exercised with a valid
and an invalid row, and `document_links` was read and written as the admin and refused for an
anonymous caller. `scripts/check-drift.mjs` against that database reports no drift,
`scripts/check-pipeline-columns.mjs` reports no gap.
