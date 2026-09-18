# Bank account form — one component, one set of rules

Two screens create or edit a `bank_accounts` row. Until now each had its own form, its own
required-field logic and its own (absent) validation, so what the Bankkonten dialog accepted and
what the manual-import wizard accepted were different things. This doc records the shared pieces
they now both go through.

Related: `docs/BANK_MANUAL_IMPORT.md` (the wizard), `docs/BANK_ACCOUNT_REMOVAL.md` (deleting an
account), `docs/audit/bankkonten/bank-accounts/ISSUES.md`.

## What was broken

1. **"Neues Konto" could never work.** `bank_accounts.connection_id` was `not null` from migration
   `0003`, but an account typed in by hand has no BANKSapi connection behind it, so both create
   paths inserted `null` and the database refused the row:
   `null value in column "connection_id" of relation "bank_accounts" violates not-null constraint`.
   The rest of the code already assumed it was optional — `BankAccount.connection_id` is typed
   nullable, and `supabase/functions/bank-sync/index.ts` explicitly skips rows without one when
   building its `(connection_id, banksapi_product_id)` lookup, because it expects to _adopt_ a
   hand-seeded row by IBAN on the next sync. `bank_transactions` had the same `not null` dropped in
   migration `0071`; `bank_accounts` was simply missed.
2. **No validation beyond "the name is not empty".** `324324324` was accepted as an IBAN and as a
   BIC. That matters more than it looks: `bank_accounts_iban_uniq` (migration `0028`) is a partial
   unique index on the _normalized_ IBAN, so junk in that column is compared against real ones.
3. **A name on its own could be saved as an account.** Even after shape checks were added, every
   field except the name was still optional, so `dsfdsf` with no company, no IBAN, no holder and no
   type became a row — and an account with no company is readable by every signed-in user, because
   `has_company_access(null)` is TRUE by design.

## Migration

`supabase/migrations/20260901100000_manual_bank_account_needs_no_connection.sql` — applied to the
live project on 2026-09-01.

```sql
alter table public.bank_accounts alter column connection_id drop not null;
```

Verified against the live PostgREST schema: `connection_id` no longer appears in the
`bank_accounts` `required` list.

## The rules, in one file

**`src/lib/data/bank-account-fields.ts`** — no React, no zod, so both the browser and the server
functions import it.

- `BankAccountFields` — the eight editable columns. `src/lib/data/queries.ts` now aliases
  `BankAccountFormValues` to this type rather than redeclaring it.
- `BankAccountRules` — which fields are mandatory. Two named sets live here so a form and the server
  function behind it are handed the same object:

  |                | `BANK_ACCOUNT_DIALOG_RULES`          | `BANK_ACCOUNT_IMPORT_RULES` |
  | -------------- | ------------------------------------ | --------------------------- |
  | name           | required                             | required                    |
  | company        | required                             | required                    |
  | IBAN           | required unless the type is a card   | required                    |
  | account holder | required                             | not shown                   |
  | type           | required                             | not shown                   |
  | currency       | required (prefilled `EUR` on create) | not shown                   |
  | BIC, bank      | optional, checked if filled          | optional, checked if filled |

  The IBAN waiver is driven by `isCardType(productType)`, matching `card`/`karte` case-insensitively
  — a card is identified by its number, not an IBAN, and the one live card (`BusinessCard`,
  MASTERCARD) has none. `Type` is therefore a picker over `BANK_ACCOUNT_PRODUCT_TYPES`, not free
  text; a value already on the row that is not in that list is kept as an option so editing an
  account the feed labelled something new never silently drops it.

  Checked against live data: all 12 feed accounts and the card pass these rules unchanged, so
  editing an existing account is unaffected. The only rows that fail are the hand-typed test rows.

- `validateBankAccountFields(values, rules)` → `Partial<Record<field, BankAccountErrorCode>>`. The
  codes are i18n keys under `bankAccountForm.invalid.*`, so a message is never written twice.
  - IBAN: `isPayableIBAN` (`format.ts`) — two letters, two digits, then 11–30 alphanumerics. Shape
    only, deliberately the same test as the `supplier_bank_accounts_iban_shape` constraint. Not the
    mod-97 checksum.
  - BIC: `isBIC` — `^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$`. The leading six must be letters (four for
    the institution, two for the country), which is why an 8-character value like `WQE2323W` is
    still rejected.
  - Currency: `isCurrencyCode` — three letters. Shape only, not a real ISO 4217 membership test.
  - Length caps on name/holder/bank/type live in `BANK_ACCOUNT_LIMITS`.
- `normalizeBankAccountFields(values)` — what actually reaches the database: trimmed, blanks to
  `null`, IBAN through `compactIBAN`, BIC space-stripped and upper-cased, currency upper-cased. Both
  server functions call it, so `eur` is stored as `EUR` and a pasted IBAN with spaces still matches
  the unique index.

## The form, in one component

- **`src/components/bank/use-bank-account-form.ts`** — `useBankAccountForm(initial?, rules?)` holds
  the values, the per-field `touched` set, the derived `errors`, `isValid`, `isDirty`, and `reset()`.
  `showError(field)` is true only once the field has been **left**, so a half-typed IBAN is not
  flagged mid-keystroke. `reset()` re-seeds the dirty baseline and clears touched.
  `isDirty` compares the **normalized** values against the baseline, so re-typing `eur` as `EUR` or
  adding a space to an IBAN is not a change — what counts is whether the row that would be written
  differs. Save is disabled unless the form is both valid and dirty.
- **`src/components/bank/bank-account-form-fields.tsx`** — renders name and company always, then
  whichever of `iban, bic, bankName, holder, productType, currency` the caller lists in `fields`.
  `requireCompany` drops the "Keine Gesellschaft" option and the accompanying warning (which exists
  because `has_company_access(null)` is TRUE by design, so an unassigned account's movements are
  readable by every authenticated user).

Consumers:

| Screen                      | File                                                 | Rules                       | Fields              |
| --------------------------- | ---------------------------------------------------- | --------------------------- | ------------------- |
| Bankkonten create/edit      | `src/components/bank/bank-account-dialog.tsx`        | `BANK_ACCOUNT_DIALOG_RULES` | all                 |
| Manual-import wizard step 1 | `src/components/bank/manual-import-account-form.tsx` | `BANK_ACCOUNT_IMPORT_RULES` | iban, bic, bankName |

Required fields carry a `*` on their label, and the star disappears from IBAN as soon as the type is
set to a card.

**Not in scope:** `src/components/suppliers/bank-account-dialog.tsx` and
`bank-account-drafts.tsx` write `supplier_bank_accounts`, a different table with its own default-
account rule. They keep their own form and their own IBAN check (the same `isPayableIBAN`).

## Server side

Both endpoints delegate to the same functions rather than restating the rules in zod:

- `src/lib/api/bank-accounts.functions.ts` — `BankAccountShape` is shape-only; `bankAccountRules` is
  a `superRefine` callback shared by `EditableFieldsSchema` and `UpdateBankAccountSchema` (the
  latter is `BankAccountShape.extend({accountId})`, since `superRefine` returns a `ZodEffects` that
  has no `.extend`). `toRow()` runs `normalizeBankAccountFields`.
- `src/lib/api/bank-manual-import.functions.ts` — `CreateManualBankAccountSchema` maps its five
  fields onto `BankAccountFields` and calls the same validator with `BANK_ACCOUNT_IMPORT_RULES`. The
  insert and the IBAN-conflict lookup both use the normalized IBAN.

Client-side validation is the readable half; these are the backstop. Neither endpoint trusts the
form.

## Meeting point 17 — "make it obvious whose account or card each one is"

Saskia, at 34:29: the accounts need better names, and she only knew the card labelled "Business
Card" was hers because she recognised the transactions. Petra: she thought the Mastercards were
mixed between Saskia's and Alexis's and asked how she is meant to tell them apart. Fabian: renaming
is not a problem, and Petra should send back what would read best.

Done on our side:

- **Renaming works and survives the sync.** `bank_accounts.name_is_custom` (migration
  `20260815120000`) marks a hand-typed name so the hourly BANKSapi sync stops overwriting it with
  the bank's own label.
- **The account holder is shown under the account name** on the Bankkonten table (desktop and the
  mobile card), but only when it says something the Company column does not. It was already
  searchable and never displayed, and it is the only field that answers "whose is this" — but a
  column of its own repeated the company on 12 of 13 rows (`IMPULS 1 VV GMBH` next to
  `Impuls VV GmbH`). `shownHolder()` in `src/routes/bankkonten/index.tsx` compares letters only, so
  casing, punctuation and the stray `1` in `IMPULS 1 VV GMBH` do not count as a difference, and
  title-cases a value that arrives in all caps. Live, exactly one row gets a second line:
  `BusinessCard` → `Dr. Saskia Christ`.
- **Cards are distinguishable in every dropdown.** `kontoLabel` used the last four IBAN digits to
  tell same-named accounts apart, which is empty exactly for a card. It now falls back to the
  holder, and `eindeutigeKontoLabels` does the same before resorting to a uuid slice. The one live
  card reads `BusinessCard · STAY · DR. SASKIA CHRIST` instead of `BusinessCard`.
- **A duplicate name is flagged** in the table (`DubletteBadge`), which is what makes the ten
  identically-named feed accounts visible as a problem rather than a coincidence.

Still open, and not ours to close:

- **Nobody has renamed anything yet.** All 12 feed accounts still carry the bank's product category
  as their name (`Sichteinlagen` ×5, `Sonstige Darlehen` ×5), `name_is_custom` false on every one.
  Fabian asked Petra for the naming she wants; that is the outstanding input.
- **Alexis's and Andi's cards are not connected.** Saskia said she is the only one who has connected
  anything, and it is undecided whether they connect their own Mastercards or everything moves to
  Pleo. Until then there is exactly one card in the system, so the "which Mastercard is this"
  problem cannot be fully exercised.
- **Pleo is not shown.** Fabian noticed during the call that Pleo data had been imported but was not
  appearing on the screen, and said it should be listed separately. Not investigated here.

## Still open (form)

- Checksums are not verified for IBAN, and neither BIC nor currency is checked against a real
  registry. Shape only, on purpose.
