import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import { compactIBAN, isPayableIBAN } from "@/lib/data/format";
import type {
  InvoiceBankAccount,
  SupplierBankAccount,
  SupplierIbanHistory,
} from "@/lib/data/types";

// ---- Supplier IBAN history, aliases, duplicates & merge (migration 0040) ----

// Without `supplierId`, returns every supplier's IBAN history at once — used by the list page to
// build a per-row "recently changed" indicator without one query per supplier (mirrors how
// useBelege() feeds the list's own `summen` map).
export function useSupplierIbanHistory(supplierId?: string) {
  return useQuery({
    queryKey: ["supplier-iban-history", supplierId ?? "__all"],
    staleTime: STALE,
    queryFn: async (): Promise<SupplierIbanHistory[]> => {
      let query = sb.from(TABLE.supplierIbanHistory).select("*");
      if (supplierId) query = query.eq("supplier_id", supplierId);
      const { data, error } = await query.order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierIbanHistory[];
    },
  });
}

// ---- Supplier bank accounts (migration 20260824100000) ----
//
// A supplier bills from more than one account, and `suppliers.iban` can hold only one of them. That
// column stays the DEFAULT -- the pipeline's fraud screen and the payment path both read it -- and
// this table holds every account the supplier is known to use.
//
// Two invariants no constraint enforces, which is why every write below goes through these hooks
// rather than touching either table directly:
//
//   * whatever `suppliers.iban` holds exists as an active row here for that supplier;
//   * an account that was ever paid is deactivated, never deleted (the table has no delete policy).

// Without `supplierId`, returns every supplier's accounts at once, so the list page can show a
// per-row account count without one query per supplier (same shape as useSupplierIbanHistory).
/**
 * The accounts THIS invoice printed, in the order they appeared on it, else the supplier's
 * default.
 *
 * Two different questions used to get the same answer. "Which account does this supplier get paid
 * on" is `suppliers.iban`; "which account did this document actually name" is what a person
 * checking an invoice needs, and on a supplier with several accounts the two are not the same
 * number. The pipeline records the second on every extraction (`invoice_bank_accounts`), so it
 * can be shown instead of guessed.
 *
 * `origin` says which question got answered, because a reader must never have to wonder: `invoice`
 * means the document named these, `default` means it named none and this is the fallback.
 */
export function useInvoiceBankAccounts(invoiceId?: string, supplierId?: string | null) {
  return useQuery({
    queryKey: ["invoice-bank-accounts", invoiceId ?? "__none", supplierId ?? "__none"],
    enabled: !!invoiceId,
    staleTime: STALE,
    queryFn: async (): Promise<{
      accounts: SupplierBankAccount[];
      origin: "invoice" | "default";
    }> => {
      const { data, error } = await sb
        .from(TABLE.documentBankAccounts)
        .select(`position, origin, ${TABLE.supplierBankAccounts}(*)`)
        .eq("document_id", invoiceId)
        .order("position", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as unknown as InvoiceBankAccount[];
      const accounts = rows
        .map((row) => row.supplier_bank_accounts)
        // A link whose account was soft-deleted since is dropped rather than rendered as a hole.
        .filter((account): account is SupplierBankAccount => !!account && !account.deleted_at);
      // One source, no second guess. The panel shows what is recorded against the invoice, and the
      // pipeline records the supplier's standing account when the document named none (migration
      // 20260828200000), so there is nothing left for the Hub to infer. An invoice with no rows
      // here genuinely has no account to show.
      const fellBack =
        accounts.length > 0 && rows.every((row) => row.origin === "supplier_default");
      return { accounts, origin: fellBack ? "default" : "invoice" };
    },
  });
}

/**
 * Vouch for an account the pipeline read off an invoice.
 *
 * The flag exists to mark one thing: this supplier has never billed from this account before. A
 * person looking at the document is the only one who can settle whether that is a bank change or a
 * fraud attempt, so confirming is a human act and is recorded as one. Once confirmed the account
 * is ordinary everywhere it appears, which is why every screen reads the same `confirmed_at`
 * rather than keeping its own idea of what is new.
 */
export function useConfirmSupplierBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.supplierBankAccounts)
        .update({ confirmed_at: new Date().toISOString(), confirmed_by: actor })
        .eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

/**
 * Attach a supplier's account to an invoice that has none.
 *
 * The one case the pipeline cannot fix by itself: an invoice read while its supplier had no bank
 * details at all. The document named no account and there was no default to stand in, so the
 * invoice has no row in invoice_bank_accounts and never gets one, because re-reading the document
 * would find the same nothing. Somebody completes the supplier weeks later and the old invoice is
 * still blank.
 *
 * Recorded as `supplier_default`, because that is what it is: the account did not come off this
 * document. The insert policy (migration 20260828220000) allows it only for an account of THIS
 * invoice's supplier, and only while the invoice has no accounts of its own, so a link added by
 * hand can never contradict what a document printed.
 */
export function useLinkInvoiceBankAccount(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await sb.from(TABLE.documentBankAccounts).insert({
        document_id: invoiceId,
        supplier_bank_account_id: accountId,
        position: 1,
        origin: "supplier_default",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

export function useSupplierBankAccounts(supplierId?: string) {
  return useQuery({
    queryKey: ["supplier-bank-accounts", supplierId ?? "__all"],
    staleTime: STALE,
    queryFn: async (): Promise<SupplierBankAccount[]> => {
      // Accounts of a soft-deleted supplier are hidden with it (migration 20260827190000). They
      // come back untouched, default and all, when the supplier is restored.
      let query = sb.from(TABLE.supplierBankAccounts).select("*").is("deleted_at", null);
      if (supplierId) query = query.eq("supplier_id", supplierId);
      const { data, error } = await query.order("first_seen_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierBankAccount[];
    },
  });
}

/**
 * Add an account, or bring a deactivated one back.
 *
 * An upsert rather than an insert, because supplier_bank_accounts_one_per_iban is NOT scoped to
 * active rows: a deactivated account keeps its slot, so re-adding the same IBAN as a plain insert
 * fails with a duplicate-key error instead of restoring it. Deliberate -- an account somebody once
 * paid must stay on file -- so "add" and "reactivate" are the same operation here.
 *
 * Only the columns named are sent, so reactivating cannot blank a bic or bank name already on file.
 */
export function useAddSupplierBankAccount(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { iban: string; bic?: string | null; bank_name?: string | null }) => {
      const iban = compactIBAN(input.iban);
      // Checked here as well as by the CHECK constraint, so a half-read IBAN comes back as
      // something the form can say rather than a Postgres constraint error.
      if (!isPayableIBAN(iban)) throw new Error("IBAN_INVALID");
      const actor = await actorEmail();
      const row: Record<string, unknown> = {
        supplier_id: supplierId,
        iban,
        source: "human",
        is_active: true,
        // Adding an account that was removed brings it back, which is what "add" has always meant
        // on this table. Without clearing these three the upsert updated the hidden row and left it
        // hidden, so re-adding an account you had just removed appeared to do nothing at all.
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        last_seen_at: new Date().toISOString(),
        created_by: actor,
        // A person typed this one, so it is vouched for the moment it is saved. The flag exists
        // for accounts the PIPELINE read off a document, where nobody has looked yet.
        confirmed_at: new Date().toISOString(),
        confirmed_by: actor,
      };
      if (input.bic) row.bic = input.bic;
      if (input.bic) row.bic = input.bic;

      if (input.bank_name) row.bank_name = input.bank_name;
      const { data, error } = await sb
        .from(TABLE.supplierBankAccounts)
        .upsert(row, { onConflict: "supplier_id,iban" })
        // Returned so a caller that just created an account can go on to use it -- the pay dialog
        // adds an account and immediately pays to it.
        .select("id")
        .single();
      if (error) throw error;
      return (data as unknown as { id: string }).id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      // Adding an account writes an `account_added` row, and a first account also writes
      // `default_set`. Without this the Verlauf modal keeps showing the list it fetched before.
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
      // Re-adding a removed account takes it out of the Papierkorb, so that screen is stale too.
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["trash-tables"] });
    },
  });
}

/**
 * Edit any account, the default included.
 *
 * Editing the default used to be refused here, because its IBAN is also `suppliers.iban` and
 * nothing wrote the edit through. Migration 20260828100000 widened
 * trg_supplier_default_account_sync to fire on `iban`, `bic` and `bank_name` as well as on
 * `is_default`, so the two sides now move together whichever one is written, and a real change of
 * IBAN still lands in supplier_iban_history. Deleting the default is still refused: see
 * useDeleteSupplierBankAccount.
 */
export function useUpdateSupplierBankAccount(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      iban: string;
      bic?: string | null;
      bank_name?: string | null;
    }) => {
      const iban = compactIBAN(input.iban);
      if (!isPayableIBAN(iban)) throw new Error("IBAN_INVALID");
      const { error } = await sb
        .from(TABLE.supplierBankAccounts)
        .update({
          iban,
          bic: input.bic || null,
          bank_name: input.bank_name || null,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["lieferant", supplierId] });
      // The edit may have moved suppliers.iban with it, so the list's default-account map and the
      // IBAN history both go stale.
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
    },
  });
}

/**
 * Remove an account that is not the default: it goes to the Papierkorb.
 *
 * A soft delete, and the row is listed in the trash from there (migration 20260828130000), so it
 * can be restored or emptied out for good like anything else that gets deleted here. Emptying it is
 * purge_record(), which is admin-only and snapshots the row into change_history before deleting, so
 * an account somebody was once paid on stays explainable even after it is gone.
 *
 * Re-adding the same IBAN also brings it back: useAddSupplierBankAccount clears these three columns
 * on the way in, because the unique index means the upsert lands on this very row.
 *
 * `is_default = false` in the WHERE is one of two guards; the other is a BEFORE DELETE trigger, so
 * the account the payment path points at cannot be removed even by a stale UI.
 */
export function useDeleteSupplierBankAccount(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; grund?: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.supplierBankAccounts)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
          delete_reason: input.grund?.trim() || null,
        })
        .eq("id", input.id)
        .eq("is_default", false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["lieferant", supplierId] });
      // It is in the Papierkorb now, so that screen's counts are stale.
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["trash-tables"] });
    },
  });
}

/**
 * Take an account out of use without erasing it.
 *
 * Refuses to deactivate the account `suppliers.iban` currently points at: that would break the
 * invariant that the default is always an active row, and would leave the payment path aimed at an
 * account the Hub has just said is no longer in use. Pick a different default first.
 */
export function useDeactivateSupplierBankAccount(_supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; iban: string; currentDefault: string | null }) => {
      if (compactIBAN(input.currentDefault) === compactIBAN(input.iban)) {
        throw new Error("IS_DEFAULT_ACCOUNT");
      }
      const { error } = await sb
        .from(TABLE.supplierBankAccounts)
        .update({ is_active: false })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
    },
  });
}

/**
 * Point `suppliers.iban` at one of the supplier's accounts.
 *
 * The account row is written FIRST and the default second, so the invariant "the default exists as
 * an active row" is never briefly false -- if the second write fails, the supplier keeps the old
 * default and has gained a known account, which is recoverable; the other order leaves the default
 * pointing at nothing.
 *
 * Changing the default fires the supplier_iban_history trigger, exactly as editing the field by
 * hand always has. That is intended: switching accounts stays visible in "IBAN-Verlauf".
 */
export function useSetDefaultSupplierIban(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { iban: string; bic?: string | null; bank_name?: string | null }) => {
      const iban = compactIBAN(input.iban);
      if (!isPayableIBAN(iban)) throw new Error("IBAN_INVALID");
      const actor = await actorEmail();
      const row: Record<string, unknown> = {
        supplier_id: supplierId,
        iban,
        source: "human",
        is_active: true,
        last_seen_at: new Date().toISOString(),
        created_by: actor,
      };
      if (input.bic) row.bic = input.bic;
      if (input.bank_name) row.bank_name = input.bank_name;
      const { error: accountError } = await sb
        .from(TABLE.supplierBankAccounts)
        .upsert(row, { onConflict: "supplier_id,iban" });
      if (accountError) throw accountError;

      const changes: Record<string, unknown> = { iban, updated_at: new Date().toISOString() };
      if (input.bic) changes.bic = input.bic;
      if (input.bank_name) changes.bank_name = input.bank_name;
      const { error } = await sb.from(TABLE.suppliers).update(changes).eq("id", supplierId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["invoice-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["supplier-iban-history"] });
      qc.invalidateQueries({ queryKey: ["lieferant", supplierId] });
      qc.invalidateQueries({ queryKey: ["lieferanten"] });
    },
  });
}
