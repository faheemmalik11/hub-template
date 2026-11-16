import { serviceClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import { PROPSTACK_PAGE_SIZE, PROPSTACK_SOURCE, type PropstackUnit } from "../_shared/propstack.ts";
import { fetchUnitPage, propstackKey, syncUnits } from "../_shared/propstack-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const MAX_PAGES = 200;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function fetchAllUnits(apiKey: string): Promise<PropstackUnit[]> {
  const unitsById = new Map<number, PropstackUnit>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchUnitPage(apiKey, page, { by: "id", order: "asc" });
    for (const unit of result.data) unitsById.set(unit.id, unit);
    const total = result.meta?.total_count ?? 0;
    if (result.data.length < PROPSTACK_PAGE_SIZE || unitsById.size >= total) {
      return [...unitsById.values()];
    }
  }
  throw new Error("Propstack returned more pages than expected");
}

async function fetchUnitsChangedSince(apiKey: string, cursor: string): Promise<PropstackUnit[]> {
  const cursorTime = new Date(cursor).getTime();
  const unitsById = new Map<number, PropstackUnit>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchUnitPage(apiKey, page, { by: "updated_at", order: "desc" });
    if (result.data.length === 0) return [...unitsById.values()];

    let sawOlderThanCursor = false;
    for (const unit of result.data) {
      const unitTime = unit.updated_at ? new Date(unit.updated_at).getTime() : NaN;
      if (Number.isFinite(unitTime) && unitTime >= cursorTime) {
        unitsById.set(unit.id, unit);
      } else {
        sawOlderThanCursor = true;
      }
    }
    if (sawOlderThanCursor || result.data.length < PROPSTACK_PAGE_SIZE) {
      return [...unitsById.values()];
    }
  }
  throw new Error("Propstack returned more pages than expected");
}

async function changeCursor(db: Db): Promise<string | null> {
  const { data, error } = await db
    .from(TABLE.properties)
    .select("crm_updated_at")
    .eq("source", PROPSTACK_SOURCE)
    .not("crm_updated_at", "is", null)
    .order("crm_updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { crm_updated_at: string } | null)?.crm_updated_at ?? null;
}

async function knownExternalIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await db
    .from(TABLE.properties)
    .select("external_id")
    .eq("source", PROPSTACK_SOURCE)
    .in("external_id", ids);
  if (error) throw error;
  return new Set((data as Array<{ external_id: string }>).map((row) => row.external_id));
}

async function sync(db: Db, full: boolean) {
  const apiKey = await propstackKey(db);
  const cursor = full ? null : await changeCursor(db);
  const units = cursor === null ? await fetchAllUnits(apiKey) : await fetchUnitsChangedSince(apiKey, cursor);

  const alreadyKnown = await knownExternalIds(db, units.map((unit) => String(unit.id)));
  const result = await syncUnits(db, units);

  const created = units.filter((unit) => !alreadyKnown.has(String(unit.id))).length;
  return {
    mode: cursor === null ? "full" : "incremental",
    fetched: units.length,
    created,
    updated: units.length - created,
    linkedBrokers: result.linkedBrokers,
    dealsOpened: result.dealsOpened,
    syncedAt: result.syncedAt,
  };
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function syncAndRecord(db: Db, full: boolean) {
  const finished = { last_run_at: new Date().toISOString() };
  try {
    const result = await sync(db, full);
    await db
      .from(TABLE.scheduledJobs)
      .update({
        ...finished,
        last_status: "ok",
        last_message:
          `${result.mode} sync: ${result.fetched} properties, ${result.linkedBrokers} brokers linked, ${result.dealsOpened} deals opened`,
      })
      .eq("key", "propstack_sync");
    return { ok: true as const, result };
  } catch (error) {
    const message = messageOf(error);
    const { data: before } = await db
      .from(TABLE.scheduledJobs)
      .select("last_status")
      .eq("key", "propstack_sync")
      .maybeSingle();
    await db
      .from(TABLE.scheduledJobs)
      .update({ ...finished, last_status: "failed", last_message: message.slice(0, 500) })
      .eq("key", "propstack_sync");
    if (before?.last_status !== "failed") {
      await db.rpc("notify_administrators", {
        p_note: `Der CRM-Abgleich ist fehlgeschlagen: ${message.slice(0, 200)}`,
        p_path: "/properties",
        p_source: "sync",
      });
    }
    return { ok: false as const, message };
  }
}

// The cron waits at most 5 seconds, so it gets an answer at once; the Hub's button asks to wait.
Deno.serve(async (request) => {
  const db = serviceClient();
  const body = await request.json().catch(() => ({}));
  const full = body?.full === true;
  if (body?.wait === true) {
    const outcome = await syncAndRecord(db, full);
    return outcome.ok
      ? jsonResponse(outcome.result)
      : jsonResponse({ error: outcome.message }, 500);
  }
  EdgeRuntime.waitUntil(syncAndRecord(db, full));
  return jsonResponse({ started: true }, 202);
});
