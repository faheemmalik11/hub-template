// propstack-sync: pulls every Propstack unit into `properties` and links brokers to their accounts.
// Trigger: the `propstack_sync` row of scheduled_jobs. The same work the "Jetzt abgleichen" button does.
import { serviceClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import {
  PROPSTACK_API_URL,
  PROPSTACK_PAGE_SIZE,
  PROPSTACK_SOURCE,
  toSyncedProperty,
  type PropstackUnit,
  type PropstackUnitPage,
} from "../_shared/propstack.ts";
import { looksSealed, openSealed } from "../_shared/sealed.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const CREDENTIAL_NAME = "PROPSTACK_API_KEY";
const TENANT_CHANNEL = "";
const UPSERT_BATCH = 200;
const MAX_PAGES = 200;
const REQUEST_TIMEOUT_MS = 30_000;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function propstackKey(db: Db): Promise<string> {
  const { data, error } = await db
    .from(TABLE.credentials)
    .select("value")
    .eq("channel_key", TENANT_CHANNEL)
    .eq("name", CREDENTIAL_NAME)
    .maybeSingle();
  if (error) throw error;
  const stored = (data as { value: string | null } | null)?.value;
  if (!stored) throw new Error(`${CREDENTIAL_NAME} is not stored in the admin panel`);
  if (!looksSealed(stored)) return stored;
  const tenantKey = Deno.env.get("TENANT_SECRET_KEY");
  if (!tenantKey) throw new Error("TENANT_SECRET_KEY is not set as a secret of this function");
  return await openSealed(stored, tenantKey, TENANT_CHANNEL, CREDENTIAL_NAME);
}

async function fetchUnitPage(apiKey: string, page: number): Promise<PropstackUnitPage> {
  const url = new URL(`${PROPSTACK_API_URL}/units`);
  url.searchParams.set("expand", "1");
  url.searchParams.set("with_meta", "1");
  url.searchParams.set("archived", "-1");
  url.searchParams.set("per", String(PROPSTACK_PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort_by", "id");
  url.searchParams.set("order", "asc");
  const response = await fetch(url, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403 || response.status === 302) {
    throw new Error("Propstack refused the API key");
  }
  if (!response.ok) throw new Error(`Propstack answered ${response.status}`);
  return (await response.json()) as PropstackUnitPage;
}

async function fetchAllUnits(apiKey: string): Promise<PropstackUnit[]> {
  const unitsById = new Map<number, PropstackUnit>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchUnitPage(apiKey, page);
    for (const unit of result.data) unitsById.set(unit.id, unit);
    const total = result.meta?.total_count ?? 0;
    if (result.data.length < PROPSTACK_PAGE_SIZE || unitsById.size >= total) {
      return [...unitsById.values()];
    }
  }
  throw new Error("Propstack returned more pages than expected");
}

async function knownExternalIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db
    .from(TABLE.properties)
    .select("external_id")
    .eq("source", PROPSTACK_SOURCE);
  if (error) throw error;
  return new Set((data as Array<{ external_id: string }>).map((row) => row.external_id));
}

async function sync(db: Db) {
  const units = await fetchAllUnits(await propstackKey(db));
  const alreadyKnown = await knownExternalIds(db);
  const syncedAt = new Date().toISOString();

  for (let start = 0; start < units.length; start += UPSERT_BATCH) {
    const batch = units.slice(start, start + UPSERT_BATCH).map((unit) => ({
      ...toSyncedProperty(unit),
      source: PROPSTACK_SOURCE,
      crm_synced_at: syncedAt,
      updated_at: syncedAt,
    }));
    const { error } = await db.from(TABLE.properties).upsert(batch, { onConflict: "source,external_id" });
    if (error) throw error;
  }

  const linked = await db.rpc("link_brokers_to_users");
  if (linked.error) throw linked.error;
  const opened = await db.rpc("create_deals_for_sold_properties");
  if (opened.error) throw opened.error;

  const created = units.filter((unit) => !alreadyKnown.has(String(unit.id))).length;
  return {
    fetched: units.length,
    created,
    updated: units.length - created,
    linkedBrokers: Number(linked.data ?? 0),
    dealsOpened: Number(opened.data ?? 0),
    syncedAt,
  };
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function syncAndRecord(db: Db) {
  const finished = { last_run_at: new Date().toISOString() };
  try {
    const result = await sync(db);
    await db
      .from(TABLE.scheduledJobs)
      .update({
        ...finished,
        last_status: "ok",
        last_message: `${result.fetched} properties, ${result.linkedBrokers} brokers linked, ${result.dealsOpened} deals opened`,
      })
      .eq("key", "propstack_sync");
    return { ok: true as const, result };
  } catch (error) {
    const message = messageOf(error);
    await db
      .from(TABLE.scheduledJobs)
      .update({ ...finished, last_status: "failed", last_message: message.slice(0, 500) })
      .eq("key", "propstack_sync");
    return { ok: false as const, message };
  }
}

// The cron waits at most 5 seconds, so it gets an answer at once; the Hub's button asks to wait.
Deno.serve(async (request) => {
  const db = serviceClient();
  const body = await request.json().catch(() => ({}));
  if (body?.wait === true) {
    const outcome = await syncAndRecord(db);
    return outcome.ok
      ? jsonResponse(outcome.result)
      : jsonResponse({ error: outcome.message }, 500);
  }
  EdgeRuntime.waitUntil(syncAndRecord(db));
  return jsonResponse({ started: true }, 202);
});
