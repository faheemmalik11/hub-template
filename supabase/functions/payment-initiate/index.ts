// payment-initiate — trigger a BANKSapi payment for one invoice ("Jetzt bezahlen").
// Milestone 3 of docs/BANKSAPI_PAYMENT_INITIATION.md. Unlike every other BANKSapi Edge Function
// in this project, this one genuinely moves money, so it independently verifies the caller's role
// server-side (decoding the Authorization JWT's email claim and looking it up in app_users/roles
// via the service-role client) instead of relying on payment_orders' own INSERT RLS policy alone
// -- that policy only gates the client-writable draft row, not the BANKSapi call this function
// makes after inserting it.
//
// Body: { invoiceId, bankAccountId, idempotencyKey, recipientAccountId?, amount?, callbackUrl? }.
//
// recipientAccountId is WHICH of the supplier's accounts gets paid, since a supplier can have
// several and an invoice may name one that is not the default. It is an id into
// supplier_bank_accounts, never an IBAN: the client may choose among that supplier's accounts,
// it may not name an arbitrary destination for money. Ownership is re-checked here, at the
// moment of payment, because the UI's list was fetched some time earlier. Omitted, it falls back
// to the supplier's default account.
//
// amount overrides the invoice total for a part payment or a corrected sum. Validated here, not
// trusted: positive, finite, and rounded to whole cents.
// bankAccountId is which of the company's own connected accounts pays -- deliberately not
// defaulted/guessed: there is no "default payment account per company" concept yet (see
// docs/BANKSAPI_PAYMENT_INITIATION.md open questions), so the caller must say which one.
import {
  getBanksapiForPayments,
  isPublicIpv4,
  type BanksapiPaymentRequest,
} from "../_shared/banksapi.ts";
import { applyPaymentStatus } from "../_shared/payment-status.ts";
import {
  callerEmailFromAuthHeader,
  isDirectDebit,
  refuseIfApprover,
  requirePaymentRight,
} from "../_shared/payment-auth.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// A changed IBAN within this window is flagged as a hard-stop fraud signal in the confirmation
// dialog (handover doc: "a supplier suddenly presenting a new IBAN is a classic fraud signal").
// 90 days is a placeholder default, not yet a client decision -- see the open questions in
// docs/BANKSAPI_PAYMENT_INITIATION.md.
//
// KEEP IN SYNC with IBAN_CHANGE_LOOKBACK_DAYS in src/routes/eingangsrechnungen/$nr.tsx (the
// client-side preview banner). THIS copy is the real, server-side hard-stop -- the frontend's is
// only a preview. No shared config exists between the Deno function runtime and the app to
// enforce this mechanically.
const IBAN_CHANGE_LOOKBACK_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();

  try {
    const caller = await requirePaymentRight(db, callerEmailFromAuthHeader(req));

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body.invoiceId ?? "");
    const bankAccountId = String(body.bankAccountId ?? "");
    const idempotencyKey = String(body.idempotencyKey ?? "");
    const recipientAccountId = String(body.recipientAccountId ?? "");
    const requestedAmount =
      body.amount === undefined || body.amount === null ? null : Number(body.amount);
    // Deliberately NOT BANKSAPI_CALLBACK_URL — that env var is bank-connect's own callback
    // (points at bank-callback), and reusing it here would route the payment SCA webform back to
    // the wrong function. Default is derived from SUPABASE_URL (always present in the Edge
    // runtime) rather than a copy-pasted constant, so it can never drift from the actual project.
    const callbackUrl =
      body.callbackUrl ??
      Deno.env.get("BANKSAPI_PAYMENT_CALLBACK_URL") ??
      `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/payment-callback`;
    // Customer-IP-Address is required by BANKSapi's payment endpoint, same as bank-connect's
    // account-connection call -- same extraction pattern (bank-connect/index.ts).
    const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim());
    const customerIp = body.customerIp ?? forwarded.find(isPublicIpv4) ?? "";
    // Where payment-callback should send the user's browser back to once it's done -- the
    // browser's own Origin header, so a local dev session gets redirected back to localhost
    // instead of the live Hub. Embedded into the callbackUrl below (payment-callback validates
    // it against an allowlist before using it as a redirect target, since that endpoint is public).
    const hubBase = body.hubBase ?? req.headers.get("origin") ?? undefined;
    if (!invoiceId || !bankAccountId || !idempotencyKey) {
      return jsonResponse(
        { error: "invoiceId, bankAccountId and idempotencyKey are required" },
        400,
      );
    }

    // Idempotency: a repeat call with the same key returns the existing row untouched instead of
    // submitting a second live transfer.
    const { data: existingOrder } = await db
      .from(TABLE.paymentOrders)
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingOrder) {
      return jsonResponse({ paymentOrder: existingOrder, reused: true });
    }

    const { data: invoice, error: invoiceError } = await db
      .from(TABLE.documents)
      .select(
        "id, company_id, supplier_id, amount_gross, currency, invoice_number, paid_at, " +
          "workflow_status, approved_by, payment_method",
      )
      .eq("id", invoiceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (invoiceError) throw new Error(`invoice lookup failed: ${invoiceError.message}`);
    if (!invoice) return jsonResponse({ error: "invoice not found" }, 404);
    if (invoice.paid_at) return jsonResponse({ error: "invoice is already marked as paid" }, 409);
    // handover/FREELANCER-HANDOVER.md: "after final approval, payment is initiated" --
    // 'freigegeben_vorgesetzter' IS the "awaiting payment" state (migration 0036, no separate
    // "released for payment" stage), so this is the one workflow_status a payment may start from.
    // Enforced server-side, not just by hiding the button client-side, since this is the actual
    // authorization boundary for a money-moving call.
    if (invoice.workflow_status !== "freigegeben_vorgesetzter") {
      return jsonResponse(
        {
          error: `invoice must be fully approved (freigegeben_vorgesetzter) before payment can be triggered, currently '${invoice.workflow_status}'`,
        },
        409,
      );
    }
    // The two-person rule. After the status check on purpose: "not approved yet" is the more
    // useful answer when both are true.
    refuseIfApprover(caller, invoice);
    // A direct debit is collected by the supplier. Transferring it as well pays the invoice twice,
    // and the money is gone before anybody notices. The detail screen already warns about this;
    // until now nothing stopped the button underneath the warning.
    if (isDirectDebit(invoice.payment_method)) {
      return jsonResponse(
        {
          error: "this invoice is collected by direct debit and must not be transferred again",
        },
        409,
      );
    }
    if (!invoice.supplier_id)
      return jsonResponse({ error: "invoice has no supplier assigned" }, 400);
    if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      return jsonResponse({ error: "amount must be a positive number" }, 400);
    }
    if (requestedAmount === null && (!invoice.amount_gross || invoice.amount_gross <= 0)) {
      return jsonResponse({ error: "invoice has no positive amount to pay" }, 400);
    }
    // Whole cents: a float that reached here as 269.51000000000005 must not be what BANKSapi is
    // asked to move, nor what payment_orders records as having been moved.
    const amountToPay = Math.round((requestedAmount ?? invoice.amount_gross) * 100) / 100;

    const { data: supplier, error: supplierError } = await db
      .from(TABLE.suppliers)
      .select("id, name, iban, bic, bank_name")
      .eq("id", invoice.supplier_id)
      .maybeSingle();
    if (supplierError) throw new Error(`supplier lookup failed: ${supplierError.message}`);
    if (!supplier) return jsonResponse({ error: "invoice's supplier no longer exists" }, 400);

    // Spaces leaked into some stored IBANs as display formatting. Normalize before anything
    // reaches BANKSapi or gets snapshotted: a real payment API is far more likely to reject a
    // space-formatted IBAN than a read-only display field is to care.
    const compact = (value: string) => value.replace(/\s+/g, "").toUpperCase();

    let recipientIban: string;
    let recipientBic: string | null;
    if (recipientAccountId) {
      const { data: recipientAccount, error: recipientError } = await db
        .from(TABLE.supplierBankAccounts)
        .select("id, supplier_id, iban, bic, deleted_at, is_active, is_payable")
        .eq("id", recipientAccountId)
        .maybeSingle();
      if (recipientError)
        throw new Error(`recipient account lookup failed: ${recipientError.message}`);
      // The chosen account must STILL belong to this invoice's supplier and still be live. The
      // client picked from a list it fetched earlier; this is the check that actually counts.
      if (
        !recipientAccount ||
        recipientAccount.supplier_id !== invoice.supplier_id ||
        recipientAccount.deleted_at ||
        recipientAccount.is_active === false
      ) {
        return jsonResponse(
          { error: "recipient account does not belong to this invoice's supplier" },
          400,
        );
      }
      // A masked IBAN is kept on file so a person can complete it, never paid to.
      if (recipientAccount.is_payable === false) {
        return jsonResponse({ error: "recipient IBAN is incomplete and cannot be paid" }, 400);
      }
      recipientIban = compact(recipientAccount.iban);
      recipientBic = recipientAccount.bic ? compact(recipientAccount.bic) : null;
    } else {
      if (!supplier.iban) return jsonResponse({ error: "supplier has no IBAN on file" }, 400);
      recipientIban = compact(supplier.iban);
      recipientBic = supplier.bic ? compact(supplier.bic) : null;
    }

    const { data: bankAccount, error: bankAccountError } = await db
      .from(TABLE.bankAccounts)
      .select(
        `id, iban, banksapi_product_id, is_sandbox, connection_id, ${TABLE.bankConnections}(banksapi_access_id)`,
      )
      .eq("id", bankAccountId)
      .maybeSingle();
    if (bankAccountError)
      throw new Error(`bank account lookup failed: ${bankAccountError.message}`);
    const accessId = (
      bankAccount as unknown as { bank_connections: { banksapi_access_id: string } | null }
    )?.bank_connections?.banksapi_access_id;
    if (!bankAccount || !accessId || !bankAccount.banksapi_product_id) {
      return jsonResponse({ error: "bank account is not a connected BANKSapi account" }, 400);
    }
    // BANKSapi's bulk-transfer `product` field is the debit account's IBAN, NOT
    // banksapi_product_id -- they're usually the same string for a plain checking account,
    // which is why this only surfaced when tested against a Bausparvertrag-style product
    // (product id "123456_BP_..." != its IBAN). Confirmed live, both via the raw API and
    // BANKSapi's own webform screenshot: "Die IBAN 123456_BP_Zwischenfinanzierung wurde
    // nicht gefunden" when the product id is sent instead of the real IBAN.
    if (!bankAccount.iban) {
      return jsonResponse(
        { error: "bank account has no IBAN on file, cannot be used to pay from" },
        400,
      );
    }

    // Fraud signal: a supplier IBAN changed recently is flagged, not blocked -- the confirmation
    // dialog is where a human is stopped to look at it, this only computes the flag.
    const lookbackFrom = new Date(
      Date.now() - IBAN_CHANGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentIbanChanges } = await db
      .from(TABLE.supplierIbanHistory)
      .select("id")
      .eq("supplier_id", supplier.id)
      .gte("changed_at", lookbackFrom)
      .limit(1);
    const ibanChangedRecently = (recentIbanChanges?.length ?? 0) > 0;

    const actor = callerEmailFromAuthHeader(req);
    const now = new Date().toISOString();
    const { data: draft, error: draftError } = await db
      .from(TABLE.paymentOrders)
      .insert({
        document_id: invoice.id,
        company_id: invoice.company_id,
        recipient_name: supplier.name,
        recipient_iban: recipientIban,
        recipient_bic: recipientBic,
        amount: amountToPay,
        currency: invoice.currency ?? "EUR",
        payment_reference: `Rechnung ${invoice.invoice_number ?? invoice.id}`,
        status: "draft",
        banksapi_access_id: accessId,
        banksapi_product_id: bankAccount.banksapi_product_id,
        // True if EITHER the paying account is itself a sandbox account OR the payment mode
        // (BANKSAPI_PAYMENT_MODE, independent of the read-side BANKSAPI_MODE) is mock — a mock
        // payment must never read as "real" just because it was made from a live-looking account.
        is_sandbox: bankAccount.is_sandbox || getBanksapiForPayments().mode === "mock",
        idempotency_key: idempotencyKey,
        recipient_iban_changed_recently: ibanChangedRecently,
        fraud_flags: ibanChangedRecently
          ? { iban_changed_recently: { lookback_days: IBAN_CHANGE_LOOKBACK_DAYS } }
          : null,
        initiated_by: actor,
        initiated_at: now,
      })
      .select("*")
      .single();
    if (draftError) throw new Error(`payment_orders insert failed: ${draftError.message}`);

    const paymentRequest: BanksapiPaymentRequest = {
      recipientIban,
      recipientBic: recipientBic ?? undefined,
      recipientName: supplier.name,
      amount: amountToPay,
      currency: invoice.currency ?? "EUR",
      reference: draft.payment_reference,
      // Stable, unique -- our only reliable hook back to this payment_orders row once the
      // transfer leaves our system (docs/BANKSAPI_PAYMENT_INITIATION.md).
      endToEndId: draft.id,
    };

    // Embed our own payment_orders id (and where to send the browser back to) in the
    // callbackUrl BANKSapi redirects back to -- confirmed live 2026-08-05 that BANKSapi's
    // payment webform does not send back any BANKSapi paymentId of its own, only baReentry.
    // Same pattern as bank-connect's callbackUrl, whose query params BANKSapi preserves and
    // appends its own onto (baReentry, in that case).
    const callbackUrlWithOrderId = new URL(callbackUrl);
    callbackUrlWithOrderId.searchParams.set("orderId", draft.id);
    if (hubBase) callbackUrlWithOrderId.searchParams.set("hubBase", hubBase);

    let session;
    try {
      session = await getBanksapiForPayments().initiatePayment(
        accessId,
        bankAccount.iban,
        paymentRequest,
        callbackUrlWithOrderId.toString(),
        customerIp,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      await db
        .from(TABLE.paymentOrders)
        .update({
          status: "failed",
          status_reason: message,
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      throw e;
    }

    const { data: updated, error: updateError } = await db
      .from(TABLE.paymentOrders)
      .update({
        status: session.status,
        banksapi_payment_id: session.paymentId,
        authorized_at:
          session.status === "authorized" || session.status === "executed" ? now : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id)
      .select("*")
      .single();
    if (updateError) throw new Error(`payment_orders update failed: ${updateError.message}`);

    const { error: historyError } = await db.from(TABLE.documentHistory).insert({
      document_id: invoice.id,
      type: "zahlung_ausgeloest",
      text: `Zahlung über BANKSapi ausgelöst (${supplier.name ?? "Lieferant"}, ${draft.payment_reference})`,
      actor,
    });
    if (historyError)
      console.warn("payment-initiate: invoice_history insert failed:", historyError.message);

    // Mock mode has no real webform for a customer to complete (see docs/BANKSAPI_PAYMENT_INITIATION.md
    // §5) -- there is nothing for the SCA handoff to wait on, so auto-complete immediately via the
    // SAME finalization path payment-callback uses, rather than leaving every mock payment stuck at
    // pending_sca until someone manually curls the callback. Deliberately gated on
    // getBanksapiForPayments().mode, not BANKSAPI_MODE -- see the mode-decoupling note in banksapi.ts.
    let finalOrder = updated;
    let responseWebformUrl: string | undefined = session.webformUrl;
    if (getBanksapiForPayments().mode === "mock") {
      const result = await getBanksapiForPayments().getPaymentStatus(accessId, session.paymentId);
      await applyPaymentStatus(db, updated, result);
      const { data: refreshed } = await db
        .from(TABLE.paymentOrders)
        .select("*")
        .eq("id", draft.id)
        .maybeSingle();
      finalOrder = refreshed ?? updated;
      responseWebformUrl = undefined; // nothing to open — already resolved
    }

    return jsonResponse({ paymentOrder: finalOrder, webformUrl: responseWebformUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("payment-initiate failed:", message);
    const status = /only supervisor|not active|no caller identity/.test(message) ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
