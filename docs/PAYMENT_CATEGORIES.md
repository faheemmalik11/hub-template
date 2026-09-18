# Payment categories

Cost/revenue categories: the label that says _what kind of spend or income_ a document or
bank transaction was. Feeds the assignment rules, the Auswertungen cost report, and
eventually the DATEV handover.

Client source: `communication/threads/2026-08-04-scope-clarification/04-inbound-client.md`
and its attachment `assets/bilingual-payment-category-specification.pdf` (8 pages).

## Where it lives

| Layer            | File                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| Management UI    | `src/routes/zuordnungsregeln/index.tsx`, `KategorienTab` (a tab, not its own route) |
| Read/write hooks | `src/lib/data/queries.ts`, `useBwaCategories` and the `*BwaCategory` mutations      |
| Type             | `src/lib/data/types.ts`, `BwaCategory`                                              |
| Table            | `bwa_categories` (migration `0043_hub_bwa_categories.sql`)                          |
| Tabs + ordering  | migration `0076_hub_category_tabs_and_order.sql`                                    |
| Report structure | `src/lib/data/bwa-skeleton.ts`                                                      |

Categories are also selected on the invoice detail page, bank transactions, manual
bookings, and assignment rules. Those consumers were already wired and were not touched.

## Spec vs implementation

| Client requirement                                 | State                                                     |
| -------------------------------------------------- | --------------------------------------------------------- |
| Two tabs, Zahlungseingänge / Zahlungsausgänge      | done, `direction` column + tab switcher                   |
| Parent plus subcategories                          | already existed                                           |
| `Kategorie erstellen` creates a top-level category | already existed                                           |
| `+` on a parent creates a subcategory beneath it   | done, `+` per parent row, parent pre-selected             |
| Edit / rename / delete, `...` menu                 | already existed (delete is a soft delete)                 |
| Expand / collapse                                  | already existed                                           |
| Drag to reorder                                    | done, `sort_order` column + HTML5 drag, no new dependency |
| German labels exactly as listed                    | **not done**, see below                                   |
| Add categories without changing code               | done, and improved: `code` is now derived from the name   |

## What migration 0076 adds

- `direction` (`eingang` / `ausgang`), NOT NULL default `ausgang`, backfilled from `bwa_block`
  (`einnahmen` becomes `eingang`; children follow their parent). Kept as its own column rather
  than derived from `bwa_block`, whose six values do not split into two tabs, and so the tabs
  survive a BWA removal.
- `sort_order` integer, seeded in steps of 10 in the previously visible alphabetical order, so
  enabling drag did not reshuffle anything. Ordering is per level: parents among parents,
  children among their siblings.

Additive only. `bwa_block` and `bwa_line` were deliberately left alone.

## The create form no longer asks for technical fields

`code`, `bwa_block` and `bwa_line` used to be typed by hand. All three are now derived:

- `code` from the German name (`codeFromName`), umlauts transliterated, collisions get a
  numeric suffix because `bwa_categories_code_uniq` would reject a duplicate.
- `bwa_block` from the tab for a new parent (`eingang` → `einnahmen`, else `kosten`), or
  inherited from the parent for a child, which is what the form already did.
- `bwa_line` from the derived code, or inherited.

A bookkeeper now types a name and an optional note. That is what the spec's acceptance
criterion requires.

## Open: the taxonomy is still Immonetz's

The live database holds **106 categories (20 parents, 86 children) from Immonetz**:
Raumkosten, Kfz-Kosten, Abschreibungen, Materialaufwand. Stäy's list from the specification
(Betriebskosten, Reisekosten, Personalkosten, Marketingkosten, and 10 more) is **not loaded**.

Replacing it is currently free. Verified against the live DB:

| Table                 | Rows referencing a category |
| --------------------- | --------------------------- |
| `invoices`            | 0 (table is empty)          |
| `assignment_rules`    | 0                           |
| `bank_transactions`   | 0 of 2,047 categorised      |
| `bwa_account_mapping` | 0                           |

Nothing points at the old categories yet, so a reseed is a delete and insert. Once invoices
flow in, the same change becomes a data migration.

### Why it was not reseeded in this pass

`src/lib/data/bwa-skeleton.ts` drives the Auswertungen cost report and is hardwired to twenty
Immonetz category **codes** (`REVENUE`, `COGS_MATERIAL`, `OCCUPANCY`, `PERSONNEL`, …), which
are exactly the 20 parents in the database. Swapping in Stäy's codes (`SR`, `BL`, `OC`, `TR`,
`PC`, …) would leave every report line summing nothing: no crash, just a screen of zeros.

That skeleton was reproduced from _Immonetz's_ client's DATEV Form 01, with an explicit
instruction from that client not to reorder or merge its lines. It is not Stäy's structure.

So reseeding is blocked on awaiting-client item 10 in `communication/INDEX.md`: **does "NO need
for Live BWA" mean drop the live view, or drop BWA categorisation entirely?**

- BWA dropped → `bwa-skeleton.ts` goes away, Auswertungen groups by Stäy's own categories,
  and `bwa_block` / `bwa_line` can become nullable.
- BWA kept → someone must map Stäy's 14 parents onto the DATEV Form 01 lines. That is a tax
  advisor's decision.

Either way the work done here holds: tabs, ordering and the simplified form are independent of
which taxonomy is loaded.

## Also still open

- **No account numbers.** `bwa_account_mapping` is empty. The client's PDF states it is a
  product taxonomy, not a chart of accounts, and contains no account numbers. Blocks reporting
  and the DATEV handover. Awaiting-client item 1.
- **Not its own route.** The spec's mockup shows a standalone Kategorien page; today it is a
  tab inside `/zuordnungsregeln`. Cosmetic, not blocking.
- Drag and drop is HTML5 native, so it is mouse-driven only. No keyboard reordering.
