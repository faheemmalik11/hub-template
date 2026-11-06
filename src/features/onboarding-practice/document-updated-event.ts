import type { Document } from "@/lib/data/types";

const AMOUNT_FIELDS = ["amount_net", "vat_amount", "amount_gross"] as const;
const PASSTHROUGH_FIELDS = ["company_code", "property_code"] as const;
const ROUNDING_TOLERANCE = 0.015;

export function documentUpdatedEventData(
  before: Pick<Document, "amount_net" | "vat_amount" | "amount_gross">,
  changes: Partial<Document>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const field of PASSTHROUGH_FIELDS) {
    if (field in changes) data[field] = changes[field];
  }

  if (!AMOUNT_FIELDS.some((field) => field in changes)) return data;

  const valueOf = (field: (typeof AMOUNT_FIELDS)[number]) =>
    field in changes ? (changes[field] ?? null) : (before[field] ?? null);
  const net = valueOf("amount_net");
  const vat = valueOf("vat_amount");
  const gross = valueOf("amount_gross");
  data.amount_net = net;
  data.vat_amount = vat;
  data.amount_gross = gross;
  data.amounts_add_up =
    net !== null &&
    vat !== null &&
    gross !== null &&
    Math.abs(net + vat - gross) < ROUNDING_TOLERANCE;
  return data;
}
