export type CrmFieldKind = "empty" | "simple" | "structured";

export interface CrmField {
  key: string;
  label: string;
  kind: CrmFieldKind;
  value: string | number | boolean | null;
  structured?: unknown;
  entryCount?: number;
}

function isLabelled(value: unknown): value is { label: string; value?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { label?: unknown }).label === "string" &&
    "value" in value
  );
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function describe(key: string, label: string, value: unknown): CrmField {
  if (isBlank(value)) return { key, label, kind: "empty", value: null };
  if (typeof value === "object") {
    const entryCount = Array.isArray(value) ? value.length : Object.keys(value as object).length;
    return { key, label, kind: "structured", value: null, structured: value, entryCount };
  }
  return { key, label, kind: "simple", value: value as string | number | boolean };
}

export function describeCrmFields(record: Record<string, unknown>): CrmField[] {
  return Object.entries(record)
    .map(([key, value]) =>
      isLabelled(value) ? describe(key, value.label, value.value) : describe(key, key, value),
    )
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

/** The CRM fields the property screen shows on top, so the list below them does not repeat them. */
export const HEADLINE_FIELD_KEYS: ReadonlySet<string> = new Set([
  "id",
  "property_status",
  "rs_type",
  "marketing_type",
  "price",
  "sold_price",
  "sold_date",
  "living_space",
  "plot_area",
  "number_of_rooms",
  "courtage",
  "broker",
  "broker_id",
  "relationships",
]);

export function describeRemainingCrmFields(record: Record<string, unknown>): CrmField[] {
  return describeCrmFields(record).filter((field) => !HEADLINE_FIELD_KEYS.has(field.key));
}
