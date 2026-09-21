---
name: data-layer
description: How the app talks to the database. Load this before writing any query, mutation, React Query hook or server function, before importing the Supabase client, and before typing a table name in TypeScript. Covers the one-place rule, where a new query goes, query keys, and the boundary an eslint rule enforces.
---

# The data layer

**No file outside the data layer names a table, builds a query, or imports a database client.** A
screen asks for what it needs by name and gets typed rows back. That is the whole rule.

## Where things are

| Where | What |
|---|---|
| `src/config/tables.ts` | every table and view name, spelled once. A renamed table is one edit here, and a name that no longer exists fails to compile |
| `supabase/functions/_shared/tables.ts` | the Deno twin of that list. Edge Functions cannot import from `src/`, so a rename touches both |
| `src/data/index.ts` | **the only thing the app imports.** Re-exports every domain, so a hook can move without a call site changing |
| `src/data/client.ts` | the one `sb` handle, `STALE`, `actorEmail`, `insertChangeHistory`, `SINGLETON_ROW_ID` |
| `src/data/shared.ts` | helpers several domains need: `fetchAllRows`, `pflichtGrund`, `invalidateMatchState`, `invalidateRuleState`, `hasNextInfinitePage` |
| `src/data/keys.ts` | query keys, one factory per domain |
| `src/data/<domain>/` | one folder per subject: settings, suppliers, rules, team, bank, approval, review, categories, handover, folders, tax, manual-bookings, outgoing-invoices, aliases, pipeline |
| `src/lib/api/*.functions.ts` | server functions. Elevated rights live here and nowhere else |

`src/lib/data/queries.ts` is what is left of the original 9,829-line file, and it is shrinking. Do
not add to it: new work goes in a domain folder.

## Moving a domain out

1. Cut the section. **A section ends where the next section marker begins**, never at the end of the
   file: cutting to EOF swallows every domain below it.
2. Write `src/data/<domain>/<domain>.ts`, then let the compiler list the imports it needs.
3. Write `index.ts` with **values and types exported separately**:
   ```ts
   export { useThing } from "./thing";
   export type { ThingRow } from "./thing";
   ```
   Re-exporting a type as a value passes `tsc` and then fails in the browser with
   *"does not provide an export named X"*. Only the screen walk catches it.
4. Add one line to `src/data/index.ts`.
5. A helper both sides need goes to `src/data/shared.ts`, not copied.
6. Verify: typecheck, lint, and `node scripts/walk-screens.mjs`.

## Adding a query

1. Find the domain. If there is no obvious one, that is a sign the query belongs to two and should
   be two.
2. Read first, write second: reads are `useQuery`, writes are `useMutation` and live in the file
   beside them.
3. Name it for what a person asked for, not for the tables it touches. `useUnpaidDocuments`, not
   `useDocumentsJoinMatches`.
4. Never type a table name. `supabase.from(TABLE.documents)`, always.
5. Never type a query key inline. Keys come from one factory per domain, because two files spelling
   the same key differently is the most common bug in a layer like this, and it shows up as a
   screen that will not refresh.

## Reading rows

- The generated `Database` type covers a minority of the tables, so most reads and every write use
  an untyped cast. Keep new code consistent with what is around it rather than inventing a third
  style.
- A view is the right place for a computation two screens share. A hook is the right place for a
  computation one screen shows. Never the component.

## Server functions

- They run with elevated rights, so everything a browser may not do lives there and **nowhere else**:
  reading a credential, calling a provider, anything using the service role key.
- One client, in one file. If a second `createClient` call appears anywhere, that is the bug.
- A server function still respects the same permission model. Elevated rights are for reaching the
  API, not for skipping a check the database would have made.

## The boundary

An eslint `no-restricted-imports` rule fails the build when a file outside the data layer imports
the client or the table list. It is a rule rather than a convention because a convention survives
exactly as long as the person who remembers it.

Two files currently break it, `src/lib/tour/use-tour-seen-store.ts` and
`src/lib/api/bank-accounts.functions.ts`. They are known, and they come in with the split.

## What the database already does for you

Do not re-implement in TypeScript what `planning` and the `schema` skill describe as living in SQL:

- **Permission checks.** RLS asks the same resolver the menu asks. A query that returns nothing for
  a restricted user is working correctly.
- **Effective feature state.** `feature_tree()` returns what is on for this client, already resolved.
  Never re-derive it from the catalogue in TypeScript.
- **Company scoping.** A person with no grants sees everything; a person with grants sees theirs.
  The query does not need a company filter for access, only for what the screen is about.

## Language

Identifiers are English. Anything a person reads comes from the locale file, never from a query, a
view or a component. A German string in a query result is a bug in the query.
