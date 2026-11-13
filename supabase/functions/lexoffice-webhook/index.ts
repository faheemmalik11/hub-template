import { serviceClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import { looksSealed, openSealed } from "../_shared/sealed.ts";
import {
  featureIsLive,
  getVoucherPayment,
  type LexofficePayment,
  lexofficeKey,
  paidOnFrom,
} from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const TENANT_CHANNEL = "";
const WEBHOOK_FEATURE_KEY = "lexoffice.webhook";
const SECRET_HEADER = "X-Lexware-Webhook-Secret";
const LEXWARE_API_URL = "https://api.lexware.io/v1";
const PROFILE_TIMEOUT_MS = 15_000;
const HANDLED_EVENT_TYPES = ["payment.changed", "voucher.changed", "voucher.deleted"];
const CANCELLED_NOTE = "Lexware shows this voucher as cancelled.";
const UNIQUE_VIOLATION = "23505";

interface WebhookPayload {
  organizationId?: unknown;
  eventType?: unknown;
  resourceId?: unknown;
  eventDate?: unknown;
}

interface DeliveryKey {
  eventType: string;
  resourceId: string;
  eventDate: string | null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

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

function webhookSecret(db: Db): Promise<string> {
  return readCredential(db, "LEXWARE_WEBHOOK_SECRET");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function cachedOrganizationId(db: Db): Promise<string | null> {
  const { data, error } = await db
    .from(TABLE.lexwareOrganization)
    .select("organization_id")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return (data as { organization_id: string | null } | null)?.organization_id ?? null;
}

async function fetchOrganizationId(db: Db): Promise<string> {
  const apiKey = await lexofficeKey(db);
  const response = await fetch(`${LEXWARE_API_URL}/profile`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Lexware profile answered ${response.status}`);
  const profile = (await response.json()) as { organizationId?: string };
  if (!profile.organizationId) throw new Error("Lexware profile carries no organizationId");
  const { error } = await db
    .from(TABLE.lexwareOrganization)
    .upsert({ id: true, organization_id: profile.organizationId, fetched_at: new Date().toISOString() });
  if (error) throw error;
  return profile.organizationId;
}

async function expectedOrganizationId(db: Db): Promise<string> {
  return (await cachedOrganizationId(db)) ?? (await fetchOrganizationId(db));
}

function readDeliveryKey(payload: WebhookPayload): DeliveryKey | null {
  const { eventType, resourceId, eventDate } = payload;
  if (typeof eventType !== "string" || !eventType) return null;
  if (typeof resourceId !== "string" || !resourceId) return null;
  return {
    eventType,
    resourceId,
    eventDate: typeof eventDate === "string" && eventDate ? eventDate : null,
  };
}

async function claimDelivery(db: Db, key: DeliveryKey): Promise<number | null> {
  const { data, error } = await db
    .from(TABLE.lexwareWebhookEvents)
    .insert({ event_type: key.eventType, resource_id: key.resourceId, event_date: key.eventDate })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) return null;
    throw error;
  }
  return (data as { id: number }).id;
}

async function settle(db: Db, deliveryId: number, outcome: string): Promise<void> {
  const { error } = await db
    .from(TABLE.lexwareWebhookEvents)
    .update({ outcome: outcome.slice(0, 500) })
    .eq("id", deliveryId);
  if (error) console.error("lexoffice-webhook: could not record the outcome:", error.message);
}

interface SyncedDocument {
  id: string;
  amount_gross: number | null;
}

async function documentFor(db: Db, resourceId: string): Promise<SyncedDocument | null> {
  const { data, error } = await db
    .from(TABLE.documents)
    .select("id, amount_gross")
    .eq("accounting_external_id", resourceId)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw error;
  return (data as SyncedDocument[])[0] ?? null;
}

// Mirrors lexoffice-payment-sync: a voucher nobody has paid yet reports its whole gross as open,
// and storing that would read as a part payment in the UI.
function openAmountToStore(document: SyncedDocument, openAmount: number | null): number | null {
  if (openAmount === null) return null;
  if (document.amount_gross !== null && openAmount >= document.amount_gross - 0.01) return null;
  return openAmount;
}

async function updateDocument(db: Db, documentId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from(TABLE.documents).update(patch).eq("id", documentId);
  if (error) throw error;
}

function isNotFound(error: unknown): boolean {
  return messageOf(error).includes("Lexoffice answered 404");
}

async function applyEvent(db: Db, key: DeliveryKey): Promise<string> {
  const document = await documentFor(db, key.resourceId);
  if (!document) return "no matching document";
  const documentId = document.id;

  if (key.eventType === "voucher.deleted") {
    await updateDocument(db, documentId, { lexoffice_sync_error: CANCELLED_NOTE });
    return "cancelled";
  }

  let payment: LexofficePayment;
  try {
    payment = await getVoucherPayment(db, await lexofficeKey(db), key.resourceId);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    await updateDocument(db, documentId, { lexoffice_sync_error: CANCELLED_NOTE });
    return "cancelled";
  }

  if (payment.voucherStatus === "voided") {
    await updateDocument(db, documentId, { lexoffice_sync_error: CANCELLED_NOTE });
    return "cancelled";
  }

  if (payment.voucherStatus === "paid" || payment.voucherStatus === "paidoff") {
    await updateDocument(db, documentId, {
      paid_at: paidOnFrom(payment) ?? new Date().toISOString(),
      paid_source: "lexware",
      lexoffice_open_amount: 0,
    });
    return "paid";
  }

  await updateDocument(db, documentId, {
    lexoffice_open_amount: openAmountToStore(document, payment.openAmount ?? null),
  });
  return "open amount updated";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();

  let secret: string;
  try {
    secret = await webhookSecret(db);
  } catch (error) {
    console.error("lexoffice-webhook: webhook secret not available:", messageOf(error));
    return jsonResponse({ error: "webhook not configured" }, 500);
  }

  const presented = request.headers.get(SECRET_HEADER) ?? "";
  if (!presented || !timingSafeEqual(presented, secret)) {
    console.error("lexoffice-webhook: shared secret mismatch");
    return jsonResponse({ error: "invalid secret" }, 401);
  }

  try {
    if (!(await featureIsLive(db, WEBHOOK_FEATURE_KEY))) {
      return jsonResponse({ error: "webhook is switched off" }, 403);
    }
  } catch (error) {
    console.error("lexoffice-webhook: could not read the feature switch:", messageOf(error));
    return jsonResponse({ error: "webhook not configured" }, 500);
  }

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    console.error("lexoffice-webhook: body is not valid JSON");
    return jsonResponse({ error: "invalid payload" }, 400);
  }

  try {
    const expected = await expectedOrganizationId(db);
    if (payload.organizationId !== expected) {
      console.error("lexoffice-webhook: organization mismatch");
      return jsonResponse({ error: "unknown organization" }, 403);
    }
  } catch (error) {
    console.error("lexoffice-webhook: could not resolve the organization:", messageOf(error));
    return jsonResponse({ error: "webhook not configured" }, 500);
  }

  const key = readDeliveryKey(payload);
  if (!key) return jsonResponse({ error: "missing eventType or resourceId" }, 400);
  if (!HANDLED_EVENT_TYPES.includes(key.eventType)) {
    return jsonResponse({ ignored: key.eventType });
  }

  let deliveryId: number | null;
  try {
    deliveryId = await claimDelivery(db, key);
  } catch (error) {
    console.error("lexoffice-webhook: could not record the delivery:", messageOf(error));
    return jsonResponse({ error: "could not record the delivery" }, 500);
  }
  if (deliveryId === null) return jsonResponse({ duplicate: true });

  // A failed delivery is answered 200 on purpose: the nightly lexoffice_payment_sync job re-reads
  // every unpaid voucher, so a retry storm from Lexware would buy nothing.
  try {
    const outcome = await applyEvent(db, key);
    await settle(db, deliveryId, outcome);
    return jsonResponse({ outcome });
  } catch (error) {
    const message = messageOf(error);
    console.error("lexoffice-webhook: failed for resource", key.resourceId, message);
    await settle(db, deliveryId, `failed: ${message}`);
    return jsonResponse({ outcome: "failed" });
  }
});
