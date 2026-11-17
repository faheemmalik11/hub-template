import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import { getVoucherPayment, lexofficeKey, paidOnFrom } from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const JOB_KEY = "lexoffice_commission_payment_sync";
const AUTH_FAILURE = "Lexoffice refused the API key";

interface PendingInvoiceRow {
  id: string;
  accounting_external_id: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function pendingCommissionInvoices(db: Db): Promise<PendingInvoiceRow[]> {
  const { data, error } = await db
    .from(TABLE.outgoingInvoices)
    .select("id, accounting_external_id")
    .eq("kind", "commission")
    .not("accounting_external_id", "is", null)
    .neq("status", "paid")
    .is("deleted_at", null);
  if (error) throw error;
  return data as PendingInvoiceRow[];
}

// Isolated per row, unlike lexoffice-payment-sync's documents loop, where one invoice's error
// aborts every invoice after it for that run. The one exception is an auth failure, which would
// fail identically for every remaining row -- the caller aborts the whole batch on that instead of
// retrying it N times.
async function syncOne(db: Db, apiKey: string, invoice: PendingInvoiceRow): Promise<"paid" | "voided" | "open"> {
  const payment = await getVoucherPayment(db, apiKey, invoice.accounting_external_id);

  if (payment.voucherStatus === "voided") {
    const { error } = await db
      .from(TABLE.outgoingInvoices)
      .update({ lexoffice_sync_error: "Lexware shows this voucher as voided (cancelled)" })
      .eq("id", invoice.id);
    if (error) throw error;
    return "voided";
  }

  if (payment.voucherStatus !== "paid" && payment.voucherStatus !== "paidoff") {
    return "open";
  }

  const { error } = await db
    .from(TABLE.outgoingInvoices)
    .update({
      status: "paid",
      paid_at: paidOnFrom(payment) ?? new Date().toISOString(),
      paid_source: "lexware",
    })
    .eq("id", invoice.id);
  if (error) throw error;
  return "paid";
}

async function sync(db: Db) {
  const apiKey = await lexofficeKey(db);
  const invoices = await pendingCommissionInvoices(db);

  let markedPaid = 0;
  let voided = 0;
  let open = 0;
  const failures: string[] = [];

  for (const invoice of invoices) {
    try {
      const outcome = await syncOne(db, apiKey, invoice);
      if (outcome === "paid") markedPaid += 1;
      else if (outcome === "voided") voided += 1;
      else open += 1;
    } catch (error) {
      const message = messageOf(error);
      if (message === AUTH_FAILURE) throw error;
      failures.push(`${invoice.id}: ${message}`);
    }
  }

  return { checked: invoices.length, markedPaid, voided, open, failures };
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
          `${result.checked} commission invoices checked, ${result.markedPaid} marked paid, ` +
          `${result.open} still open, ${result.voided} voided${failureNote}`,
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
        p_note: "Der Lexware-Abgleich für Provisionsrechnungen ist fehlgeschlagen.",
        p_path: "/broker-bonuses",
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
