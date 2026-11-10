import { serviceClient } from "../_shared/supabase.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { fetchUnit, propstackKey, propstackWebhookSecret, syncUnits } from "../_shared/propstack-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unitIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.id,
    record.unit_id,
    record.object_id,
    (record.data as Record<string, unknown> | undefined)?.id,
    (record.unit as Record<string, unknown> | undefined)?.id,
    (record.property as Record<string, unknown> | undefined)?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" || typeof candidate === "string") return String(candidate);
  }
  return null;
}

function unitIdFromQuery(url: URL): string | null {
  for (const key of ["id", "unit_id", "object_id"]) {
    const value = url.searchParams.get(key);
    if (value) return value;
  }
  return null;
}

function extractUnitId(payload: unknown, url: URL): string | null {
  return unitIdFromPayload(payload) ?? unitIdFromQuery(url);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();
  const rawBody = await request.text();
  const signature = request.headers.get("X-Propstack-Signature") ?? "";

  let secret: string;
  try {
    secret = await propstackWebhookSecret(db);
  } catch (error) {
    console.error("propstack-webhook: webhook secret not available:", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "webhook not configured" }, 500);
  }

  const expectedSignature = await hmacSha256Hex(secret, rawBody);
  if (!signature || !timingSafeEqual(signature, expectedSignature)) {
    console.error("propstack-webhook: signature mismatch");
    return jsonResponse({ error: "invalid signature" }, 401);
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    console.error("propstack-webhook: body is not valid JSON, falling back to the query string");
  }

  const unitId = extractUnitId(payload, new URL(request.url));
  if (!unitId) {
    console.error("propstack-webhook: no unit id in payload");
    return jsonResponse({ error: "missing unit id" }, 400);
  }

  try {
    const unit = await fetchUnit(await propstackKey(db), unitId);
    const result = await syncUnits(db, [unit]);
    return jsonResponse({ unitId, ...result });
  } catch (error) {
    console.error("propstack-webhook: sync failed for unit", unitId, error instanceof Error ? error.message : error);
    return jsonResponse({ error: "sync failed" }, 502);
  }
});
