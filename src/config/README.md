# Configuration

**No name is typed outside this folder.** Not a table, not a view, not an Edge Function, not a
bucket, not a route, not a permission key. A name that no longer exists then fails to compile,
rather than returning a 404 in front of a client.

| Module | Holds |
|---|---|
| `tables.ts` | every table and view. The Deno twin is `supabase/functions/_shared/tables.ts`, and a rename touches both |
| `permissions.ts` | every capability, page and module key. The same keys `supabase/catalogue.sql` seeds |
| `routes.ts` | every screen: path, label key, feature key, module. One declaration, read by the menu, the breadcrumb and the route guard |
| `buckets.ts` | every storage bucket |
| `edge-functions.ts` | every Edge Function this app invokes |
| `brand.ts` | the product name, wordmark, mail domain and assets. Placeholders in the template; a client fills them in |
| `env.ts` | the two bootstrap values, read and checked once |

## Why these and not others

A value belongs here when **getting it wrong fails away from the code that is wrong**: a mistyped
table name fails at the database, a mistyped function name fails at the network. Thresholds and
labels do not belong here, because those are a client's choice and live in their database.

## The rule that keeps it true

`permissions.ts` and `supabase/catalogue.sql` must agree. They are two halves of one list, and the
day they disagree an administrator is refused their own screen. That happened once already, on
17.09.2026, when the app asked for `page.papierkorb` and the catalogue declared `page.trash`.
