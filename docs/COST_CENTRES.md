# Cost centres: a property, or Gemeinkosten

## What the client asked for

Saskia, this client meeting 09.09.2026, 11:12 to 13:03:

> We have all of the properties in the system, but we don't have "overhead costs." For us, the
> properties are effectively our cost centres. ... At our tax adviser, each property is effectively
> one cost centre, and everything else goes into overhead costs. ... **If it says "overhead costs,"
> then there is no property.**

Her reason, at 12:36: *"Mainly because of the transfer later."* This is about what reaches the tax
adviser, not about the screen.

The gap was that the Hub had the property half and nothing for overhead, so an invoice belonging to
no building could only be marked "Keine, trifft nicht zu". That is the ABSENCE of an answer. Overhead
is a positive statement that carries a cost-centre number, and the two must not export the same way.

## What is implemented

### The number lives on the property/company link

`property_companies.cost_center_number` (migration `20260911250000_cost_centre_property_or_overhead.sql`).

Not on the property, because the tax adviser's workbook numbers the same building differently in
each company's books:

| Property | this client | Impuls | My Baufi | Infio |
|---|---|---|---|---|
| LU-EKS Ludwigshafen | 6 | 101 | | |
| LA-HIN Hinterstraße | 2 | | | 2001 |
| B-AMD | 10 | | 1001 | |

Migration 0077 had already reached this conclusion and put the column on `property_assignment`;
migration 0083 replaced that table with `property_companies` and the column went with it. This puts
it back.

The overhead counterpart is `companies.overhead_cost_center`, seeded by 0077: 10000 for this client and
Infio, 1000 for Impuls, My Baufi and this client Gronau.

### Why this migration seeds pairings when 0077 refused to

0077 declined to seed `property_assignment` because its only evidence was column D of the workbook:
free-text prose naming one or two companies with no role, where "My Baufi" alone sat next to a note
saying this client rents the office. That column is not a reliable pair.

The cost-centre NUMBERS are different evidence. Each company's own sheet lists the properties booked
in that company's accounts, one number per line. A number under Impuls is the tax adviser stating
that Impuls books that property, which is exactly what a `property_companies` row asserts. 21
pairings are seeded from it, and `on conflict do update` only ever fills a number that is still
null, so a link a person made or corrected keeps its own value.

### Gemeinkosten on the invoice

`invoices.is_overhead boolean not null default false`, with
`check (not (is_overhead and property_id is not null))` enforcing Saskia's rule in the database.

A boolean rather than a magic property row: a cost centre that is not a building has no address, no
VAT status and no company link, so a fake property would need every one of those columns to mean
"ignore me".

Three states, all distinguishable:

| `property_id` | `is_overhead` | Means |
|---|---|---|
| set | false | books to that property |
| null | true | books to the company's overhead |
| null | false | **nobody has decided yet** |

### On screen

`GEMEINKOSTEN` in `src/features/invoice-detail/InvoiceDetailPage.tsx` is a form-only sentinel; the
column is what gets written. It appears in both places the property is chosen:

- the Zuordnung editor's property picker, listed with the properties rather than beside them,
  because it is the other answer to the same question
- the "Braucht deine Eingabe" card, which is where an unresolved invoice is actually finished

Both write paths translate it: `speichern()` for the editor and `zuordnungVerknuepfen()` for the
card, each clearing `property_code`/`property_id` and setting `is_overhead`.

The read view shows **Gemeinkosten** as the value and the resolved number underneath: property plus
company for a property, the company's overhead number for Gemeinkosten. **She never picks a number.**
Where a pairing has no number the line says so rather than falling back to overhead, because that is
a master-data gap worth seeing.

### The resolver is shared (14.09.2026)

The rule used to live as a `useMemo` inside `InvoiceDetailPage.tsx`, which is why nothing else could
show a cost centre. It is now `src/lib/data/kostenstelle.ts`:

- `resolveKostenstelle(eingabe, stammdaten)` is the pure rule. Returns `null` when no cost centre can
  be named at all (unknown company, or a property that is not in the master data), and
  `{ nummer: null }` when the pairing exists but carries no number. Callers must keep those apart:
  the first renders nothing, the second says the number is missing.
- `useKostenstelleResolver()` is the same rule bound to `useGesellschaften`, `useObjekte` and
  `usePropertyCompanies`, for screens resolving many rows. One resolver per screen rather than a
  hook per row: all three queries are unscoped single requests React Query already dedupes, so a
  list of 50 rows costs what one row costs. Its `bereit` flag is separate from the result because a
  row rendering before the master data lands must show nothing, not "cost centre missing".

`InvoiceDetailPage` resolves from the FORM, not the saved row, so the number follows the property
while it is being changed instead of lagging a save behind. That is why the resolver takes a
`gemeinkosten` boolean rather than reading `is_overhead` itself: the detail page passes
`form.property_code === GEMEINKOSTEN`, every other caller passes `beleg.is_overhead`.

### Where it is shown

| Screen | Shows |
|---|---|
| Invoice detail | The number under the Objekt field, plus "Keine Kostenstelle hinterlegt" for a pairing without one |
| Invoice list (table + mobile cards) | `KostenstelleZeile` under the company chip, `belege.list.row.kostenstelle` / `.kostenstelleFehlt` |
| Property detail, Gesellschaften section | The number this property carries **in that company**, one per assignment row, `objekte.detail.kostenstelle` / `.kostenstelleFehlt` |

The property page is where the per-company numbering is visible as a fact rather than inferred: one
row per company, each with its own number, which is the workbook's structure on screen.

### Migration `20260914120000_invoices_list_is_overhead`

The list could not show this until `is_overhead` reached it. `v_invoices_list` was rebuilt by 0055
as `select i.*`, which Postgres expands and **freezes** at creation time, and every rebuild since
(20260813170000, 20260901210000) wrapped that frozen definition. A column added to `invoices`
afterwards therefore never appears. `v_invoices_review` embeds its own expanded copy of the same
list, so replacing `v_invoices_list` does not reach it either.

The migration wraps both views with a LEFT JOIN on the primary key, reading each current definition
through `pg_get_viewdef` rather than restating it, following the pattern 20260901210000 established.
`with (security_invoker = true)` is repeated on both because CREATE OR REPLACE VIEW replaces
reloptions wholesale, and dropping it would be an RLS bypass on every invoice.

`BELEGE_LISTE_SPALTEN` in `queries.ts` gained `property_code` and `is_overhead`. **Any further
column added to `invoices` and needed by a list screen needs the same wrap**, the views will not
pick it up on their own.

## Editing the numbers (17.09.2026)

Saskia asked on an invoice for Heddesheim (HED-GÄ): *"Was ist hiermit gemeint? Wo kann ich die
Kostenstelle auswählen?"* The property is not in the tax adviser's workbook, so neither of its
pairings (this client, My Baufi) had a number, and "Keine Kostenstelle hinterlegt" read as a field she had
to fill in. Until now nothing in the Hub could set a number; only a migration could.

The number stays out of the invoice on purpose: it is a fact about a property in one company's books,
so typing it per invoice would let one building carry several numbers. It is set once, where it
lives:

| Where | What | Who |
|---|---|---|
| Objekte → property → Gesellschaften card | Add company, Edit and ✕ per row. Add and Edit open one modal: company plus number | Assigning: anyone. Number: admins |
| Gesellschaften → company → Objekte card | The same from the other side: Add property, Edit and ✕ per row, same modal with the property to pick | Same |
| Gesellschaften → company → Bearbeiten | `companies.overhead_cost_center`, also shown in the company's details | Admins |

The modal is `ZuordnungDialog` in `src/components/objekte/zuordnung-dialog.tsx`, used by both pages
with the fixed side passed in (`fest`). The dropdown leaves out what is already assigned on that side,
except the row being edited, and archived properties. Edit and ✕ show on hover (always on a phone).
✕ opens a confirmation; a property's last company cannot be removed, from either page.

`useSavePropertyCompanyLink` in `queries.ts` handles add, change of number, and moving an assignment
to another company or property (new row first, then the old one soft-deleted, so a failure never
leaves neither). `useRemovePropertyCompanyLink` soft-deletes. Both report themselves and turn the
unique-index and permission errors into German sentences.

The invoice detail also shows the company's overhead number under the Gesellschaft field
("Kostenstelle Gemeinkosten 10000"), with a link to the company when it is missing.

Migration `20260917150000_cost_centre_number_insert_guard.sql` extends the trigger to INSERT: adding a
company together with a number is also admin-only. Tested like the first migration: a non-admin can add
and remove an assignment without a number, and is refused a number on insert and on update.
`useUpdateGesellschaft` now reports itself the same way, since `companies` is admin-only to update.

Migration `20260917140000_cost_centre_numbers_editable.sql`:

- a BEFORE UPDATE trigger, `guard_cost_center_number()`, refuses a changed number unless `is_admin()`,
  or the caller has no `auth.uid()` (service role, migrations). A trigger rather than an update
  policy, because `property_companies` lets any signed-in user change the ASSIGNMENT
  (`using (true)`), and a policy cannot tell which column changed;
- `cost_center_number > 0` and `overhead_cost_center > 0`;
- a unique index on `(company_id, cost_center_number)` among live assignments. The same number in two
  companies stays allowed.

Checked on a throwaway Postgres before shipping: service role and admin can set and clear, a
non-admin is refused on the number but can still change the assignment, a duplicate within a company,
zero and a negative overhead are refused. Live data had no duplicates or non-positive values.

The invoice line (`KostenstelleHinweis` in `InvoiceDetailPage.tsx`) now says which master data is
missing and links to it:

| Case | Text | Link |
|---|---|---|
| Property assigned to the company, no number | "Für dieses Objekt ist bei dieser Gesellschaft keine Kostenstellen-Nummer hinterlegt." | Beim Objekt hinterlegen |
| Property not assigned to the company | "Dieses Objekt ist der Gesellschaft nicht zugeordnet, daher keine Kostenstelle." | Beim Objekt zuordnen |
| Gemeinkosten, company has no overhead number | "Für diese Gesellschaft ist keine Gemeinkosten-Kostenstelle hinterlegt." | Bei der Gesellschaft hinterlegen |

`resolveKostenstelle` returns `gesellschaftId` and `verknuepft` for this, so the three cases can be
told apart.

Gaps at the time of writing (17.09.2026), all needing a number from Saskia or the tax adviser, 14
live invoices affected: HED-GÄ at this client and at My Baufi (not in the workbook), and FT-KAR, NW-FHS5 and
NW-WBS at this client (the workbook numbers them only for My Baufi, so the this client link may simply be wrong).

## Still open

- **The number does not reach the DATEV export yet.** That is the whole point of it for her ("mainly
  because of the transfer later"), and it is blocked on D1, who exports to DATEV, Pleo or the Hub.
- **Pleo already holds this assignment.** Saskia at 13:03: *"almost everything is already available
  here in Pleo. Then we could completely avoid doing the assignments again."* `pleo-sync` already
  stores the whole entry in `bank_transactions.raw_data`, including `teamId`, `tags` and
  `accountCode`, so nothing needs fetching. Which of those carries her cost centre has to be read
  off a live row before it can be mapped.
- **Only 21 pairings have numbers**, the ones the workbook lists. Since 17.09.2026 an admin can add the rest in the Hub (see above).
- **The seed originally landed 17, not 21** (found 14.09.2026). 20260911250000 joins `properties`
  with `p.deleted_at is null`, so it skipped the four pairings whose property is archived: IMPV
  BR-BRE 102, MYBA FT-KAR 1005, STAY FT-RAI 3, STAY FT-WES 7. Three of them carry invoices.
  Migration `20260914130000_cost_centre_archived_pairings` fills them, and states why an archived
  property still needs its number: archiving governs what can be chosen next, not what was already
  booked. **A pairing added to the workbook list in future must not inherit that `deleted_at`
  filter** unless the intent really is to skip sold buildings.
- **Whether sold or ended objects should be archived at all is an open question with the client**
  (sent to Saskia, 14.09.2026, alongside the Gemeinkosten numbering and whether the list is still
  current). It is what made the gap above visible. A property linked to a company the
  workbook does not pair it with resolves to no number.
- **The Kostenanalyse still does not show it, on purpose.** `src/features/cost-analysis/` is copied
  byte-identical across four Hubs (see the header of its `adapter.ts`), and cost centres are this client's
  concept alone, so a column there would break the other three. The deeper problem is that the
  screen's property filter is not company-scoped: with the company filter on "alle", a property has
  no single number, and printing one would be wrong rather than merely absent. Showing it there
  needs the screen to resolve company AND property together, which is a change to the shared
  feature's meaning, not a display tweak.
