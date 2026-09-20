# Making the kit granular, and putting it in Storybook

The kit is now ours, in `src/kit`: **42,766 lines**, 45 UI primitives, 96 components, 148 page files.
It works, and almost none of it can be looked at on its own. This is the plan for going through it
one piece at a time.

## What "granular" means here, concretely

A file is a candidate when any of these is true:

- it is over about **400 lines**;
- it renders more than one thing a person would name separately (a header, a filter bar, a table, an
  empty state, three dialogs);
- a piece of it is obviously wanted elsewhere and cannot be reached;
- it cannot be rendered without a database, because everything it needs is fetched inside it rather
  than passed in.

The worst offenders today:

| File | Lines |
|---|---|
| `ui/sidebar.tsx` | 884 |
| `pages/invoice-detail/InvoiceDetailPage.tsx` | 879 |
| `pages/trash/trash-page.tsx` | 842 |
| `pages/processing-log/processing-log-page.tsx` | 831 |
| `pages/document-sources/SourceSettingsSheet.tsx` | 681 |
| `components/shell/shell.tsx` | 636 |

## The method, per piece

1. **Read it and name the parts.** If a part cannot be named in two or three words, it is not a part
   yet.
2. **Extract each into its own file**, in the same folder, exporting a component that takes props
   and fetches nothing.
3. **Leave the original as the composition**: it imports the parts and arranges them. It should get
   much shorter and read like a table of contents.
4. **Prove nothing changed**: typecheck, lint, and the screen walk. A refactor that changes
   behaviour is a different commit.
5. **Write its stories** while the shape is fresh: the normal case, empty, loading, error, and the
   one state that is hard to reach in the real app.

No behaviour changes in the same commit as a move. That rule is what makes the walk script a real
check rather than a formality.

## Why the pages can be storied at all

The kit takes **adapters**: a page is handed `useInvoices()` and friends rather than calling the
database itself. So a story supplies a fake adapter and the page renders with no server at all. If a
page cannot be storied, that is the adapter boundary leaking, and finding those is half the value of
doing this.

## Order

**A. The 45 UI primitives.** Smallest, most reused, and they set the pattern: one story file per
primitive, every variant on one page. This is also where a change today silently affects every
screen, so it is where a catalogue pays first.

**B. The 96 components.** Split anything over 400 lines, then story it. `shell.tsx` at 636 lines is
the one to do carefully, since every screen sits inside it.

**C. The 148 page files.** Hardest and last. Split the five largest, story them against fake
adapters, and treat any page that resists as an adapter problem to fix rather than a story to skip.

## What Storybook is for here, and what it is not

It is for building and reviewing a component on its own, and for seeing the states nobody clicks
through to: an empty trash, a failed sync, a table with one row, a dialog mid-save.

It is **not** a demo for a prospective client. That is the template deployed with seed data and the
switches set, which is a different job and already planned.

It is also not a replacement for the screen walk. The walk answers "does the real app still work",
the stories answer "does this piece look right in every state". Both, or neither is trustworthy.
