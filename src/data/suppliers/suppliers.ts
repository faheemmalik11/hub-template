import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, sb } from "@/data/client";
import { fetchAllRows, requiredReason } from "@/data/shared";
import { compactIBAN, isPayableIBAN } from "@/lib/data/format";
import type { Supplier } from "@/lib/data/types";

/**
 * Every supplier.
 *
 * Read as "the whole supplier table" all over the app — the list, the merge picker, the invoice
 * detail's issuer lookup — so it is paged through with fetchAllRows rather than left to the
 * platform's per-request row cap. At 117 rows that changes nothing today; at 1000+ a plain select
 * would silently return a prefix, and the symptom would be a supplier that exists but cannot be
 * found in a picker, which is very hard to recognise as truncation.
 *
 * The list screen still paginates and searches client-side over this result. That is a deliberate
 * limit rather than an oversight: moving it server-side means the duplicate panel, the totals join
 * and the sort all have to move with it, which is a larger change than this one.
 */
export function useSuppliers(opts?: { includeDeleted?: boolean }) {
  const includeDeleted = opts?.includeDeleted ?? false;
  return useQuery({
    queryKey: ["lieferanten", { includeDeleted }],
    staleTime: STALE,
    queryFn: async (): Promise<Supplier[]> => {
      return fetchAllRows<Supplier>((from, to, withCount) => {
        let query = sb
          .from(TABLE.suppliers)
          .select("*", withCount ? { count: "exact" } : undefined);
        if (!includeDeleted) query = query.is("deleted_at", null);
        return query.order("name", { ascending: true }).range(from, to) as unknown as Promise<{
          data: Supplier[] | null;
          error: unknown;
          count?: number | null;
        }>;
      });
    },
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ["lieferant", id],
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Supplier | null> => {
      const { data, error } = await sb.from(TABLE.suppliers).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as unknown as Supplier) ?? null;
    },
  });
}

/**
 * Keep supplier_bank_accounts in step with a write to `suppliers.iban`.
 *
 * The database does not enforce that the default account exists as a row -- the migration says so
 * explicitly and leaves it to the code -- so every path that sets `suppliers.iban` has to come
 * through here, or the table silently falls behind the column it is supposed to describe.
 *
 * Silent on a value that is not payable-shaped, and that is the point: `suppliers.iban` has always
 * accepted whatever the document reader printed, including fragments and two IBANs run together,
 * while supplier_bank_accounts refuses them. Throwing here would fail an otherwise valid supplier
 * edit over a field the Hub has never validated. The supplier keeps the raw text; the accounts
 * table keeps only what money can be sent to.
 */
async function mirrorIbanToBankAccount(
  supplierId: string,
  iban: unknown,
  bic?: unknown,
  bankName?: unknown,
): Promise<void> {
  const compact = compactIBAN(typeof iban === "string" ? iban : null);
  if (!isPayableIBAN(compact)) return;
  const actor = await actorEmail();
  const row: Record<string, unknown> = {
    supplier_id: supplierId,
    iban: compact,
    source: "human",
    is_active: true,
    // Typed by a person, so it is vouched for the moment it is saved. Left null it would arrive
    // wearing the amber "new IBAN" flag, which exists for accounts the PIPELINE read off a
    // document -- saying a supplier somebody just entered by hand needs checking against itself.
    confirmed_at: new Date().toISOString(),
    confirmed_by: actor,
    // This function only ever mirrors `suppliers.iban`, which IS the default account, so the flag
    // is set here rather than left to the database trigger. The trigger fires on UPDATE of
    // suppliers.iban only, and it fires BEFORE this row exists on both paths that matter: creating
    // a supplier is an INSERT, and an edit that changes the IBAN updates the supplier first.
    is_default: true,
    // Writing the default over a row hidden with a since-restored supplier must bring it back, or
    // the supplier keeps a default it cannot see.
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
    last_seen_at: new Date().toISOString(),
    created_by: actor,
  };
  if (typeof bic === "string" && bic) row.bic = bic;
  if (typeof bankName === "string" && bankName) row.bank_name = bankName;
  // Upsert, not insert: the same IBAN may already be on file as a deactivated account, and
  // supplier_bank_accounts_one_per_iban is not scoped to active rows.
  const { error } = await sb
    .from(TABLE.supplierBankAccounts)
    .upsert(row, { onConflict: "supplier_id,iban" });
  // Deliberately not rethrown. The supplier write has already succeeded; failing the mutation here
  // would tell the user their edit did not save when it did. The row is recoverable -- the next
  // edit, or the pipeline, writes it -- and the console keeps the reason.
  if (error) console.error("supplier_bank_accounts mirror failed", error);
}

// Lieferant (Kreditor) manuell anlegen. `normalized_name` stays pipeline-owned (single-source in
// Python), so it is not written here. Returns the new row.
export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      address?: string | null;
      vat_id?: string | null;
      iban?: string | null;
      bic?: string | null;
      bank_name?: string | null;
      phone?: string | null;
      email?: string | null;
      contact_person?: string | null;
      /**
       * The accounts typed into the form. The one marked default is written onto the supplier row
       * as well, because `suppliers.iban` stays authoritative; the rest become plain account rows.
       */
      bankAccounts?: { iban: string; bic?: string | null; bank_name?: string | null }[];
    }): Promise<Supplier> => {
      const { bankAccounts = [], ...supplierValues } = values;
      const { data, error } = await sb
        .from(TABLE.suppliers)
        .insert(supplierValues)
        .select("*")
        .single();
      if (error) throw error;
      const supplier = data as unknown as Supplier;
      // The new supplier's IBAN has to exist as an account row too, or the default points at
      // nothing and the Bankverbindungen section opens empty on a supplier that plainly has one.
      // Skipped when the value is not payable-shaped: suppliers.iban accepts anything a reader
      // printed, supplier_bank_accounts does not, and a CHECK error here would lose the supplier
      // that was just created successfully.
      await mirrorIbanToBankAccount(
        supplier.id,
        supplierValues.iban,
        supplierValues.bic,
        supplierValues.bank_name,
      );
      // The additional accounts, written AFTER the default so the single-default trigger never has
      // to demote anything: each of these arrives with is_default left at its column default.
      const further = bankAccounts
        .map((k) => ({ ...k, iban: compactIBAN(k.iban) }))
        .filter(
          (k) => isPayableIBAN(k.iban) && k.iban !== compactIBAN(supplierValues.iban ?? null),
        );
      if (further.length > 0) {
        const actor = await actorEmail();
        const { error: accountsError } = await sb.from(TABLE.supplierBankAccounts).upsert(
          further.map((k) => ({
            supplier_id: supplier.id,
            iban: k.iban,
            bic: k.bic || null,
            bank_name: k.bank_name || null,
            source: "human",
            is_active: true,
            // Same reasoning as the default account above: a person typed these.
            confirmed_at: new Date().toISOString(),
            confirmed_by: actor,
            last_seen_at: new Date().toISOString(),
            created_by: actor,
          })),
          { onConflict: "supplier_id,iban" },
        );
        // Logged, not thrown: the supplier and its default account already exist, and failing the
        // mutation here would say the whole thing did not save when most of it did.
        if (accountsError) console.error("supplier_bank_accounts insert failed", accountsError);
      }
      return supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
    },
  });
}

// Lieferant-Stammdaten aktualisieren.
export function useUpdateSupplier(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: Partial<Supplier>) => {
      const { error } = await sb
        .from(TABLE.suppliers)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", supplierId);
      if (error) throw error;
      // Editing the IBAN by hand is still a way to set the default, so it has to leave the same
      // trail as useSetDefaultSupplierIban would. Only when the field was actually part of this
      // edit -- a change to the phone number must not resurrect a deactivated account.
      if ("iban" in changes) {
        await mirrorIbanToBankAccount(supplierId, changes.iban, changes.bic, changes.bank_name);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferant", supplierId] });
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

// Lieferant löschen (Soft-Delete).
/**
 * Hide a supplier's bank accounts along with the supplier, or bring them back with it.
 *
 * Passing nulls is the restore: the same three columns cleared. `is_active` and `is_default` are
 * deliberately untouched either way, so a restored supplier comes back with exactly the accounts and
 * exactly the default it had when it was deleted.
 *
 * Not rethrown, same reasoning as mirrorIbanToBankAccount above: the supplier write has already
 * succeeded, and reporting a failure here would tell the user their delete did not happen when it
 * did. The supplier is hidden either way, so its accounts are unreachable in the UI regardless.
 */
async function softDeleteBankAccounts(
  supplierIds: string[],
  actor: string | null,
  reason: string | null,
  moment: string | null,
): Promise<void> {
  if (supplierIds.length === 0) return;
  const { error } = await sb
    .from(TABLE.supplierBankAccounts)
    .update({ deleted_at: moment, deleted_by: actor, delete_reason: reason })
    .in("supplier_id", supplierIds);
  if (error) console.error("supplier_bank_accounts soft delete failed", error);
}

// Lieferant löschen (Soft-Delete).
export function useSoftDeleteSupplier(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.suppliers)
        .update({
          deleted_at: now,
          deleted_by: actor,
          delete_reason: requiredReason(reason),
        })
        .eq("id", supplierId);
      if (error) throw error;
      await softDeleteBankAccounts([supplierId], actor, requiredReason(reason), now);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

/**
 * Soft-delete or restore several suppliers at once.
 *
 * One statement rather than a loop of single updates: a partial failure halfway through a loop
 * leaves the selection in two different states with nothing saying where it stopped.
 *
 * Deliberately the only BULK action offered. Merging is not: it needs a surviving record chosen per
 * group, and "merge everything selected into one" is a different, lossier operation than what the
 * duplicates panel already does per group. Both of these are reversible; a bulk merge would not be.
 */
export function useBulkSetSuppliersDeleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids: string[]; delete: boolean; reason?: string }) => {
      if (args.ids.length === 0) return;
      const actor = await actorEmail();
      const moment = args.delete ? new Date().toISOString() : null;
      const reason = args.delete ? requiredReason(args.reason) : null;
      const changes = args.delete
        ? { deleted_at: moment, deleted_by: actor, delete_reason: reason }
        : { deleted_at: null, deleted_by: null, delete_reason: null };
      const { error } = await sb.from(TABLE.suppliers).update(changes).in("id", args.ids);
      if (error) throw error;
      // The accounts follow the suppliers, in both directions.
      await softDeleteBankAccounts(args.ids, args.delete ? actor : null, reason, moment);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-duplicates"] });
    },
  });
}

/**
 * Bring a soft-deleted supplier back.
 *
 * Deleting was reversible in the data all along (`deleted_at` and friends) but not from anywhere in
 * the app: a supplier deleted by mistake could only be recovered in the database. The detail page
 * now offers this in place of its Delete button once the record is already deleted.
 *
 * `delete_reason` and `deleted_by` are cleared as well, so a later deletion cannot inherit the
 * reason from an earlier, undone one.
 */
export function useRestoreSupplier(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb
        .from(TABLE.suppliers)
        .update({ deleted_at: null, deleted_by: null, delete_reason: null })
        .eq("id", supplierId);
      if (error) throw error;
      await softDeleteBankAccounts([supplierId], null, null, null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["lieferant", supplierId] });
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["supplier-duplicates"] });
    },
  });
}
