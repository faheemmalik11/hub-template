// payment-callback — BANKSapi payment-SCA redirect target (Milestone 3 of
// docs/BANKSAPI_PAYMENT_INITIATION.md). Mirrors bank-callback's shape (public, browser redirect,
// only ever UPDATEs a row payment-initiate already created, never inserts) with one deliberate
// difference: because this moves real money, it does NOT trust the query string's own claim of
// success/failure -- that would let a forged callback URL mark an invoice paid without any money
// having moved. Instead it re-asks BANKSapi's own getPaymentStatus for the authoritative outcome
// and only ever writes what that call reports.
//
// Identifies the row via `orderId` (our own payment_orders id), NOT `paymentId` -- confirmed live
// 2026-08-05 that BANKSapi's bulk-transfer webform redirect only carries `baReentry`, no BANKSapi
// paymentId at all. payment-initiate embeds orderId into the callbackUrl before the initial POST,
// same way BANKSapi's own webform preserves callbackUrl query params for the account-connect flow
// (bank-callback's accessId). We already have the real banksapi_payment_id stored on the row from
// initiation, so we don't need BANKSapi to send it back.
//
// PUBLIC endpoint: verify_jwt = false in config.toml (see the [functions.payment-callback] entry
// added alongside bank-callback's).
import { getBanksapiForPayments } from "../_shared/banksapi.ts";
import { applyPaymentStatus } from "../_shared/payment-status.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// Only accept a caller-supplied hubBase (from the original browser's Origin, embedded by
// payment-initiate) if it's local dev or the configured live Hub -- this endpoint is public,
// so blindly trusting an arbitrary query-string redirect target would be an open redirect.
function isAllowedHubBase(value: string, liveBase: string): boolean {
  try {
    const u = new URL(value);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return u.origin === new URL(liveBase).origin;
  } catch {
    return false;
  }
}

function hubRedirect(
  invoiceNumber: string | null,
  outcome: "executed" | "failed" | "pending" | "error",
  requestedBase: string | null,
): string {
  // HUB_BASE_URL is set as a live Supabase secret, so this fallback should never actually fire in
  // production -- it exists only so a misconfigured environment fails obviously (redirects to
  // localhost) instead of silently sending the user's browser to a domain this app doesn't own.
  const envBase = Deno.env.get("HUB_BASE_URL");
  if (!envBase) {
    console.error(
      "payment-callback: HUB_BASE_URL is not set -- falling back to http://localhost:8080",
    );
  }
  const liveBase = (envBase ?? "http://localhost:8080").replace(/\/+$/, "");
  const base = (
    requestedBase && isAllowedHubBase(requestedBase, liveBase) ? requestedBase : liveBase
  ).replace(/\/+$/, "");
  const path = invoiceNumber
    ? `/eingangsrechnungen/${encodeURIComponent(invoiceNumber)}`
    : "/eingangsrechnungen";
  const url = new URL(`${base}${path}`);
  url.searchParams.set("payment", outcome);
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let outcome: "executed" | "failed" | "pending" | "error" = "error";
  let invoiceNumber: string | null = null;
  const url = new URL(req.url);
  const hubBase = url.searchParams.get("hubBase");

  try {
    const orderId = url.searchParams.get("orderId");
    if (!orderId) {
      console.warn("payment-callback: request carried no orderId");
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: hubRedirect(null, "error", hubBase) },
      });
    }

    const db: Db = serviceClient();
    const { data: order } = await db
      .from(TABLE.paymentOrders)
      .select(`*, ${TABLE.documents}(invoice_number)`)
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      // No matching row: a stale/forged callback. Recorded in logs only, never inserted.
      console.warn("payment-callback: no payment_orders row for orderId", orderId);
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: hubRedirect(null, "error", hubBase) },
      });
    }
    if (!order.banksapi_payment_id) {
      console.warn("payment-callback: order has no banksapi_payment_id yet", orderId);
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: hubRedirect(null, "error", hubBase) },
      });
    }

    invoiceNumber =
      (order.documents as { invoice_number: string | null } | null)?.invoice_number ?? null;

    // Already terminal: never regress a row that already executed/failed/was cancelled back to
    // anything else, no matter what a repeat callback claims.
    if (order.status === "executed" || order.status === "failed" || order.status === "cancelled") {
      outcome =
        order.status === "executed" ? "executed" : order.status === "failed" ? "failed" : "error";
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: hubRedirect(invoiceNumber, outcome, hubBase) },
      });
    }

    // Authoritative check — never trust the query string for the outcome itself.
    const result = await getBanksapiForPayments().getPaymentStatus(
      order.banksapi_access_id,
      order.banksapi_payment_id,
    );
    await applyPaymentStatus(db, order, result);
    outcome =
      result.status === "executed" ? "executed" : result.status === "failed" ? "failed" : "pending";
  } catch (e) {
    console.error("payment-callback failed:", e instanceof Error ? e.message : e);
    outcome = "error";
  }

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: hubRedirect(invoiceNumber, outcome, hubBase) },
  });
});
