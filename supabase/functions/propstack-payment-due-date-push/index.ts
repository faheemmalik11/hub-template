import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { TABLE } from "../_shared/tables.ts";
import { propstackKey, updateUnitCustomFields } from "../_shared/propstack-client.ts";
import {
  PROPSTACK_PAYMENT_DUE_DATE_FIELD,
  PROPSTACK_PAYMENT_DUE_DATE_NOTE_FIELD,
} from "../_shared/propstack.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const PERMISSION = "propstack.payment_due_date_sync";

interface PropertyRow {
  id: string;
  external_id: string | null;
  payment_due_date: string | null;
  payment_due_date_note: string | null;
}

async function loadProperty(db: Db, propertyId: string): Promise<PropertyRow | null> {
  const { data, error } = await db
    .from(TABLE.properties)
    .select("id, external_id, payment_due_date, payment_due_date_note")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(`property lookup failed: ${error.message}`);
  return data as PropertyRow | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db: Db = serviceClient();

  try {
    const callerEmail = callerEmailFromAuthHeader(req);
    await requirePermission(db, callerEmail, PERMISSION);

    const body = await req.json().catch(() => ({}));
    const propertyId = body.property_id as string | undefined;
    if (!propertyId) return jsonResponse({ error: "property_id is required" }, 400);

    const property = await loadProperty(db, propertyId);
    if (!property) return jsonResponse({ error: "property not found" }, 404);
    if (!property.external_id) {
      return jsonResponse({ skipped: "property has no PropStack unit id" });
    }

    const apiKey = await propstackKey(db);
    await updateUnitCustomFields(apiKey, property.external_id, {
      [PROPSTACK_PAYMENT_DUE_DATE_FIELD]: property.payment_due_date,
      [PROPSTACK_PAYMENT_DUE_DATE_NOTE_FIELD]: property.payment_due_date_note,
    });

    return jsonResponse({ propertyId: property.id, unitId: property.external_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const forbidden = /permission|not active|caller identity/i.test(message);
    if (!forbidden) console.error("propstack-payment-due-date-push failed:", message);
    return jsonResponse({ error: message }, forbidden ? 403 : 502);
  }
});
