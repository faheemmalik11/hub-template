// Edge-Function-only Propstack access, no frontend twin: shared by propstack-sync and propstack-webhook.
import { looksSealed, openSealed } from "./sealed.ts";
import { TABLE } from "./tables.ts";
import {
  PROPSTACK_API_URL,
  PROPSTACK_PAGE_SIZE,
  PROPSTACK_SOURCE,
  toSyncedProperty,
  type PropstackUnit,
  type PropstackUnitPage,
} from "./propstack.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const TENANT_CHANNEL = "";
const REQUEST_TIMEOUT_MS = 30_000;
const UPSERT_BATCH = 200;

async function readCredential(db: Db, name: string): Promise<string> {
  const { data, error } = await db
    .from(TABLE.credentials)
    .select("value")
    .eq("channel_key", TENANT_CHANNEL)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  const stored = (data as { value: string | null } | null)?.value;
  if (!stored) throw new Error(`${name} is not stored in the admin panel`);
  if (!looksSealed(stored)) return stored;
  const tenantKey = Deno.env.get("TENANT_SECRET_KEY");
  if (!tenantKey) throw new Error("TENANT_SECRET_KEY is not set as a secret of this function");
  return await openSealed(stored, tenantKey, TENANT_CHANNEL, name);
}

export function propstackKey(db: Db): Promise<string> {
  return readCredential(db, "PROPSTACK_API_KEY");
}

export function propstackWebhookSecret(db: Db): Promise<string> {
  return readCredential(db, "PROPSTACK_WEBHOOK_SECRET");
}

async function propstackFetch(apiKey: string, path: string): Promise<Response> {
  const response = await fetch(`${PROPSTACK_API_URL}${path}`, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403 || response.status === 302) {
    throw new Error("Propstack refused the API key");
  }
  if (!response.ok) throw new Error(`Propstack answered ${response.status}`);
  return response;
}

export async function fetchUnitPage(apiKey: string, page: number): Promise<PropstackUnitPage> {
  const params = new URLSearchParams({
    expand: "1",
    with_meta: "1",
    archived: "-1",
    per: String(PROPSTACK_PAGE_SIZE),
    page: String(page),
    sort_by: "id",
    order: "asc",
  });
  const response = await propstackFetch(apiKey, `/units?${params}`);
  return (await response.json()) as PropstackUnitPage;
}

function unwrapUnit(body: unknown): PropstackUnit {
  if (body && typeof body === "object" && !("id" in body) && "data" in body) {
    return (body as { data: PropstackUnit }).data;
  }
  return body as PropstackUnit;
}

// Re-reads the unit fresh instead of trusting the webhook payload shape, which Propstack does not document.
// `new=1` is Propstack's own documented query param for this endpoint (docs.propstack.de/reference/objekte).
export async function fetchUnit(apiKey: string, id: number | string): Promise<PropstackUnit> {
  const response = await propstackFetch(apiKey, `/units/${id}?new=1&expand=1&archived=-1`);
  return unwrapUnit(await response.json());
}

export async function syncUnits(db: Db, units: PropstackUnit[]) {
  const syncedAt = new Date().toISOString();

  for (let start = 0; start < units.length; start += UPSERT_BATCH) {
    const batch = units.slice(start, start + UPSERT_BATCH).map((unit) => ({
      ...toSyncedProperty(unit),
      source: PROPSTACK_SOURCE,
      crm_synced_at: syncedAt,
      updated_at: syncedAt,
    }));
    const { error } = await db
      .from(TABLE.properties)
      .upsert(batch, { onConflict: "source,external_id" });
    if (error) throw error;
  }

  const linked = await db.rpc("link_brokers_to_users");
  if (linked.error) throw linked.error;
  const opened = await db.rpc("create_deals_for_sold_properties");
  if (opened.error) throw opened.error;

  return {
    linkedBrokers: Number(linked.data ?? 0),
    dealsOpened: Number(opened.data ?? 0),
    syncedAt,
  };
}
