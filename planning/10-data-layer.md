# One place for every database call, and modular inside it

The rule: **no file outside the data layer names a table, builds a query, or imports a database
client.** A screen asks for what it needs by name and gets typed rows back.

Half of this is already true, which is why the other half is worth finishing.

## Where it stands, measured 17.09.2026

| Fact | Number |
|---|---|
| Hooks exported from `src/lib/data/queries.ts` | 262 |
| Lines in that one file | 9,828 |
| Server-function files in `src/lib/api/` that query the database themselves | 22 |
| Hub adapters that query | 7 |
| Files outside all of those that call the client directly | 2 |

So the codebase already agrees with the rule in spirit: nearly every read goes through one module.
The problems are that the module is a single ten-thousand-line file, that the server functions are a
second unrelated data layer beside it, and that two files slipped out.

A ten-thousand-line file is not "one place", it is a filing cabinet with no drawers. Two people
cannot work in it without colliding, nothing can be found by name, and the only way to know whether
a query exists is to search for a table name.

## The shape

```
src/data/
  client.ts                the browser client. The only createClient call in the app
  server.ts                the server client. The only place a service role key is read
  keys.ts                  query keys, one factory per domain, so no string is typed twice
  documents/
    queries.ts             reads, as hooks
    mutations.ts           writes, as hooks
    server.ts              the server functions for this domain
  suppliers/  customers/  companies/  properties/  categories/
  bank/  payments/  rules/  notifications/  team/  settings/  assistant/
  index.ts                 the public surface: everything the app may import
```

One domain per folder, reads apart from writes, and the server functions for a domain beside the
hooks for the same domain rather than in a separate tree. `index.ts` is what the app imports, so a
screen never reaches into a domain's internals and a hook can move without touching a call site.

## Rules that make it hold

1. **Nothing outside `src/data/` imports the client or `TABLE`.** Enforced by an eslint
   `no-restricted-imports` rule, not by a comment, so it fails in CI rather than in review.
2. **Query keys come from `keys.ts`.** A cache invalidation that misses because two files spelled
   the same key differently is the most common bug in this kind of layer.
3. **A domain file is read by a person.** If one passes about 400 lines, it is two domains.
4. **The server functions move with their domain**, so the read and the write of the same thing sit
   together and the service role client has exactly one home.
5. **The config folder still owns the names.** `src/config/tables.ts` says what a table is called;
   the data layer says what to ask it. See `09-migrations-and-config.md`.

## How to move without a big bang

The refactor is mechanical and can be done one domain at a time, with nothing broken in between:

1. Create `src/data/` with `client.ts`, `keys.ts` and an `index.ts` that re-exports everything from
   the old `queries.ts`.
2. Point the app at `@/data` instead of `@/lib/data/queries`, in one pass. No behaviour changes.
3. Move one domain's hooks out of `queries.ts` into `src/data/<domain>/`, and re-export them from
   `index.ts`. The app does not notice.
4. Repeat until `queries.ts` is empty, then delete it.
5. Move the 22 server-function files into their domains.
6. Turn on the eslint rule, which by then has nothing left to complain about.

Each step is a commit that can be verified by a typecheck and a build, and no step requires the next
one to be finished.

## Why this matters more here than in a normal app

This is a template. Every client's Hub starts as a copy of it, so a ten-thousand-line file is copied
eleven times and then edited eleven ways. A modular data layer is what lets a fix to one domain be
carried into a client's Hub without carrying everything else with it.
