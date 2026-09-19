# Is this schema good for N clients?

Checked two ways on 18.09.2026: against what the field publishes, and against the six Hubs we
already run. Five searches, and a count of what every client's database actually contains.

## What our own clients show

| Hub | Migrations | Distinct tables |
|---|---|---|
| eiffler-hubv2 | 271 | 75 |
| staeyhub | 248 | 70 |
| immonetz | 209 | 50 |
| living-immo-hub | 122 | 12 |
| oliviabarbarinomokrus | 28 | 11 |
| mayestate | 0 | 0 |
| **this template** | **1 baseline** | **69** |

Most of what a client "has and the template lacks" is a rename the template already carries:
`invoices` to `documents`, `bwa_*` to `category_*`, `datev_*` to `handover_*`, `folder_bookmarks`
to `read_cursors`. Those are accounted for in `RENAMES.md`.

What is left is the real answer to the question:

| Hub | Genuinely its own |
|---|---|
| eiffler-hubv2 | a whole second accounting area (`acc_*`), Airtable sync, bank statement imports |
| immonetz | Lexoffice config and sync log |
| oliviabarbarinomokrus | payment runs, run items, run files, payment settings |

**So a shared schema is right, and it is not enough by itself.** Every established client grows
tables the others do not have, and the template must say where those go, or the first client who
needs one forks the schema.

## The rule that follows

The shared schema is `supabase/schema/0000` to `0014`, identical in every client, and **no client
adds a table to it**. A client's own tables live in their own file, numbered from 9000, applied
after the baseline:

```
supabase/schema/9000_<client>_payment_runs.sql
```

They may reference the shared tables; nothing shared may reference them. The baseline can then be
upgraded for every client without asking what each one has added, which is the whole point.

## What the field says, and where we stand

**One database per client is the right shape for this product.** The published trade-off is that
shared-schema-with-tenant-id is cheapest at thousands of tenants, schema-per-tenant works for
hundreds, and database-per-tenant gives the strongest isolation and is what suits regulated data and
a handful of large clients. We have six clients holding real invoices and bank access; isolation is
worth more than the cost, and it is why there is no `tenant_id` column anywhere.

**The known RLS performance trap, and we are on the right side of it.** Policies get slow when a
helper is VOLATILE, because the planner cannot use an index behind it: every one of ours is STABLE,
checked. The other half of that advice is to index every column a policy filters on, and there we
were wrong: `bank_transactions`, `manual_bookings` and `payment_orders` carry the company scope with
no index on `company_id`. Fixed.

**Soft delete everywhere is a cost, and it is paid for.** The warning is index bloat and every query
filtering dead rows. Our hot tables answer it with partial indexes (`where deleted_at is null`), 14
of them. The colder ones do not have any, which is fine while they are small and is the first thing
to revisit if a client's supplier list gets long.

**One thing to decide before it decides itself.** `documents.line_items` and `documents.tax` are
jsonb, and `document_line_items` and `document_taxes` are tables holding the same facts. The current
guidance is the obvious one: jsonb for genuinely variable shapes, a table when the shape is fixed
and you query inside it. Line items are fixed and queried. Keeping both means two truths, and the
next person to write a total will pick the wrong one.

**Drift is the risk that actually bites.** The published failure is not the schema, it is that
environments stop agreeing. Ours is answered by construction: one generated baseline, built from the
numbered files by a script, applied to an empty database and diffed. What is missing is a check that
a client's live database still matches it, which is worth having before there are ten clients rather
than after.

## Verdict

The shape is right and matches what is published for this class of product. Four things to act on,
in order:

1. **Client tables need their own numbered range.** Otherwise the first special case forks the
   schema. Cheap now, expensive later.
2. **Pick one home for line items and taxes**, and delete the other.
3. **A drift check per client**, comparing a live dump against the baseline.
4. **Partial indexes on the colder soft-deleted tables**, when a client is big enough to notice.

Sources: [Auth0 on choosing an authorization model](https://auth0.com/blog/how-to-choose-the-right-authorization-model-for-your-multi-tenant-saas-application/) ·
[WorkOS on multi-tenant architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) ·
[Bytebase on RLS footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) ·
[PlanetScale on RLS at scale](https://planetscale.com/blog/rls-sounds-great-until-it-isnt) ·
[Brandur on soft deletion](https://brandur.org/soft-deletion) ·
[Bytebase on database version control](https://www.bytebase.com/blog/database-version-control/)
