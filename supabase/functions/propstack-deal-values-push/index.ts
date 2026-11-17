import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { TABLE } from "../_shared/tables.ts";
import { propstackKey, updateUnitFields } from "../_shared/propstack-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const PERMISSION = "propstack.deal_values_sync";

interface DealRow {
  id: string;
  purchase_price: number | null;
  notarised_on: string | null;
  property_id: string | null;
}

interface DealSideRow {
  side: string;
  fee_net_rate: number | null;
}

interface PropertyRow {
  id: string;
  external_id: string | null;
}

async function loadDeal(db: Db, dealId: string): Promise<DealRow | null> {
  const { data, error } = await db
    .from(TABLE.deals)
    .select("id, purchase_price, notarised_on, property_id")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw new Error(`deal lookup failed: ${error.message}`);
  return data as DealRow | null;
}

async function loadSides(db: Db, dealId: string): Promise<DealSideRow[]> {
  const { data, error } = await db
    .from(TABLE.dealSides)
    .select("side, fee_net_rate")
    .eq("deal_id", dealId);
  if (error) throw new Error(`deal sides lookup failed: ${error.message}`);
  return data as DealSideRow[];
}

async function loadProperty(db: Db, propertyId: string): Promise<PropertyRow | null> {
  const { data, error } = await db
    .from(TABLE.properties)
    .select("id, external_id")
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
    const dealId = body.deal_id as string | undefined;
    if (!dealId) return jsonResponse({ error: "deal_id is required" }, 400);

    const deal = await loadDeal(db, dealId);
    if (!deal) return jsonResponse({ error: "deal not found" }, 404);
    if (!deal.property_id) return jsonResponse({ skipped: "deal has no property" });

    const property = await loadProperty(db, deal.property_id);
    if (!property?.external_id) {
      return jsonResponse({ skipped: "property has no PropStack unit id" });
    }

    const sides = await loadSides(db, deal.id);
    const buyerRate = sides.find((side) => side.side === "buyer")?.fee_net_rate ?? null;
    const sellerRate = sides.find((side) => side.side === "seller")?.fee_net_rate ?? null;

    const apiKey = await propstackKey(db);
    await updateUnitFields(apiKey, property.external_id, {
      sold_price: deal.purchase_price === null ? null : { value: deal.purchase_price },
      sold_date: deal.notarised_on,
      external_commission_percentage: buyerRate,
      internal_commission_percentage: sellerRate,
    });

    return jsonResponse({ dealId: deal.id, unitId: property.external_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const forbidden = /permission|not active|caller identity/i.test(message);
    if (!forbidden) console.error("propstack-deal-values-push failed:", message);
    return jsonResponse({ error: message }, forbidden ? 403 : 502);
  }
});
