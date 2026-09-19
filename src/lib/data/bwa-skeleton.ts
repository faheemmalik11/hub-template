// The Cost Analysis / BWA line structure (Briefing Screen 10), reproduced exactly from Philipp's
// real DATEV value statement (Form 01) — the client explicitly warns not to reorder or merge this,
// especially the two subtotals (Gross Profit, Operating Gross Profit), since he compares Gross
// Profit specifically against his real DATEV BWA.
//
// Keyed by bwa_categories.code (migration 0030), the stable stored identifier — not report_line,
// which is a free-text label that could be renamed without this structure needing to change.
//
// Pure, no I/O. The caller (src/routes/auswertungen/index.tsx) is responsible for everything that
// happens BEFORE this module sees a line item: filtering to matched pairs only, excluding NOT_PNL
// categories from the flow (they still get counted here, but routed to excludedNotPnlAmount, never
// into a skeleton row), resolving the net/gross-where-not-deductible amount, and picking the right
// booking date per company. This module only groups and sums what it's handed.

import type { BwaCategory } from "./types";

export type BwaSkeletonRowKind = "line" | "subtotal";

export interface BwaSkeletonRow {
  key: string;
  kind: BwaSkeletonRowKind;
  // Sign a "line" row's amount contributes to the running total. Subtotal rows carry no own
  // amount input (categoryCodes is empty) — their value is the running total up to that point.
  sign: 1 | -1;
  categoryCodes: readonly string[];
}

// bwa_categories.code values that never appear in BWA_SKELETON below and must not silently vanish:
//   UNASSIGNED (is_catchall)  -> routed to unassignedAmount
//   NOT_PNL    (excluded_from_profit_and_loss) -> routed to excludedNotPnlAmount
// Both are asserted absent from every skeleton row by the dev-time check right below the array, so
// a future edit to BWA_SKELETON can't accidentally fold either into a real P&L line.
const SPECIAL_CASE_CODES = ["UNASSIGNED", "NOT_PNL"] as const;

export const BWA_SKELETON: readonly BwaSkeletonRow[] = [
  { key: "revenue", kind: "line", sign: 1, categoryCodes: ["REVENUE"] },
  // "Usually 0" per the briefing — no bwa_categories code maps to either today. Modeled as
  // fixed-zero rows rather than omitted, so the line structure still matches DATEV's Form 01
  // exactly if either ever becomes non-zero later.
  { key: "change_in_inventory", kind: "line", sign: 1, categoryCodes: [] },
  { key: "capitalized_own_work", kind: "line", sign: 1, categoryCodes: [] },
  { key: "total_output", kind: "subtotal", sign: 1, categoryCodes: [] },
  { key: "cogs_material", kind: "line", sign: -1, categoryCodes: ["COGS_MATERIAL"] },
  // Subtotal #1 — Gross Profit. Stops here; does NOT continue into other operating income.
  { key: "gross_profit", kind: "subtotal", sign: 1, categoryCodes: [] },
  { key: "other_op_income", kind: "line", sign: 1, categoryCodes: ["OTHER_OP_INCOME"] },
  // Subtotal #2 — Operating Gross Profit. A separate figure from Gross Profit above, never merged.
  { key: "operating_gross_profit", kind: "subtotal", sign: 1, categoryCodes: [] },
  { key: "personnel", kind: "line", sign: -1, categoryCodes: ["PERSONNEL"] },
  { key: "occupancy", kind: "line", sign: -1, categoryCodes: ["OCCUPANCY"] },
  { key: "business_tax", kind: "line", sign: -1, categoryCodes: ["BUSINESS_TAX"] },
  { key: "insurance", kind: "line", sign: -1, categoryCodes: ["INSURANCE"] },
  { key: "vehicle", kind: "line", sign: -1, categoryCodes: ["VEHICLE"] },
  { key: "advertising_travel", kind: "line", sign: -1, categoryCodes: ["ADVERTISING_TRAVEL"] },
  { key: "cogs_sold", kind: "line", sign: -1, categoryCodes: ["COGS_SOLD"] },
  { key: "depreciation", kind: "line", sign: -1, categoryCodes: ["DEPRECIATION"] },
  { key: "repair_maintenance", kind: "line", sign: -1, categoryCodes: ["REPAIR_MAINTENANCE"] },
  { key: "other_costs", kind: "line", sign: -1, categoryCodes: ["OTHER_COSTS"] },
  { key: "operating_result", kind: "subtotal", sign: 1, categoryCodes: [] },
  { key: "interest_expense", kind: "line", sign: -1, categoryCodes: ["INTEREST_EXPENSE"] },
  {
    key: "other_neutral_expense",
    kind: "line",
    sign: -1,
    categoryCodes: ["OTHER_NEUTRAL_EXPENSE"],
  },
  { key: "interest_income", kind: "line", sign: 1, categoryCodes: ["INTEREST_INCOME"] },
  { key: "other_neutral_income", kind: "line", sign: 1, categoryCodes: ["OTHER_NEUTRAL_INCOME"] },
  { key: "result_before_taxes", kind: "subtotal", sign: 1, categoryCodes: [] },
  { key: "tax_income_earnings", kind: "line", sign: -1, categoryCodes: ["TAX_INCOME_EARNINGS"] },
  { key: "preliminary_result", kind: "subtotal", sign: 1, categoryCodes: [] },
] as const;

if (import.meta.env.DEV) {
  const seen = new Set<string>();
  for (const row of BWA_SKELETON) {
    for (const code of row.categoryCodes) {
      if (SPECIAL_CASE_CODES.includes(code as (typeof SPECIAL_CASE_CODES)[number])) {
        throw new Error(`bwa-skeleton: ${code} must never appear in a P&L row (row "${row.key}")`);
      }
      if (seen.has(code)) {
        throw new Error(`bwa-skeleton: category code ${code} is mapped to more than one row`);
      }
      seen.add(code);
    }
  }
}

export interface BwaLineInput {
  categoryCode: string | null;
  amount: number;
  belegId?: string;
  manualBookingSourceId?: string;
}

export interface BwaLineItem {
  belegId?: string;
  manualBookingSourceId?: string;
  amount: number;
}

export interface BwaSkeletonComputedRow {
  key: string;
  kind: BwaSkeletonRowKind;
  amount: number;
  items: BwaLineItem[];
}

export interface BwaSkeletonComputed {
  rows: BwaSkeletonComputedRow[];
  unassignedAmount: number;
  unassignedItems: BwaLineItem[];
  excludedNotPnlAmount: number;
  excludedNotPnlItems: BwaLineItem[];
}

const CODE_TO_ROW_KEY = new Map<string, string>(
  BWA_SKELETON.flatMap((row) => row.categoryCodes.map((code) => [code, row.key] as const)),
);

export const UNASSIGNED_ROW_KEY = "unassigned";
export const NOT_PNL_ROW_KEY = "not_pnl";

// Where a single item routes to: a real skeleton row key, or one of the two special-case buckets
// (never a real row, per the briefing's "must be visible, never silently dropped" rule for both).
// Exported so a drilldown UI can group its own richer per-item data (e.g. by fine category, then
// receipt) using the exact same routing decision computeBwaSkeleton makes, without duplicating it.
export function rowKeyForCategoryCode(categoryCode: string | null): string {
  if (categoryCode === "NOT_PNL") return NOT_PNL_ROW_KEY;
  if (categoryCode == null || categoryCode === "UNASSIGNED") return UNASSIGNED_ROW_KEY;
  // A category code with no skeleton mapping (shouldn't happen for an active coarse category, but
  // a fine tag whose parent was deleted/reassigned could theoretically produce one) — treated the
  // same as "not yet categorized" rather than silently dropped.
  return CODE_TO_ROW_KEY.get(categoryCode) ?? UNASSIGNED_ROW_KEY;
}

// Groups already-filtered, already-net-adjusted, already-matched line items into the skeleton.
// Does no filtering itself (that's the caller's job — see the file header) and never mutates the
// static BWA_SKELETON array; each call returns a fresh computed structure.
const SIGN_BY_ROW_KEY = new Map<string, 1 | -1>(BWA_SKELETON.map((row) => [row.key, row.sign]));

// The direction a row contributes to the running total. A cost line sums to a POSITIVE magnitude
// here and is subtracted by its sign, which is invisible to anyone not used to reading the form:
// on screen "Gesamtleistung 0,00 €" above "Materialaufwand 135,00 €" above "Rohertrag -135,00 €"
// reads as arithmetic that does not work. A UI can use this to render the amount with the sign it
// actually contributes; the stored magnitude is unchanged, so a line still matches DATEV digit for
// digit. Subtotals carry sign 1 and already hold a signed running total.
export function signForRowKey(rowKey: string): 1 | -1 {
  return SIGN_BY_ROW_KEY.get(rowKey) ?? 1;
}

export function computeBwaSkeleton(items: BwaLineInput[]): BwaSkeletonComputed {
  const amountByRowKey = new Map<string, number>();
  const itemsByRowKey = new Map<string, BwaLineItem[]>();
  let unassignedAmount = 0;
  const unassignedItems: BwaLineItem[] = [];
  let excludedNotPnlAmount = 0;
  const excludedNotPnlItems: BwaLineItem[] = [];

  for (const item of items) {
    const lineItem: BwaLineItem = {
      belegId: item.belegId,
      manualBookingSourceId: item.manualBookingSourceId,
      amount: item.amount,
    };
    const rowKey = rowKeyForCategoryCode(item.categoryCode);
    if (rowKey === NOT_PNL_ROW_KEY) {
      excludedNotPnlAmount += item.amount;
      excludedNotPnlItems.push(lineItem);
      continue;
    }
    if (rowKey === UNASSIGNED_ROW_KEY) {
      unassignedAmount += item.amount;
      unassignedItems.push(lineItem);
      continue;
    }
    amountByRowKey.set(rowKey, (amountByRowKey.get(rowKey) ?? 0) + item.amount);
    const list = itemsByRowKey.get(rowKey) ?? [];
    list.push(lineItem);
    itemsByRowKey.set(rowKey, list);
  }

  const rows: BwaSkeletonComputedRow[] = [];
  let runningTotal = 0;
  for (const row of BWA_SKELETON) {
    if (row.kind === "line") {
      const amount = amountByRowKey.get(row.key) ?? 0;
      runningTotal += row.sign * amount;
      rows.push({ key: row.key, kind: "line", amount, items: itemsByRowKey.get(row.key) ?? [] });
    } else {
      rows.push({ key: row.key, kind: "subtotal", amount: runningTotal, items: [] });
    }
  }

  return { rows, unassignedAmount, unassignedItems, excludedNotPnlAmount, excludedNotPnlItems };
}

// The COARSE category code a category (coarse or fine) rolls up to — what BWA_SKELETON's
// categoryCodes actually key on (fine tags share their parent's report_line, not their own code).
// Shared by every caller that turns a beleg/manual-booking category_id into a BwaLineInput
// categoryCode (src/routes/auswertungen/index.tsx and the dashboard's Gross Profit summary),
// so the coarse/fine rollup rule can't drift between the two.
export function coarseCategoryCode(
  categoryId: string | null,
  categoriesById: Map<string, BwaCategory>,
): string | null {
  if (!categoryId) return null;
  const cat = categoriesById.get(categoryId);
  if (!cat) return null;
  if (!cat.parent_id) return cat.code;
  return categoriesById.get(cat.parent_id)?.code ?? cat.code;
}
