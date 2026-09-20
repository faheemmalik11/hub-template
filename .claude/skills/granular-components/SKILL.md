---
name: granular-components
description: How to break a kit page into parts a client can arrange themselves. Load this before editing anything in src/kit, before adding a page or a widget, and whenever a file passes about 400 lines. Covers the four shapes every conversion produces, the order of work, and how each step is proved.
---

# Making a page granular

The kit holds **parts**, not finished screens. A client arranges the parts their own way, because the
same page differs per business: which columns, which widgets, which actions.

A page may compose. It may not fetch, hold business rules, or own state that another arrangement
would need.

## The four shapes

Five conversions have produced the same four every time. Look for these before inventing anything.

| Shape | What it is | Examples |
|---|---|---|
| **View hook** | filters, sort, paging, selection. Takes rows, returns the rows to show | `useInvoiceListView` |
| **Columns as data** | one function per column returning `{ key, header, cell }`, and a table that renders whatever list it is given | `defaultInvoiceColumns`, `InvoiceTable` |
| **Form hook** | current values, what changed, saving, the failure | `useSourceForm`, `useInvoiceEdit` |
| **Actions hook** | what a person can do, each with its own state and error handling | `useInvoiceActions` |
| **Selection** | ticked rows kept **by key, not by index**, so filtering or paging cannot silently change what a bulk action is about to touch | `useTrashView` |

Anything left is a **widget**: a component that owns its own data and renders one thing.
`TrendChartWidget`, `SourceList`, `FilingStatusCard`.

## The method

1. **Read the file and name the parts.** A part you cannot name in two or three words is not a part.
2. **Take the logic out before the markup.** Hooks first: that is where the rules hide, and a hook
   moves without touching a single class name.
3. **One file per part**, in `src/kit/widgets/<area>/`, exporting through an `index.ts`.
4. **Leave the page as the arrangement.** It should read like a table of contents.
5. **Keep the page's props identical** so nothing that uses it has to change.

## Never in the same commit

A move and a behaviour change. If both are in one diff, the screen walk cannot tell you which one
broke something.

## Proving it

After every conversion, all three, and the walk more than once:

```bash
npx tsc -p tsconfig.typecheck.json --noEmit     # 0
npx eslint src --quiet                          # 0
node scripts/walk-screens.mjs                   # all 29 screens clean
```

A screen that renders before its slowest query fires looks fine, which is why the walk runs three
times.

## What to look for while reading

The valuable extractions have all been logic somebody got right once and buried:

- **`useDependentFieldOptions`**: reloads a field's choices when the field it depends on changes,
  clears the stale value so it cannot be saved, and ignores a response that arrives late.
- **`changedFields`**: sends only what changed, with labels, so the history says what a person
  actually altered.
- **`useFokusHighlight`**: scrolls to a deep-linked field and flashes it, polling because the sheet
  opens after the link is read.

Each was a private function inside a 700-line file. Finding them is the point of the exercise.

## Done so far

| Page | Before | After |
|---|---|---|
| overview | 366 | 219 |
| invoice-list | 409 | 165 |
| document-sources | 466 | 150 |
| source settings sheet | 681 | 553 |
| invoice-detail | 879 | 705 |
| processing-log | 831 | 790 |
| trash | 842 | 790 |

`team` was already granular: 7 files, largest 358 lines. Nothing over 700 lines is left except
`ui/sidebar.tsx` (a shadcn primitive), `intent-classification.ts` (logic that belongs in one file),
and the three pages above, whose remainder is markup.
