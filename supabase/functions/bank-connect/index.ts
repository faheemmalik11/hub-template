// bank-connect — start a BANKSapi bank-access (REG/Protect) session and return the
// webform URL the user opens to authorize their bank. Creates a 'pending' connection
// row. No secrets reach the frontend; the browser only receives the webform URL.
// Body: { callbackUrl?: string, customerIp?: string }.
import { isPublicIpv4, isSandboxConnection } from "../_shared/adapters/banksapi/client.ts";
import { resolveBankingAdapter } from "../_shared/tenant-config.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// "Manage bank connections" on Team & Rollen. The Connect button on /bankkonten is already gated on
// it; this is the same rule where it actually counts. Hiding a button stops nobody who calls the
// function directly, and until now any signed-in account could start a bank consent session.
const PERMISSION = "page.bankverbindungen";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  try {
    const db: Db = serviceClient();

    // Before anything reaches BANKSapi: a refused caller must not leave an open REG/Protect session
    // behind, since an open session blocks the next legitimate one until it is cleared.
    const caller = await requirePermission(db, callerEmailFromAuthHeader(req), PERMISSION);

    const body = await req.json().catch(() => ({}));
    const callbackUrl =
      body.callbackUrl ??
      Deno.env.get("BANKSAPI_CALLBACK_URL") ??
      "https://example.invalid/callback";
    // Customer-IP-Address must be a public IPv4. x-forwarded-for often holds an IPv6
    // client address, which BANKSapi rejects with a 400, so take the first usable IPv4
    // hop and let the wrapper fall back when the whole chain is unusable.
    const forwarded = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim());
    const customerIp = body.customerIp ?? forwarded.find(isPublicIpv4) ?? "";

    const adapter = await resolveBankingAdapter();
    const session = await adapter.createAccessSession(callbackUrl, customerIp);

    const row = {
      provider_access_ref: session.accessRef,
      status: "pending",
      is_sandbox: isSandboxConnection(adapter.mode),
      // WHOSE CONSENT THIS IS. The person who opens the webform authorises at their own bank, so
      // they are the one to renew it when it expires. The email rides along so the answer survives
      // their account being removed (migration 20260915100000).
      connected_by: caller.id,
      connected_by_email: caller.email,
      metadata: { started_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: selectError } = await db
      .from(TABLE.bankConnections)
      .select("id")
      .eq("provider_access_ref", session.accessRef)
      .maybeSingle();
    if (selectError) throw new Error(`bank_connections lookup failed: ${selectError.message}`);

    const { error: writeError } = existing?.id
      ? await db.from(TABLE.bankConnections).update(row).eq("id", existing.id)
      : await db.from(TABLE.bankConnections).insert(row);
    if (writeError) throw new Error(`bank_connections write failed: ${writeError.message}`);

    return jsonResponse({
      webformUrl: session.webformUrl,
      accessId: session.accessRef,
      mode: adapter.mode,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    // Same mapping as bank-disconnect: a refusal is a 403, not a server fault.
    const forbidden = /permission|not active|caller identity/i.test(message);
    if (!forbidden) console.error("bank-connect failed:", message);
    return jsonResponse({ error: message }, forbidden ? 403 : 500);
  }
});
