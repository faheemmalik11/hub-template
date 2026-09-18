// bank-callback — BANKSapi REG/Protect redirect target. BANKSapi appends the access
// id and a result (e.g. baReentry=ERROR on failure). We record the outcome on the
// connection, then send the customer's browser on to the Hub so they land on a real
// page instead of raw JSON.
//
// PUBLIC endpoint: verify_jwt = false in config.toml, because this is a browser redirect
// with no Authorization header. Because it is unauthenticated it only ever UPDATES a
// connection row that bank-connect already created; it never inserts, so an unknown or
// forged access id cannot add rows.
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// Kick off an import as soon as the bank access exists, so the customer sees their
// accounts without waiting for the next scheduled run. Deliberately NOT awaited before
// the redirect: a first sync pulls full history and can take far longer than a browser
// will sit on a redirect. EdgeRuntime.waitUntil keeps it alive after the response.
function triggerSync(): void {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("bank-callback: cannot trigger bank-sync, missing SUPABASE_URL / key");
    return;
  }
  const syncSecret = Deno.env.get("SYNC_SECRET");
  const pending = fetch(`${url}/functions/v1/bank-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`, // satisfies verify_jwt and bank-sync's own gate
      "Content-Type": "application/json",
      ...(syncSecret ? { "x-sync-secret": syncSecret } : {}),
    },
    body: "{}",
  })
    .then(async (res) => {
      console.log(
        "bank-callback: bank-sync returned",
        res.status,
        (await res.text()).slice(0, 300),
      );
    })
    .catch((e) => console.error("bank-callback: bank-sync trigger failed:", e));

  // Present in the Supabase edge runtime; guard so local `functions serve` still works.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  runtime?.waitUntil?.(pending);
}

// Where to drop the customer once the outcome is recorded.
function hubRedirect(outcome: "connected" | "error"): string {
  // HUB_BASE_URL is set as a live Supabase secret, so this fallback should never actually fire in
  // production -- it exists only so a misconfigured environment fails obviously (redirects to
  // localhost) instead of silently sending the user's browser to a domain this app doesn't own.
  const envBase = Deno.env.get("HUB_BASE_URL");
  if (!envBase) {
    console.error(
      "bank-callback: HUB_BASE_URL is not set -- falling back to http://localhost:8080",
    );
  }
  const base = (envBase ?? "http://localhost:8080").replace(/\/+$/, "");
  const url = new URL(`${base}/bankkonten`);
  url.searchParams.set("bank", outcome);
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let outcome: "connected" | "error" = "error";

  try {
    const url = new URL(req.url);

    // Record every parameter BANKSapi sent. Without this a failed callback is undiagnosable: the
    // function only sees console output, which is not readable from the CLI, and the connection
    // row is left untouched precisely in the case you most need to explain (no matching access id).
    try {
      const db: Db = serviceClient();
      await db.from(TABLE.bankSyncLogs).insert({
        run_id: crypto.randomUUID(),
        event: "callback_received",
        level: "info",
        message: `bank-callback query: ${url.search || "(none)"}`,
        counts: Object.fromEntries(url.searchParams.entries()),
      });
    } catch {
      /* diagnostics must never break the redirect */
    }
    const accessId = url.searchParams.get("bankzugang") ?? url.searchParams.get("accessId");
    const reentry = url.searchParams.get("baReentry");
    // Only FINISHED/ACCOUNT_CREATED mean success -- everything else is a documented
    // failure reason (USER_CANCELLED, INVALID_CREDENTIALS, INVALID_TAN, SESSION_TIMEOUT,
    // an unrecognized/missing value, ...), not just the literal "ERROR" this used to check.
    const SUCCESS_REENTRY = new Set(["FINISHED", "ACCOUNT_CREATED"]);
    const failed = !SUCCESS_REENTRY.has(reentry ?? "");

    if (accessId && !failed) outcome = "connected";

    if (accessId) {
      const db: Db = serviceClient();
      const { data: existing } = await db
        .from(TABLE.bankConnections)
        .select("id")
        .eq("banksapi_access_id", accessId)
        .maybeSingle();

      if (existing?.id) {
        await db
          .from(TABLE.bankConnections)
          .update({
            status: failed ? "error" : "active",
            last_sync_status: failed ? `callback:${reentry}` : "callback:ok",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        // No matching pending row: either a stale webform or a forged call. Recorded in
        // the logs only, deliberately not inserted.
        console.warn("bank-callback: no bank_connections row for access id", accessId);
        outcome = "error";
      }
    } else {
      console.warn("bank-callback: request carried no access id");
    }
  } catch (e) {
    console.error("bank-callback failed:", e instanceof Error ? e.message : e);
    outcome = "error";
  }

  // Only import when the webform actually produced a usable access.
  if (outcome === "connected") triggerSync();

  // Always redirect: the customer should never be left staring at an error payload.
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: hubRedirect(outcome) },
  });
});
