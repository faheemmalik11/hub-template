// Server functions backing the manual bank-transaction import wizard (the third bank_transactions
// inflow — communication thread 4, migration 0071/0082 — for accounts BANKSapi cannot reach).
//
// bank_accounts/bank_transactions are SELECT-only for `authenticated` under RLS (migration 0059,
// bank_accounts_select/bank_transactions_select — no INSERT/UPDATE policy). Rather than widening
// RLS, this follows the same pattern already established in employees.functions.ts: a service-role
// server function with its OWN explicit access check, mirroring has_company_access()'s exact
// semantics (see checkCompanyAccess below) since the service-role client has no user JWT for
// has_company_access() to evaluate against — auth.jwt() would simply be empty.
//
// Parsing (CSV/XLSX → NormalizedRow) happens entirely client-side in src/lib/bank-import/; this
// file only receives already-normalized rows. It owns the parts that must not drift with a stale
// browser tab: external_id synthesis, transaction_type classification, and hardcoding
// source="manual" (a client-supplied source is never trusted).
import { createHash } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyTransactionType } from "@/lib/bank-import/classify";
import type { NormalizedRow } from "@/lib/bank-import/types";
import { checkCompanyAccess } from "./company-access";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  BANK_ACCOUNT_IMPORT_RULES,
  normalizeBankAccountFields,
  validateBankAccountFields,
} from "@/lib/data/bank-account-fields";
import { TABLE } from "@/lib/data/tables";

// bank_accounts/bank_transactions aren't in the generated Database type (see CLAUDE.md), so
// writes go through an untyped client, same convention as employees.functions.ts.
type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const BATCH_SIZE = 500;

function callerEmailFrom(context: { claims?: unknown }): string {
  const email = (context.claims as { email?: string } | undefined)?.email;
  if (!email) throw new ForbiddenError("No email on the authenticated session");
  return email;
}

// ---------------------------------------------------------------------------
// create_account
// ---------------------------------------------------------------------------

const CreateManualBankAccountSchema = z
  .object({
    companyId: z.string().uuid(),
    accountName: z.string(),
    iban: z.string(),
    bic: z.string().optional(),
    bankName: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const errors = validateBankAccountFields(
      {
        accountName: values.accountName,
        companyId: values.companyId,
        iban: values.iban,
        bic: values.bic ?? null,
        holder: null,
        bankName: values.bankName ?? null,
        productType: null,
        currency: null,
      },
      BANK_ACCOUNT_IMPORT_RULES,
    );
    for (const [field, code] of Object.entries(errors)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: code });
    }
  });

// Explicit flat columns, not select("*") -- TanStack Start's server-fn return type must be
// provably serializable, which a jsonb `metadata` field (index-signature/`unknown`) defeats. The
// wizard doesn't need metadata anyway.
const ACCOUNT_COLUMNS =
  "id, company_id, account_name, iban, bic, bank_name, is_own_account, is_sandbox, connect_route, created_at, updated_at";

export interface ManualBankAccountRow {
  id: string;
  company_id: string | null;
  account_name: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  is_own_account: boolean;
  is_sandbox: boolean;
  connect_route: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateManualBankAccountResult {
  ok: true;
  account: ManualBankAccountRow;
}
export interface CreateManualBankAccountConflict {
  ok: false;
  conflict: true;
  existingAccount: ManualBankAccountRow | null;
}

export const createManualBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(CreateManualBankAccountSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<CreateManualBankAccountResult | CreateManualBankAccountConflict> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const db = supabaseAdmin as Db;

      const callerEmail = callerEmailFrom(context);
      const allowed = await checkCompanyAccess(db, callerEmail, data.companyId);
      if (!allowed) throw new ForbiddenError("No access to this company");

      const values = normalizeBankAccountFields({
        accountName: data.accountName,
        companyId: data.companyId,
        iban: data.iban,
        bic: data.bic ?? null,
        holder: null,
        bankName: data.bankName ?? null,
        productType: null,
        currency: null,
      });

      const { data: account, error } = await db
        .from(TABLE.bankAccounts)
        .insert({
          company_id: values.companyId,
          account_name: values.accountName,
          iban: values.iban,
          bic: values.bic,
          bank_name: values.bankName,
          is_own_account: true,
          is_sandbox: false,
          provider_id: null, // trigger (0028) sets connect_route = 'ebics_or_manual'
        })
        .select(ACCOUNT_COLUMNS)
        .single();

      if (error) {
        // bank_accounts_iban_uniq (0028): surface the existing account so the UI can offer
        // "select it instead" rather than a dead-end error.
        if (error.code === "23505") {
          const { data: existing } = await db
            .from(TABLE.bankAccounts)
            .select(ACCOUNT_COLUMNS)
            .eq("iban", values.iban)
            .maybeSingle();
          return { ok: false, conflict: true, existingAccount: existing ?? null };
        }
        throw new AppError(`bank_accounts insert failed: ${error.message}`, 500, "DB_ERROR");
      }

      return { ok: true, account };
    },
  );

// ---------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------

const NormalizedRowSchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value_date: z.string().nullable(),
  amount: z.number().finite(),
  currency: z.string().nullable(),
  counterparty_holder: z.string().nullable(),
  counterparty_iban: z.string().nullable(),
  payment_reference: z.string().nullable(),
  booking_text: z.string().nullable(),
  provider_ref: z.string().nullable(),
});

const ImportManualTransactionsSchema = z.object({
  accountId: z.string().uuid(),
  filename: z.string().trim().min(1),
  rows: z.array(NormalizedRowSchema).min(1),
});

interface MappedRow {
  source: "manual";
  external_id: string;
  amount: number;
  currency: string | null;
  booking_date: string;
  value_date: string | null;
  booking_text: string | null;
  payment_reference: string | null;
  counterparty_holder: string | null;
  counterparty_iban: string | null;
  is_sandbox: boolean;
  transaction_type: string;
  transaction_type_source: string;
  raw_data: Record<string, unknown>;
}

function normalizeForHash(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute external_id server-side so the dedup key can never drift with a stale client build.
 * See docs/BANK_MANUAL_IMPORT.md for the full rationale and the known same-batch-duplicate
 * limitation of the occurrence-index fallback.
 */
function assignExternalIds(accountId: string, rows: NormalizedRow[]): MappedRow[] {
  const withRef: Array<{ row: NormalizedRow; key: string }> = [];
  const withoutRef: NormalizedRow[] = [];
  for (const row of rows) {
    const ref = row.provider_ref?.trim();
    if (ref) withRef.push({ row, key: `${accountId}|${ref}` });
    else withoutRef.push(row);
  }

  // Fallback rows: stable-sort by content so re-uploading the same file in a different row order
  // still yields the same external_ids, then number duplicates within each identical group.
  const contentKey = (row: NormalizedRow) =>
    [
      row.booking_date,
      row.amount.toFixed(2),
      normalizeForHash(row.currency),
      normalizeForHash(row.payment_reference),
      normalizeForHash(row.counterparty_iban),
      normalizeForHash(row.booking_text),
    ].join("|");

  const sorted = withoutRef
    .map((row, originalIndex) => ({ row, originalIndex, key: contentKey(row) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.originalIndex - b.originalIndex));

  const occurrence = new Map<string, number>();
  const withoutRefKeyed = sorted.map(({ row, key }) => {
    const n = occurrence.get(key) ?? 0;
    occurrence.set(key, n + 1);
    return { row, key: `${accountId}|${key}|${n}` };
  });

  return [...withRef, ...withoutRefKeyed].map(({ row, key }) => ({
    source: "manual" as const,
    external_id: sha256Hex(key),
    amount: row.amount,
    currency: row.currency,
    booking_date: row.booking_date,
    value_date: row.value_date,
    booking_text: row.booking_text,
    payment_reference: row.payment_reference,
    counterparty_holder: row.counterparty_holder,
    counterparty_iban: row.counterparty_iban,
    is_sandbox: false,
    transaction_type: classifyTransactionType({
      bookingText: row.booking_text,
      paymentReference: row.payment_reference,
      amount: row.amount,
      productType: null,
    }),
    transaction_type_source: "auto",
    raw_data: { manual_import: true },
  }));
}

export interface ImportManualTransactionsResult {
  ok: true;
  runId: string;
  received: number;
  inserted: number;
  updated: number;
}

export const importManualBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(ImportManualTransactionsSchema)
  .handler(async ({ data, context }): Promise<ImportManualTransactionsResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = callerEmailFrom(context);

    const { data: account, error: accountError } = await db
      .from(TABLE.bankAccounts)
      .select("id, company_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (accountError)
      throw new AppError(`account lookup failed: ${accountError.message}`, 500, "DB_ERROR");
    if (!account) throw new NotFoundError("Unknown account_id");

    const allowed = await checkCompanyAccess(
      db,
      callerEmail,
      (account as { company_id: string | null }).company_id,
    );
    if (!allowed) throw new ForbiddenError("No access to this account");

    if (data.rows.length === 0) throw new ValidationError("rows is empty");

    const runId = crypto.randomUUID();
    const log = async (
      event: string,
      level: "info" | "warn" | "error",
      message: string,
      counts: Record<string, unknown> = {},
    ) => {
      try {
        await db.from(TABLE.bankSyncLogs).insert({ run_id: runId, event, level, message, counts });
      } catch {
        /* logging must never be the reason an import fails */
      }
    };

    await log("start", "info", `Manual import started: ${data.filename}`, {
      account_id: data.accountId,
      rows: data.rows.length,
    });

    const mapped = assignExternalIds(data.accountId, data.rows);
    const stats = { received: data.rows.length, inserted: 0, updated: 0 };

    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      const { data: rpcData, error } = await db.rpc("upsert_external_transactions", {
        p_rows: batch,
        p_account_id: data.accountId,
      });
      if (error) {
        await log("write_error", "error", `Upsert failed: ${error.message}`, {
          batch_size: batch.length,
          ...stats,
        });
        throw new AppError(`bank_transactions upsert failed: ${error.message}`, 500, "DB_ERROR");
      }
      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      stats.inserted += result?.inserted_count ?? 0;
      stats.updated += result?.updated_count ?? 0;
    }

    await log("done", "info", `Manual import finished: ${data.filename}`, stats);
    return { ok: true, runId, ...stats };
  });
