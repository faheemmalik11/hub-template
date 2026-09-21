# Seed data

Sample data for looking at the Hub without a client's database behind it: a screen you can open,
a list with rows in it, a chart with a shape.

## Turning it on

```
VITE_SEED=1 npm run dev
```

One switch, read in one place: `src/config/seed.ts` decides, `src/data/client.ts` acts on it. Every
query in the app goes through that client, so the whole Hub changes over at once and no screen
needs to know. Unset, nothing about the app differs.

What the stand-in client does **not** do is filter, order or page: a screen asking for one
company's invoices gets every fixture row. Enough to look at a layout, nowhere near enough to test
a query.

**It is never SQL and it never reaches a database.** These are values in TypeScript, handed to the
same adapters the real screens use. Nothing here is inserted, migrated or seeded into Postgres, so
it cannot be mistaken for a client's own rows and cannot survive into their Hub.

`src/kit/widgets/overview/sample-adapter.ts` is the shape to follow: it builds an `OverviewAdapter`
whose hooks return fixed values instead of queries, so the widget renders exactly as it would with
real data and knows no difference.

## Laid out by page

One file per screen, under the module it belongs to, matching `src/config/routes.ts`:

```
seed/
  shared.ts                    the companies, suppliers and ids every fixture draws on
  master-data/
    companies.ts               two, because one hides every scoping bug
    suppliers.ts               with a bank account, without one, and a duplicate spelling
    properties.ts              plus the property_companies links, which is how they really join
    customers.ts               a company and a private person
    categories.ts              one per report block, plus the catch-all
  invoices/
    incoming.ts                recognised, needs review, paid
    outgoing.ts                paid, open, overdue with a reminder
    manual-bookings.ts         one recurring, one entered once
  payments/
    bank-accounts.ts           one synced, one entered by hand
    bank-transactions.ts       matched, suggested, unmatched, money in
  rules/
    assignment.ts              two rules matching one document, so specificity is visible
    approval.ts                one step under a threshold, two over it
  taxes/
    vat-reserve.ts             one company resolved, one with documents still unresolved
    handover.ts                acknowledged, waiting, bounced
  reports/
    cost-analysis.ts           a result rather than rows, including what stayed unassigned
  admin/
    processing-log.ts          filed, set aside, failed
    team.ts                    one person per role, one of them scoped to a single company
```

Each fixture is typed against the row type the page actually reads, so a column that changes shape
breaks the fixture rather than quietly rendering nothing. One row per state the screen draws
differently, not twenty rows of the same thing.

## What does not

- anything with a real client's name, amount or IBAN in it
- anything that writes
