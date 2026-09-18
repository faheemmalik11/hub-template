// Shared finalization logic for a BANKSapi payment outcome — applies an authoritative
// BanksapiPaymentStatus to a payment_orders row and, on success, the invoice. Used by BOTH
// payment-callback (the real SCA-webform redirect path) and payment-initiate's mock-mode
// auto-complete (BANKSAPI_PAYMENT_MODE is deliberately independent of BANKSAPI_MODE — see
// banksapi.ts). Factored out so the two call sites can never drift out of sync on what "executed"
// actually does to the invoice.
import type { BanksapiPaymentStatus } from "./banksapi.ts";
import { TABLE } from "./tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface PaymentOrderRow {
  id: string;
  document_id: string;
  status: string;
  authorized_at: string | null;
  executed_at: string | null;
  failed_at: string | null;
}

export async function applyPaymentStatus(
  db: Db,
  order: PaymentOrderRow,
  result: BanksapiPaymentStatus,
): Promise<void> {
  // Never regress a row already terminal, no matter what a repeat call (or the mock auto-complete
  // racing a manual callback) reports.
  if (order.status === "executed" || order.status === "failed" || order.status === "cancelled")
    return;

  const now = new Date().toISOString();
  await db
    .from(TABLE.paymentOrders)
    .update({
      status: result.status,
      status_reason: result.reason ?? null,
      authorized_at:
        result.status === "authorized" || result.status === "executed"
          ? (order.authorized_at ?? now)
          : order.authorized_at,
      executed_at: result.status === "executed" ? now : order.executed_at,
      failed_at: result.status === "failed" ? now : order.failed_at,
      updated_at: now,
    })
    .eq("id", order.id);

  if (result.status === "executed") {
    // Only if the invoice is not already paid by some other route (bank match, manual) -- a
    // stray double-call must not stomp a paid_source another path already set.
    const { data: invoice } = await db
      .from(TABLE.documents)
      .select("id, paid_at")
      .eq("id", order.document_id)
      .maybeSingle();
    if (invoice && !invoice.paid_at) {
      await db
        .from(TABLE.documents)
        .update({ paid_at: now, paid_source: "banksapi_payment", updated_at: now })
        .eq("id", order.document_id);
      // advance_workflow_on_payment() (migration 0036/0053) writes its own 'bezahlt' invoice_history
      // row from this update -- no separate log entry needed here for the payment-succeeded fact.
    }
  } else if (result.status === "failed") {
    await db.from(TABLE.documentHistory).insert({
      document_id: order.document_id,
      type: "zahlung_fehlgeschlagen",
      text: `BANKSapi-Zahlung fehlgeschlagen${result.reason ? `: ${result.reason}` : ""}`,
      actor: "system",
    });
  }
}
