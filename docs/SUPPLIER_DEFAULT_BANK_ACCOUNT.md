# The default bank account of a supplier

`supplier_bank_accounts.is_default` plus soft delete for the same table, both added by
`supabase/migrations/20260827170000_supplier_bank_accounts_default_and_soft_delete.sql`
(package versions `0008_supplier_bank_account_is_default` and
`0009_supplier_bank_accounts_soft_delete`).

One file rather than two, because neither version had run against this database. Immonetz keeps them
separate: 0008 was applied there on 27.08.2026 at 13:34 UTC, before 0009 existed.

**NOT YET APPLIED HERE.** The supplier pages read both columns, so they will fail until it runs.

## Why

Before this, the default was implicit: "the account whose IBAN happens to equal `suppliers.iban`".
Every reader had to re-derive it by compacting two strings and comparing them, and nothing could be
constrained or joined on it. `is_default` states it on the row.

## What the migration does

1. Adds `is_default boolean not null default false`.
2. Adds `supplier_bank_accounts_default_is_active`: a default row must be active. The Hub already
   refuses to deactivate the default (`useDeactivateSupplierBankAccount`); this is the same rule in
   a place that cannot be bypassed.
3. Adds `supplier_bank_accounts_one_default_per_supplier`, a unique index on `(supplier_id) where
is_default`. That is the hard "only one default" guarantee.
4. Adds `trg_supplier_bank_accounts_single_default`. Setting a default clears the previous one, so
   callers do not have to unset it first and get a unique-violation when they forget.
5. Adds the two sync triggers described below.
6. Backfills: carries any payable `suppliers.iban` that has no account row yet into the table, then
   marks the matching row as the default.

## suppliers.iban and is_default stay in step, both ways

`suppliers.iban` remains what `payment-guards.ts`, the pipeline's fraud screen and
`supplier_iban_history` read, and the Hub still sets a default by writing it
(`useSetDefaultSupplierIban`). Two triggers keep the two sides from drifting:

| Trigger                             | On                                                  | Does                                                                                            |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `trg_supplier_default_iban_sync`    | `suppliers`, after update of `iban`                 | moves `is_default` to the matching account row (and clears it when the IBAN is emptied)         |
| `trg_supplier_default_account_sync` | `supplier_bank_accounts`, after `is_default` is set | writes that IBAN back to `suppliers.iban`, plus `bic`/`bank_name` when the account carries them |

Neither loops: each writes only when the compacted values actually differ, so the second hop finds
nothing to change.

The compacted comparison matters for more than looping. Suppliers routinely store their IBAN with
spaces (30 of 131 in Immonetz). Writing the compacted form back to them would not be a change of account,
but `supplier_iban_history` would record it as one, and the supplier list would then show 30 rows
with an amber "bank details changed" IBAN. Verified: the backfill creates zero history rows.

## Merges

`merge_suppliers()` reassigns `supplier_id`. If both sides had a default, the keeper's own wins and
the arriving row is silently demoted, rather than the merge failing on the unique index. See the
`tg_op = 'UPDATE' and new.supplier_id is distinct from old.supplier_id` branch.

## Verified before hand-off

Run against each live database inside a transaction that was rolled back:

|                  | accounts | marked default | carried in | suppliers with two defaults |
| ---------------- | -------- | -------------- | ---------- | --------------------------- |
| Stäy (this repo) | 135      | 130            | 1          | 0                           |
| Immonetz         | 91       | 83             | 3          | 0                           |
| Eiffler          | 73       | 58             | 0          | 0                           |

All three also created zero `supplier_iban_history` rows, which is the check that the compacted
comparison is doing its job.

Plus five behaviour tests on Immonetz, all passing: writing `suppliers.iban` moves the flag; setting the flag
moves `suppliers.iban`; the previous default is always cleared; deactivating the default is refused;
a merged-in default does not depose the keeper's; clearing `suppliers.iban` clears the default.
Applying the file twice is a no-op (`0 carried in, 0 marked`).

The combined file was run twice against this database in one rolled-back transaction: the second
pass reported `0 carried in, 0 marked` and both package versions were recorded.

## Soft delete (0009)

Deleting a supplier is a soft delete, so its accounts follow the same rule rather than being erased.
`deleted_at`, `deleted_by` and `delete_reason` are set on every account of the supplier, and cleared
again on restore.

`is_active` and `is_default` are deliberately untouched on the way out, so a restored supplier comes
back with exactly the accounts and exactly the default it had. Readers filter on `deleted_at`:
`useSupplierBankAccounts` adds `.is("deleted_at", null)`.

No new RLS policy. A soft delete is an UPDATE, which the existing update policy already allows, and
that is the point: the table still has no delete policy, so nothing in the browser can erase an
account somebody was paid on.

Written by `softDeleteBankAccounts()` in `queries.ts`, called from `useSoftDeleteLieferant`,
`useRestoreLieferant` and `useBulkSetLieferantenGeloescht`. Failures are logged, not thrown, for the
same reason `mirrorIbanToBankAccount` does: the supplier write has already succeeded, and the
supplier is hidden either way, so its accounts are unreachable in the UI regardless.

## What the front-end now reads

- The supplier list shows the DEFAULT account's IBAN, from the flag, not by re-deriving it from
  `suppliers.iban` (`defaultAccounts` in `routes/lieferanten/index.tsx`).
- The supplier detail info card shows it as "IBAN (Standard)", with BIC and bank name from the same
  account, falling back to the `suppliers` columns while no account row exists.
- Creating a supplier writes the account row with `is_default: true`. The database trigger cannot do
  it there: it fires on UPDATE of `suppliers.iban`, and creating a supplier is an INSERT.

## Not done

- The migration's comments name `payment-guards.ts`, which exists in Immonetz and Eiffler but not
  here. The file is byte-identical across repos on purpose, so the four stay diffable.
- The column is not yet the authoritative side. If it becomes one, drop
  `trg_supplier_default_iban_sync` and move the writers over. Nothing else in the migration changes.
