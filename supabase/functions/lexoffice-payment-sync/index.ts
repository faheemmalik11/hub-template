import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import { getVoucherPayment, lexofficeKey, paidOnFrom } from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

interface PendingDocumentRow {
  id: string;
  accounting_external_id: string;
  amount_gross: number | null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function pendingDocuments(db: Db): Promise<PendingDocumentRow[]> {
  const { data, error } = await db
    .from(TABLE.documents)
    .select("id, accounting_external_id, amount_gross")
    .not("accounting_external_id", "is", null)
    .is("paid_at", null)
    .is("deleted_at", null);
  if (error) throw error;
  return data as PendingDocumentRow[];
}

async function sync(db: Db) {
  const apiKey = await lexofficeKey(db);
  const documents = await pendingDocuments(db);

  let markedPaid = 0;
  let voided = 0;
  let partlyPaid = 0;
  for (const document of documents) {
    const payment = await getVoucherPayment(db, apiKey, document.accounting_external_id);

    if (payment.voucherStatus === "voided") {
      const { error } = await db
        .from(TABLE.documents)
        .update({ lexoffice_sync_error: "Lexware shows this voucher as voided (cancelled)" })
        .eq("id", document.id);
      if (error) throw error;
      voided += 1;
      continue;
    }

    if (payment.voucherStatus !== "paid" && payment.voucherStatus !== "paidoff") {
      const nothingPaidYet = document.amount_gross !== null &&
        payment.openAmount !== null &&
        payment.openAmount >= document.amount_gross - 0.01;
      const { error } = await db
        .from(TABLE.documents)
        .update({ lexoffice_open_amount: nothingPaidYet ? null : (payment.openAmount ?? null) })
        .eq("id", document.id);
      if (error) throw error;
      if (!nothingPaidYet && (payment.openAmount ?? 0) > 0) partlyPaid += 1;
      continue;
    }

    const { error } = await db
      .from(TABLE.documents)
      .update({
        paid_at: paidOnFrom(payment) ?? new Date().toISOString(),
        paid_source: "lexware",
        lexoffice_open_amount: 0,
      })
      .eq("id", document.id);
    if (error) throw error;
    markedPaid += 1;
  }

  return { checked: documents.length, markedPaid, voided, partlyPaid };
}

async function syncAndRecord(db: Db) {
  const finished = { last_run_at: new Date().toISOString() };
  try {
    const result = await sync(db);
    await db
      .from(TABLE.scheduledJobs)
      .update({
        ...finished,
        last_status: "ok",
        last_message:
          `${result.checked} documents checked, ${result.markedPaid} marked paid, ` +
          `${result.partlyPaid} partly paid, ${result.voided} voided`,
      })
      .eq("key", "lexoffice_payment_sync");
    return { ok: true as const, result };
  } catch (error) {
    const message = messageOf(error);
    const { data: before } = await db
      .from(TABLE.scheduledJobs)
      .select("last_status")
      .eq("key", "lexoffice_payment_sync")
      .maybeSingle();
    await db
      .from(TABLE.scheduledJobs)
      .update({ ...finished, last_status: "failed", last_message: message.slice(0, 500) })
      .eq("key", "lexoffice_payment_sync");
    if (before?.last_status !== "failed") {
      await db.rpc("notify_administrators", {
        p_note: `Der Lexware-Zahlungsabgleich ist fehlgeschlagen: ${message.slice(0, 200)}`,
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
