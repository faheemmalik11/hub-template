import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import {
  applyLexwarePayment,
  lexofficeKey,
  type PayableRecord,
} from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const JOB_KEY = "lexoffice_payment_sync";
const AUTH_FAILURE = "Lexoffice refused the API key";

interface PendingRow extends PayableRecord {
  accountingExternalId: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function pendingDocuments(db: Db): Promise<PendingRow[]> {
  const { data, error } = await db
    .from(TABLE.documents)
    .select("id, accounting_external_id, amount_gross")
    .not("accounting_external_id", "is", null)
    .is("paid_at", null)
    .is("deleted_at", null);
  if (error) throw error;
  return (data as { id: string; accounting_external_id: string; amount_gross: number | null }[]).map(
    (row) => ({
      table: "documents",
      id: row.id,
      accountingExternalId: row.accounting_external_id,
      amountGross: row.amount_gross,
    }),
  );
}

async function pendingCommissionInvoices(db: Db): Promise<PendingRow[]> {
  const { data, error } = await db
    .from(TABLE.outgoingInvoices)
    .select("id, accounting_external_id, amount_gross")
    .eq("kind", "commission")
    .not("accounting_external_id", "is", null)
    .neq("status", "paid")
    .is("deleted_at", null);
  if (error) throw error;
  return (data as { id: string; accounting_external_id: string; amount_gross: number | null }[]).map(
    (row) => ({
      table: "outgoing_invoices",
      id: row.id,
      accountingExternalId: row.accounting_external_id,
      amountGross: row.amount_gross,
    }),
  );
}

// Isolated per row: one voucher's error used to abort every row after it for that run, so a single
// stuck invoice silently stopped the whole sync. The one exception is an auth failure, which would
// fail identically for every remaining row -- that aborts the whole run instead of retrying it N times.
async function sync(db: Db) {
  const apiKey = await lexofficeKey(db);
  const documents = await pendingDocuments(db);
  const commissionInvoices = await pendingCommissionInvoices(db);
  const rows = [...documents, ...commissionInvoices];

  let markedPaid = 0;
  let voided = 0;
  let open = 0;
  const failures: string[] = [];

  for (const row of rows) {
    try {
      const outcome = await applyLexwarePayment(db, apiKey, row, row.accountingExternalId);
      if (outcome === "paid") markedPaid += 1;
      else if (outcome === "voided") voided += 1;
      else open += 1;
    } catch (error) {
      const message = messageOf(error);
      if (message === AUTH_FAILURE) throw error;
      failures.push(`${row.table}/${row.id}: ${message}`);
    }
  }

  return {
    documentsChecked: documents.length,
    commissionInvoicesChecked: commissionInvoices.length,
    markedPaid,
    voided,
    open,
    failures,
  };
}

async function syncAndRecord(db: Db) {
  const finished = { last_run_at: new Date().toISOString() };
  try {
    const result = await sync(db);
    const failureNote = result.failures.length > 0 ? `, ${result.failures.length} failed` : "";
    await db
      .from(TABLE.scheduledJobs)
      .update({
        ...finished,
        last_status: result.failures.length > 0 ? "partial" : "ok",
        last_message:
          `${result.documentsChecked} documents and ${result.commissionInvoicesChecked} commission ` +
          `invoices checked, ${result.markedPaid} marked paid, ${result.open} still open, ` +
          `${result.voided} voided${failureNote}`,
      })
      .eq("key", JOB_KEY);
    return { ok: true as const, result };
  } catch (error) {
    const message = messageOf(error);
    const { data: before } = await db
      .from(TABLE.scheduledJobs)
      .select("last_status")
      .eq("key", JOB_KEY)
      .maybeSingle();
    await db
      .from(TABLE.scheduledJobs)
      .update({ ...finished, last_status: "failed", last_message: message.slice(0, 500) })
      .eq("key", JOB_KEY);
    if (before?.last_status !== "failed") {
      await db.rpc("notify_administrators", {
        p_note: "Der Lexware-Zahlungsabgleich ist fehlgeschlagen.",
        p_path: "/incoming-invoices",
        p_source: "sync",
      });
    }
    return { ok: false as const, message };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = serviceClient();
  const outcome = await syncAndRecord(db);
  return outcome.ok ? jsonResponse(outcome.result) : jsonResponse({ error: outcome.message }, 500);
});
