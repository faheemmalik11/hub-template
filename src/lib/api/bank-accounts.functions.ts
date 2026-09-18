// Server functions for creating/editing `bank_accounts` rows directly — the missing half of the
// BANKSapi flow ported from immonetz. immonetz's bank-sync (and this repo's own, already-ported
// copy of it, supabase/functions/bank-sync/index.ts) create the row itself when a connection is
// synced, but NEITHER project's sync ever sets `company_id` — nothing in BANKSapi's response
// carries a company signal. immonetz closes that gap with a manual UI (a "Bankkonten" table row
// dialog, direct `sb.from(TABLE.bankAccounts).update()` calls, since its RLS allows authenticated
// writes on that table). This repo's RLS does NOT (migration 0059: bank_accounts_select is
// SELECT-only) — so this follows the same service-role + explicit checkCompanyAccess pattern
// already used by employees.functions.ts and bank-manual-import.functions.ts, rather than
// widening RLS to match immonetz.
//
// Once company_id is set (or changed) here, the existing propagate_account_company trigger
// (migration 0025) copies it onto that account's bank_transactions automatically — no extra work
// needed on this side for that part, it was already ported.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkCompanyAccess } from "./company-access";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "./require-permission";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  BANK_ACCOUNT_CARD_RULES,
  BANK_ACCOUNT_DIALOG_RULES,
  normalizeBankAccountFields,
  validateBankAccountFields,
  type BankAccountFields,
  type BankAccountRules,
} from "@/lib/data/bank-account-fields";
import { TABLE } from "@/lib/data/tables";

// bank_accounts isn't in the generated Database type (see CLAUDE.md), so writes go through an
// untyped client, same convention as the rest of src/lib/api.
type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function callerEmailFrom(context: { claims?: unknown }): string {
  const email = (context.claims as { email?: string } | undefined)?.email;
  if (!email) throw new ForbiddenError("No email on the authenticated session");
  return email;
}

// Explicit flat columns, not select("*") -- a jsonb `metadata` field would defeat TanStack
// Start's server-fn return-type serializability check (see bank-manual-import.functions.ts for
// where this was first hit).
const BANK_ACCOUNT_COLUMNS =
  "id, connection_id, company_id, banksapi_product_id, banksapi_provider_id, provider_id, " +
  "connect_route, account_name, iban, bic, holder, bank_name, product_type, currency, balance, " +
  "balance_date, is_own_account, is_sandbox, name_is_custom, excluded_at, excluded_by, " +
  "exclusion_reason, created_at, updated_at";
// is_active (migration 20260902160000) is deliberately NOT in this projection. Every server
// function here selects it back after its write, so adding the column would make all of them fail
// with "column bank_accounts.is_active does not exist" on a database where the migration has not
// been applied yet -- taking the account edit dialog down with it. No caller reads the returned
// row's fields (the hooks invalidate and refetch through useBankAccounts, which selects "*"), so
// leaving it out costs nothing and keeps the app deployable before the migration lands.

export interface BankAccountRow {
  id: string;
  connection_id: string | null;
  company_id: string | null;
  banksapi_product_id: string | null;
  banksapi_provider_id: string | null;
  provider_id: string | null;
  connect_route: string | null;
  account_name: string | null;
  iban: string | null;
  bic: string | null;
  holder: string | null;
  bank_name: string | null;
  product_type: string | null;
  currency: string | null;
  balance: number | null;
  balance_date: string | null;
  is_own_account: boolean;
  is_sandbox: boolean;
  name_is_custom: boolean;
  excluded_at: string | null;
  excluded_by: string | null;
  exclusion_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Deleting an account purges its movements, so it is admin-only — unlike editing, which any user
// with access to the account's company may do. Same shape as employees.functions.ts's own
// requireActiveAdmin (kept local there; duplicated here rather than exported across features).
async function requireActiveAdmin(db: Db, callerEmail: string): Promise<void> {
  await requirePermission(
    db,
    callerEmail,
    PERMISSIONS.bankAccountsRemove,
    "Only admins may remove bank accounts",
  );
}

const BankAccountShape = z.object({
  accountName: z.string(),
  companyId: z.string().uuid().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  holder: z.string().nullable(),
  bankName: z.string().nullable(),
  productType: z.string().nullable(),
  currency: z.string().nullable(),
});

function assertValid(values: BankAccountFields, rules: BankAccountRules): void {
  const errors = validateBankAccountFields(values, rules);
  const first = Object.entries(errors)[0];
  if (first) throw new ValidationError(`${first[0]}: ${first[1]}`);
}

const EditableFieldsSchema = BankAccountShape;

function toRow(fields: z.infer<typeof BankAccountShape>) {
  const values = normalizeBankAccountFields(fields);
  return {
    account_name: values.accountName,
    company_id: values.companyId,
    iban: values.iban,
    bic: values.bic,
    holder: values.holder,
    bank_name: values.bankName,
    product_type: values.productType,
    currency: values.currency,
  };
}

function ibanConflictError(error: { code?: string; message: string }): AppError | null {
  // bank_accounts_iban_uniq (migration 0028): partial unique index on normalized IBAN for
  // real, non-deleted accounts.
  if (error.code === "23505") {
    return new AppError("An account with this IBAN already exists.", 409, "IBAN_CONFLICT");
  }
  return null;
}

// ---------------------------------------------------------------------------
// createBankAccount — a manually-added "own account" with no BANKSapi feed (connection_id/
// banksapi_product_id stay null). If it's later matched by IBAN during a BANKSapi sync, bank-sync
// adopts it (its "seeded row" branch updates rather than inserts) rather than creating a
// duplicate — same behavior immonetz relies on for pre-seeded accounts.
// ---------------------------------------------------------------------------

export const createBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(EditableFieldsSchema)
  .handler(async ({ data, context }): Promise<BankAccountRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = callerEmailFrom(context);
    assertValid(data, BANK_ACCOUNT_DIALOG_RULES);
    const allowed = await checkCompanyAccess(db, callerEmail, data.companyId);
    if (!allowed) throw new ForbiddenError("No access to this company");

    const { data: account, error } = await db
      .from(TABLE.bankAccounts)
      .insert({
        ...toRow(data),
        is_own_account: true,
        is_sandbox: false,
        // A human typed this name, so a later BANKSapi sync that adopts this row by IBAN must not
        // overwrite it with the bank's own label (migration 20260815120000).
        name_is_custom: true,
        provider_id: null, // trigger (0028) derives connect_route from this
      })
      .select(BANK_ACCOUNT_COLUMNS)
      .single();

    if (error)
      throw (
        ibanConflictError(error) ??
        new AppError(`bank_accounts insert failed: ${error.message}`, 500, "DB_ERROR")
      );
    return account;
  });

// ---------------------------------------------------------------------------
// updateBankAccount — edits an existing row, BANKSapi-fed or manual. Re-checks access against
// BOTH the account's current company (to authorize touching it at all) and the target company
// (to prevent assigning it to a company the caller can't see) -- a reassignment crosses two
// company boundaries, not one.
// ---------------------------------------------------------------------------

const UpdateBankAccountSchema = BankAccountShape.extend({
  accountId: z.string().uuid(),
});

export const updateBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(UpdateBankAccountSchema)
  .handler(async ({ data, context }): Promise<BankAccountRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = callerEmailFrom(context);

    const { data: existing, error: lookupError } = await db
      .from(TABLE.bankAccounts)
      .select("id, company_id, account_name, name_is_custom, metadata")
      .eq("id", data.accountId)
      .maybeSingle();
    if (lookupError)
      throw new AppError(`account lookup failed: ${lookupError.message}`, 500, "DB_ERROR");
    if (!existing) throw new NotFoundError("Unknown account_id");

    const current = existing as {
      company_id: string | null;
      account_name: string | null;
      name_is_custom: boolean | null;
      metadata: { source?: string } | null;
    };
    // A card programme has no IBAN, bank or account holder to demand.
    assertValid(
      data,
      current.metadata?.source ? BANK_ACCOUNT_CARD_RULES : BANK_ACCOUNT_DIALOG_RULES,
    );
    const currentCompanyId = current.company_id;
    const allowedCurrent = await checkCompanyAccess(db, callerEmail, currentCompanyId);
    if (!allowedCurrent) throw new ForbiddenError("No access to this account");
    if (data.companyId !== currentCompanyId) {
      const allowedTarget = await checkCompanyAccess(db, callerEmail, data.companyId);
      if (!allowedTarget) throw new ForbiddenError("No access to the target company");
    }

    // Only an actual rename pins the name. Saving the dialog to assign a company must not freeze
    // the bank's own label ("Sichteinlagen") on an account the user never renamed -- but once
    // renamed, bank-sync leaves it alone for good (migration 20260815120000).
    const renamed = data.accountName !== (current.account_name ?? "");
    const nameIsCustom = renamed ? true : (current.name_is_custom ?? false);

    const { data: account, error } = await db
      .from(TABLE.bankAccounts)
      .update({
        ...toRow(data),
        name_is_custom: nameIsCustom,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.accountId)
      .select(BANK_ACCOUNT_COLUMNS)
      .single();

    if (error)
      throw (
        ibanConflictError(error) ??
        new AppError(`bank_accounts update failed: ${error.message}`, 500, "DB_ERROR")
      );
    return account;
  });

// ---------------------------------------------------------------------------
// excludeBankAccount — "Konto entfernen". The bank keeps delivering every product the access was
// granted, hourly, so removing an account is not a delete: bank-sync would recreate it on the next
// tick (and its "account_revived" branch even undoes a soft delete on purpose). What actually
// sticks is a tombstone the sync honours -- excluded_at -- plus a purge of everything the account
// already brought in.
//
// The purge is the reason this is admin-only. bank_transactions rows cascade into
// invoice_transaction_matches, outgoing_invoice_transaction_matches and invoice_files, so an
// exclusion can unpick reconciliation work; the counts come back so the UI can say what went.
// ---------------------------------------------------------------------------

const ExcludeBankAccountSchema = z.object({
  accountId: z.string().uuid(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export interface ExcludeBankAccountResult {
  accountId: string;
  purgedTransactions: number;
  purgedMatches: number;
  purgedFiles: number;
}

export const excludeBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(ExcludeBankAccountSchema)
  .handler(async ({ data, context }): Promise<ExcludeBankAccountResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = callerEmailFrom(context);
    await requireActiveAdmin(db, callerEmail);

    const { data: existing, error: lookupError } = await db
      .from(TABLE.bankAccounts)
      .select("id, company_id, excluded_at")
      .eq("id", data.accountId)
      .maybeSingle();
    if (lookupError)
      throw new AppError(`account lookup failed: ${lookupError.message}`, 500, "DB_ERROR");
    if (!existing) throw new NotFoundError("Unknown account_id");

    const allowed = await checkCompanyAccess(
      db,
      callerEmail,
      (existing as { company_id: string | null }).company_id,
    );
    if (!allowed) throw new ForbiddenError("No access to this account");

    // Count the collateral before deleting it -- afterwards there is nothing left to count.
    const { data: txns, error: txnError } = await db
      .from(TABLE.bankTransactions)
      .select("id")
      .eq("account_id", data.accountId);
    if (txnError)
      throw new AppError(`transaction lookup failed: ${txnError.message}`, 500, "DB_ERROR");
    const transactionIds = ((txns ?? []) as { id: string }[]).map((r) => r.id);

    // `.in()` goes into the query string, so a busy account (one here already has 419 movements)
    // would build a URL long enough to be rejected. Count in chunks instead.
    const CHUNK = 100;
    const countIn = async (table: string, column: string): Promise<number> => {
      let total = 0;
      for (let i = 0; i < transactionIds.length; i += CHUNK) {
        const { count } = await db
          .from(table)
          .select(column, { count: "exact", head: true })
          .in(column, transactionIds.slice(i, i + CHUNK));
        total += count ?? 0;
      }
      return total;
    };

    let purgedMatches = 0;
    let purgedFiles = 0;
    if (transactionIds.length > 0) {
      const [matchCount, outgoingCount, fileCount] = await Promise.all([
        countIn(TABLE.invoiceTransactionMatches, "transaction_id"),
        countIn(TABLE.outgoingInvoiceTransactionMatches, "transaction_id"),
        countIn(TABLE.documentFiles, "transaction_id"),
      ]);
      purgedMatches = matchCount + outgoingCount;
      purgedFiles = fileCount;

      // Every dependent row is ON DELETE CASCADE (verified against the live schema), so this one
      // delete takes the matches and attached receipts with it.
      const { error: deleteError } = await db
        .from(TABLE.bankTransactions)
        .delete()
        .eq("account_id", data.accountId);
      if (deleteError)
        throw new AppError(`transaction purge failed: ${deleteError.message}`, 500, "DB_ERROR");
    }

    const { error } = await db
      .from(TABLE.bankAccounts)
      .update({
        excluded_at: new Date().toISOString(),
        excluded_by: callerEmail,
        exclusion_reason: data.reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.accountId);
    if (error)
      throw new AppError(`bank_accounts exclude failed: ${error.message}`, 500, "DB_ERROR");

    return {
      accountId: data.accountId,
      purgedTransactions: transactionIds.length,
      purgedMatches,
      purgedFiles,
    };
  });

// ---------------------------------------------------------------------------
// restoreBankAccount — undo an exclusion. The account starts empty: its movements were purged and
// are re-imported from scratch by the next sync (the incremental cursor is derived per account
// from its newest booking_date, so an empty account pulls full history again).
// ---------------------------------------------------------------------------

export const restoreBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ accountId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<BankAccountRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = callerEmailFrom(context);
    await requireActiveAdmin(db, callerEmail);

    const { data: existing, error: lookupError } = await db
      .from(TABLE.bankAccounts)
      .select("id, company_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (lookupError)
      throw new AppError(`account lookup failed: ${lookupError.message}`, 500, "DB_ERROR");
    if (!existing) throw new NotFoundError("Unknown account_id");

    const allowed = await checkCompanyAccess(
      db,
      callerEmail,
      (existing as { company_id: string | null }).company_id,
    );
    if (!allowed) throw new ForbiddenError("No access to this account");

    const { data: account, error } = await db
      .from(TABLE.bankAccounts)
      .update({
        excluded_at: null,
        excluded_by: null,
        exclusion_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.accountId)
      .select(BANK_ACCOUNT_COLUMNS)
      .single();
    if (error)
      throw new AppError(`bank_accounts restore failed: ${error.message}`, 500, "DB_ERROR");
    return account;
  });

/**
 * Switch a bank account off, or back on.
 *
 * The gentle half of "get rid of this account". `excludeBankAccount` above purges every movement
 * and keeps the product off the feed for good; this keeps everything and only stops NEW movements
 * arriving (bank-sync skips inactive accounts in its per-account transaction loop). Reversible,
 * destroys nothing.
 *
 * It exists because deleting a provider-fed account cannot work. BANKSapi documents only two
 * DELETEs, every access or one bank access, and nothing per account, so the account cannot be
 * detached at the source and the next hourly sync upserts it straight back. A row that reappears
 * within the hour is worse than no button at all.
 *
 * Same guard as the other writes here: `bank_accounts` RLS is SELECT-only (migration 0059), so this
 * goes through the service role with an explicit admin check and `checkCompanyAccess`.
 */
export const setBankAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ accountId: z.string().uuid(), isActive: z.boolean() }))
  .handler(async ({ data, context }): Promise<BankAccountRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = callerEmailFrom(context);
    await requireActiveAdmin(db, callerEmail);

    const { data: existing, error: lookupError } = await db
      .from(TABLE.bankAccounts)
      .select("id, company_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (lookupError)
      throw new AppError(`account lookup failed: ${lookupError.message}`, 500, "DB_ERROR");
    if (!existing) throw new NotFoundError("Unknown account_id");

    const allowed = await checkCompanyAccess(
      db,
      callerEmail,
      (existing as { company_id: string | null }).company_id,
    );
    if (!allowed) throw new ForbiddenError("No access to this account");

    const { data: account, error } = await db
      .from(TABLE.bankAccounts)
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .eq("id", data.accountId)
      .select(BANK_ACCOUNT_COLUMNS)
      .single();
    if (error)
      throw new AppError(`bank_accounts set active failed: ${error.message}`, 500, "DB_ERROR");
    return account;
  });
