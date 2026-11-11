import { serviceClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function syncAndRecord(db: Db) {
  const finished = { last_run_at: new Date().toISOString() };
  try {
    const { data, error } = await db.rpc("notify_missing_payment_dates");
    if (error) throw error;
    const reminded = (data as number) ?? 0;
    await db
      .from(TABLE.scheduledJobs)
      .update({ ...finished, last_status: "ok", last_message: `${reminded} deals reminded` })
      .eq("key", "payment_due_date_reminder");
    return { ok: true as const, reminded };
  } catch (error) {
    const message = messageOf(error);
    await db
      .from(TABLE.scheduledJobs)
      .update({ ...finished, last_status: "failed", last_message: message.slice(0, 500) })
      .eq("key", "payment_due_date_reminder");
    return { ok: false as const, message };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok");
  const db = serviceClient();
  const outcome = await syncAndRecord(db);
  return outcome.ok
    ? jsonResponse({ reminded: outcome.reminded })
    : jsonResponse({ error: outcome.message }, 500);
});
