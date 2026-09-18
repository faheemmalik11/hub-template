// payment-cancel — abandon a stuck payment attempt (draft/pending_sca/authorized) so the invoice
// can get a fresh "Jetzt bezahlen" attempt. Added per code-review finding: JetztBezahlenSection
// disabled the button for as long as the latest attempt was non-terminal, with no way to recover
// if the SCA webform tab was blocked by the browser's popup blocker or the user closed it by
// mistake -- the invoice became permanently unpayable via the UI. This does not move money (it
// never calls BANKSapi) -- it only records that the attempt was abandoned, same audit-trail
// discipline as every other status transition on payment_orders.
//
// Shares payment-initiate's server-side role check (_shared/payment-auth.ts) rather than relying
// on client-side gating alone: cancelling still writes to the audit trail of a money-moving
// record, so it gets the same independent verification.
//
// Body: { paymentOrderId: string }.
import { callerEmailFromAuthHeader, requirePaymentRight } from "../_shared/payment-auth.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const CANCELLABLE_STATUSES = ["draft", "pending_sca", "authorized"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();

  try {
    await requirePaymentRight(db, callerEmailFromAuthHeader(req));

    const body = await req.json().catch(() => ({}));
    const paymentOrderId = String(body.paymentOrderId ?? "");
    if (!paymentOrderId) return jsonResponse({ error: "paymentOrderId is required" }, 400);

    const { data: order, error: orderError } = await db
      .from(TABLE.paymentOrders)
      .select("id, status, document_id")
      .eq("id", paymentOrderId)
      .maybeSingle();
    if (orderError) throw new Error(`payment_orders lookup failed: ${orderError.message}`);
    if (!order) return jsonResponse({ error: "payment order not found" }, 404);
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      return jsonResponse(
        { error: `cannot cancel a payment order in status '${order.status}'` },
        409,
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await db
      .from(TABLE.paymentOrders)
      .update({
        status: "cancelled",
        cancelled_at: now,
        status_reason: "Manuell abgebrochen",
        updated_at: now,
      })
      .eq("id", paymentOrderId)
      // Guard against a race with payment-callback resolving the same row to a terminal status
      // between the read above and this write -- only cancel if it's still in a cancellable state.
      .in("status", CANCELLABLE_STATUSES)
      .select("*")
      .maybeSingle();
    if (updateError) throw new Error(`payment_orders update failed: ${updateError.message}`);
    if (!updated) {
      return jsonResponse(
        { error: "payment order changed status concurrently, not cancelled" },
        409,
      );
    }

    const actor = callerEmailFromAuthHeader(req);
    const { error: historyError } = await db.from(TABLE.documentHistory).insert({
      document_id: order.document_id,
      type: "zahlung_abgebrochen",
      text: "Zahlung manuell abgebrochen",
      actor,
    });
    if (historyError)
      console.warn("payment-cancel: invoice_history insert failed:", historyError.message);

    return jsonResponse({ paymentOrder: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("payment-cancel failed:", message);
    const status = /only supervisor|not active|no caller identity/.test(message) ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
