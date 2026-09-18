// bank-disconnect — detach a bank at BANKSapi and hide everything it delivered.
//
// ORDER MATTERS. BANKSapi first, and nothing local changes if that call fails: a half-detach that
// leaves the access alive is worse than none, because the next hourly sync silently restores
// everything while the operator believes the bank is gone. The accounts live at BANKSapi; our
// tables are a mirror.
//
// NOTHING IS DELETED FROM THE DATABASE. The connection, its accounts, their transactions and its
// sync log are all soft-deleted (migration 20260902170000) and disappear from the app through the
// SELECT policies. A hard delete would take the invoice matches with it
// (invoice_transaction_matches.transaction_id is ON DELETE CASCADE) and leave every invoice those
// matches settled still marked paid, because the paid trigger is set-only and never clears
// bezahlt_am -- the conclusion outliving its own evidence, with no way back.
//
// RECONNECTING THE SAME BANK NEEDS NOTHING FROM HERE. bank-sync already revives a soft-deleted
// account when the bank delivers its IBAN again: the reuse branch clears deleted_at and writes an
// 'account_revived' log line. So the accounts come back with their company, their custom name and
// their on/off flag intact, the newly delivered movements are inserted alongside, and the old
// transactions and log entries stay hidden. A new connection ROW is created for the new access,
// which is correct -- the old access id is dead and cannot be re-used.
//
// is_active is deliberately NOT touched. It records a human decision about one account, and
// resetting it here would silently undo that choice on the next reconnect.
//
// Body: { connectionId: string }
import { getBanksapi } from "../_shared/banksapi.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// "Manage bank connections" on Team & Rollen, the right that describes itself as connecting AND
// disconnecting bank access, and the one bank-connect checks. This used to be bank_accounts.remove,
// the switch for turning a single account off, so the two ends of the same connection were guarded
// by different rights and the Team screen's own wording did not match what the server enforced.
// Switching one account off stays on bank_accounts.remove; this is the whole bank.
const PERMISSION = "page.bankverbindungen";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  try {
    const db = serviceClient() as Db;

    // Checked here rather than left to RLS: this call reaches OUT of the database, and a refusal
    // has to happen before the access is deleted at BANKSapi, not after.
    const caller = await requirePermission(db, callerEmailFromAuthHeader(req), PERMISSION);

    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    if (!connectionId) return jsonResponse({ error: "connectionId is required" }, 400);

    const { data: conn, error: readErr } = await db
      .from(TABLE.bankConnections)
      .select("id, banksapi_access_id, bank_name, provider_name, is_sandbox, deleted_at")
      .eq("id", connectionId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!conn) return jsonResponse({ error: "connection not found" }, 404);

    // ---- 1. BANKSapi. Stop here on failure. -------------------------------------------------
    const api = getBanksapi();
    const accessId: string | null = conn.banksapi_access_id ?? null;
    if (accessId && !accessId.startsWith("mock-")) {
      await api.deleteBankAccess(accessId);
    }

    // ---- 2. Hide the mirror. Four updates, no deletes. ---------------------------------------
    const jetzt = new Date().toISOString();

    const zaehle = async (table: string): Promise<number> => {
      const { count } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("connection_id", connectionId)
        .is("deleted_at", null);
      return count ?? 0;
    };
    const [kontenVorher, umsaetzeVorher, protokollVorher] = await Promise.all([
      zaehle("bank_accounts"),
      zaehle("bank_transactions"),
      zaehle("bank_sync_logs"),
    ]);

    // Transactions first, then their accounts, then the connection. The order does not matter for
    // correctness -- these are updates, not deletes, so no FK can complain -- but it keeps the
    // window in which a concurrent read sees a live account with hidden movements at zero rows
    // rather than at all of them.
    for (const table of ["bank_transactions", "bank_accounts", "bank_sync_logs"]) {
      const { error } = await db
        .from(table)
        .update({ deleted_at: jetzt })
        .eq("connection_id", connectionId)
        .is("deleted_at", null);
      if (error) throw error;
    }

    const { error: connErr } = await db
      .from(TABLE.bankConnections)
      .update({
        deleted_at: jetzt,
        deleted_by: caller.email,
        // The consent really is gone, so the status column agrees with reality rather than still
        // advertising 'active' for an access that no longer exists.
        status: "expired",
        banksapi_access_id: null,
        updated_at: jetzt,
      })
      .eq("id", connectionId);
    if (connErr) throw connErr;

    return jsonResponse({
      ok: true,
      mode: api.mode,
      bank: conn.bank_name ?? conn.provider_name ?? null,
      accountsHidden: kontenVorher,
      transactionsHidden: umsaetzeVorher,
      logsHidden: protokollVorher,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const forbidden = /permission|not active|caller identity/i.test(message);
    return jsonResponse({ error: message }, forbidden ? 403 : 500);
  }
});
