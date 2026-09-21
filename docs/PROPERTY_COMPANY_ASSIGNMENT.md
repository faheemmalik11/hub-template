# Property ↔ company assignment

**Status:** implemented (Hub side). Pipeline-side resolver contract change is a separate,
external-repo follow-up — not done here.

## What was asked

this Hub was built by copying a sister Hub's codebase, including a sister Hub's **business-line model**:
a property belongs to a company _through a business line_ (rental vs. sale), and the same
property could belong to two companies via two different business lines. Once the business line
resolved the company, it also decided VAT treatment (sale = exempt, rental = liable).

That model doesn't fit this Hub. The client's cost-centre workbook lists several properties under
**two companies at once** with nothing that maps onto a business-line dimension — e.g. Hinterstraße
20-22 → Infio/this client, Czernyring 42-44 → My Baufi/this client — and `property_assignment` had **0 rows** in
the live DB by design (migration `0077` deliberately left it empty because the workbook's company
relationships were ambiguous prose, not structured data).

The direction evolved over three points in the project's communication history:

1. **2026-08-04** (`communication/threads/2026-08-04-scope-clarification/04-inbound-client.md`):
   client says build one-to-one property→company assignment first ("we don't have any other choice
   than how we did it in a sister Hub"), always notify when a property is unassigned, and defer the
   dual-company cases to a later call.
2. **`communication/INDEX.md`** tracked the dual-company cases as an open, unresolved question
   ("Awaiting client answer" #2) through the rest of the project's early history.
3. **This change** is that resolution, given directly in a work session rather than a written
   thread: **direct company selection on the property, multi-select allowed** (a property may
   genuinely belong to more than one company), **but at least one company is required** before the
   property's form can submit. Given that `business_line` also turned out to be a scope dimension
   in the assignment-rule and approval-rule engines (not just the property model), the decision was
   to **fully remove `business_line`/`property_assignment`** rather than run two systems in
   parallel — keeping the rule engines themselves, just without business_line as one of their
   dimensions.

## What's implemented

### Schema — `supabase/migrations/0083_direct_property_company.sql`

- **New table `property_companies`**: plain many-to-many (`property_id`, `company_id`), no
  business-line dimension. Soft-delete only (`deleted_at`/`deleted_by`/`delete_reason`) — same
  audit rationale `property_assignment` had: a past link explains how earlier receipts were
  booked, so it's never hard-deleted. RLS mirrors `property_assignment`'s final shape: `select`
  scoped by `has_company_access(company_id)`, `insert`/`update` gated by `is_admin()`, no `delete`
  policy.
- **VAT-deductibility default** (`resolve_default_vat_deductible_pct`) re-keyed from
  `business_line.vat_treatment` to **`properties.vat_status`** — the exact same three-value
  vocabulary (`steuerpflichtig`/`steuerfrei`/`gemischt`) already lived there, set in the "Neues
  Objekt" dialog, so no new column was needed. The invoice trigger that keeps this default in sync
  now fires on `invoices.property_id` changing instead of `business_line_id`.
- **`assignment_rules`** and **`approval_rules`**: `business_line_id` dropped as a scope column.
  Both tables' generated `specificity` columns, `resolve_*`/`*_preview*` RPCs, and
  `*_scope_not_empty` CHECK constraints were rebuilt without that dimension — supplier/property/
  company (+ reference_pattern for assignment rules) remain.
- **`invoices`**: `business_line_id`'s FK to `business_line` dropped (the table it pointed to is
  gone). The columns `business_line_id`/`business_line_code` themselves are **kept, not dropped**
  — `v_invoices_list` (`select b.*`, live definition not version-controlled in this repo, per
  migrations 0038/0040's own notes) exposes every `invoices` column, so dropping either cascades
  into that view and `v_invoices_review` on top of it. Left as inert, never-written, never-read
  columns instead of risking a guessed rebuild of a view this repo doesn't own the source for.
  `assignment_source`'s vocabulary (owned by the external pipeline) renamed
  `property_assignment`/`property_assignment+name` → `property_company`/`property_company+name` to
  match the new table name.
- **Trash system**: `business_line` removed from `trash_eligible_tables()` and the `v_trash` view.
  `property_companies` is **not** added to the generic trash system — same precedent as
  `property_assignment` (own soft-delete UI/hooks instead).
- `property_assignment` and `business_line` tables are **dropped**. Safe: `property_assignment`
  had 0 rows; `business_line`'s 4 seed rows had no FK references left once the columns above were
  dropped. The migration's own pre-flight comment lists the `select count(*)` checks to run against
  the live DB before applying it, since this is destructive.

### Data layer — `src/lib/data/`

- `types.ts`: `PropertyCompany` interface replaces `BusinessLine`/`PropertyAssignment`.
  `AssignmentMethod` union renamed to match the new `assignment_source` vocabulary.
  `business_line_id`/`code` removed from `Beleg`, `AssignmentRule`, `ApprovalRule`.
- `queries.ts`: `usePropertyCompanies()` (reads active links) and
  `useSetPropertyCompanies(propertyId)` (one mutation — diffs the desired `companyIds[]` against
  what's currently linked, inserts new links, soft-deletes removed ones) replace
  `useBusinessLines`/`usePropertyAssignments`/`useCreatePropertyAssignment`/
  `useUpdatePropertyAssignment`/`useRemovePropertyAssignment`.

### UI

- **`src/components/objekte/company-assignment-field.tsx`** (new): a `MultiCombobox`-based field —
  replaces `assignment-editor.tsx` (deleted). Controlled `values`/`onValuesChange`, with an
  `error` prop the caller sets when 0 companies are selected at submit time.
- **`src/routes/objekte/index.tsx`**: `NeuesObjektDialog` (property creation) requires at least one
  company before "Anlegen" submits — the client's original "ask at form submission" request.
- **`src/routes/objekte/$code.tsx`**: the property detail page's edit dialog carries the same
  field; saving diffs the company set alongside the existing name/address/vat_status update. The
  read-only Stammdaten view keeps showing current companies as `GesellschaftChip`s (unchanged
  pattern) — an empty chip is the "unassigned" signal.
- **`src/routes/eingangsrechnungen/$nr.tsx`**: the invoice edit form's company-suggestion logic
  (offer/mehrdeutig/fehlt states) now keys off `property_companies` directly instead of
  `property_assignment` + business line — same three states (exactly one match → offer it; more
  than one → ambiguous, pick manually; none → unassigned), one fewer dimension. VAT-derivation on
  property change (`vat_treatment`/`vat_deductible_pct`) now reads `properties.vat_status`.
- `/geschaeftsbereiche` route deleted entirely (was a pure read-only property × business_line ×
  company matrix view; nothing else referenced it).
- Assignment-rule dialog (`neue-regel-dialog.tsx`) and both rule list screens
  (`zuordnungsregeln/index.tsx`, `freigabe-regeln/index.tsx`) had their business-line scope
  field/column/filter/stat removed; the rule engines themselves are otherwise unchanged.

## What's still open

1. **The external Python ingestion pipeline's resolver is not updated.** `the pipeline's own documentation`
   documents `adapters/assignment/resolver.py` as still reading the old
   `property_assignment`/`business_line` shape. Its join key needs to become
   `property → company(ies)` directly, ambiguous when a property links to more than one company.
   That's pipeline-repo work, out of scope for this repo.
2. **"Always notify when a property is unassigned"** (the client's literal 2026-08-04 ask) is
   covered only minimally: the existing empty-state `GesellschaftChip` on `/objekte` and the
   inline validation blocking the form. There's no proactive push/toast/dashboard notification
   system. If the client expects an active alert (not just a passive visual signal on the list
   page), that's a follow-up feature, not covered here.
3. **`supabase/schema.sql`** is a pre-existing stale snapshot (2026-07-02, predates even the
   English table rename in migration `0007`) — not regenerated as part of this change.
