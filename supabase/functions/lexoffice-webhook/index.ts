import { serviceClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import {
  applyLexwarePayment,
  featureIsLive,
  lexofficeKey,
  payableRecordFor,
} from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const WEBHOOK_FEATURE_KEY = "lexoffice.webhook";
const SIGNATURE_HEADER = "X-Lxo-Signature";
// Lexware's own payload carries four short fields and runs under 200 bytes; this only bounds how
// much an untrusted sender hitting this public URL can make the function hold in memory.
const MAX_BODY_BYTES = 16 * 1024;
const LEXWARE_API_URL = "https://api.lexware.io/v1";
const PROFILE_TIMEOUT_MS = 15_000;
const HANDLED_EVENT_TYPES = ["payment.changed", "voucher.changed", "voucher.deleted"];
const CANCELLED_NOTE = "Lexware shows this voucher as cancelled.";
const UNIQUE_VIOLATION = "23505";

// Lexware's own published signing key, the same for every integration -- not a tenant secret, so
// it lives in code rather than the credentials table. https://developers.lexware.io/docs/#event-subscriptions-endpoint-verify-authenticity
const LEXWARE_SIGNING_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAtCkZXZqT2zFRmA83KsBC
tQSv9t+AaWiZpRWvzE4wiQEh0aHzNYkT/DlP419pngqoLxnqW9SsgWfKOG3utoEV
z+Lru9odZntW/n/yaRK3f0AcMtuWs/Z1PZ4BbN/RlFYyqlPg0VfuAvZMAa+J9WAl
Fuy0T4Y0EdO0d+EL8BpzSLqj3XLI+YuK4hUhlTOxHmdDtNUkugnT9b9khb+oPDmB
3yxRP6Rmo2qo6waSc+pihCdOiZKzwA4fA1HT8DM54OaNQ4qd9NRf5uECijFlpQu6
vZdW7Z+LZ8HTgGQVSsJdCzUtM1wiWOERrHvd8IpBMvUAvGM/qaJnAmwsEr4J/El4
yCmur8wwYBtSUH0Xue42YysdmSS0pOMMUAAvr70HQMDHagYkErMtu6FAyAmPz8p/
tAqJJpwAhxITbnc5WsmZOu0Ke255nXQ/2Go1TKv+45mSb7RLsvpmhVZ4nFByFt24
vG6IwNReuLhJJL468jrdTpxyZRn0QqkxiQV7jDd9Dp1NVd/W3+n86Aos9LnJa+ut
kN+jOOWmJdJjnQetJlbDVg3ex+XHVmCjiRYggCGPlpXVJwdEUNGzxhPGKjxmeiQT
ahwFA9iHtwBw7yK5VfM/hA+JeF2FXYhTdehfClAQt1YCYXkgUEFxm9idRdBoCY6U
bmFUXQLdi7tZyDor8Rxoq2MCAwEAAQ==
-----END PUBLIC KEY-----`;

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

// Reads the body under a hard cap rather than trusting Content-Length -- a sender can omit that
// header (chunked transfer) or lie about it, so the running total is what actually enforces this.
// Returns null when the body exceeds maxBytes, "" when there is no body at all.
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) return null;

  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let lexwareSigningKey: Promise<CryptoKey> | null = null;

function importLexwareSigningKey(): Promise<CryptoKey> {
  lexwareSigningKey ??= crypto.subtle.importKey(
    "spki",
    pemToDer(LEXWARE_SIGNING_PUBLIC_KEY_PEM),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
    false,
    ["verify"],
  );
  return lexwareSigningKey;
}

// Verifies against the EXACT bytes Lexware sent, never a reparsed/reserialized copy of the JSON --
// re-serializing risks disagreeing with Lexware on whitespace or key order and failing a signature
// that was genuinely theirs.
async function verifyLexwareSignature(rawBody: string, signatureBase64: string): Promise<boolean> {
  if (!signatureBase64) return false;
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    const binary = atob(signatureBase64);
    signatureBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) signatureBytes[i] = binary.charCodeAt(i);
  } catch {
    return false;
  }
  const key = await importLexwareSigningKey();
  return await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    signatureBytes,
    new TextEncoder().encode(rawBody),
  );
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

async function markCancelled(db: Db, table: string, id: string): Promise<void> {
  const { error } = await db.from(table).update({ lexoffice_sync_error: CANCELLED_NOTE }).eq("id", id);
  if (error) throw error;
}

// Covers both documents (incoming invoices) and outgoing_invoices (commission invoices) -- the
// same record lookup and payment decision the polling lexoffice-payment-sync uses, so a webhook
// delivery and the next cron run can never disagree about what a voucher's status means.
async function applyEvent(db: Db, key: DeliveryKey): Promise<string> {
  const record = await payableRecordFor(db, key.resourceId);
  if (!record) return "no matching record";
  const table = record.table === "documents" ? TABLE.documents : TABLE.outgoingInvoices;

  if (key.eventType === "voucher.deleted") {
    await markCancelled(db, table, record.id);
    return "cancelled";
  }

  const outcome = await applyLexwarePayment(db, await lexofficeKey(db), record, key.resourceId);
  if (outcome === "voided") return "cancelled";
  if (outcome === "paid") return "paid";
  return "open amount updated";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();

  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    console.error("lexoffice-webhook: body exceeds the size limit");
    return jsonResponse({ error: "payload too large" }, 413);
  }
  const signature = request.headers.get(SIGNATURE_HEADER) ?? "";
  let signatureValid: boolean;
  try {
    signatureValid = await verifyLexwareSignature(rawBody, signature);
  } catch (error) {
    console.error("lexoffice-webhook: could not verify the signature:", messageOf(error));
    return jsonResponse({ error: "webhook not configured" }, 500);
  }
  if (!signatureValid) {
    console.error("lexoffice-webhook: signature invalid");
    return jsonResponse({ error: "invalid signature" }, 401);
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
    payload = JSON.parse(rawBody) as WebhookPayload;
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
