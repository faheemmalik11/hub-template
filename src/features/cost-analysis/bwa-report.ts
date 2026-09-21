// A READING ORDER for the P&L the skeleton already computed. Presentation only.
//
// `bwa-skeleton.ts` reproduces DATEV Form 01 line for line, because the client compares it against
// his real BWA. That is the right structure to COMPUTE in and the wrong one to READ: 26 flat rows,
// six of them subtotals, with no visual grouping to say which cost lines roll into which result.
//
// This module groups those same rows into the three questions the screen exists to answer, in
// order: what is my result, where are the costs going, what makes them up. It performs NO
// arithmetic of its own beyond summing rows the skeleton already produced, and every subtotal it
// shows is read straight off the skeleton's own subtotal row rather than recomputed. Change a
// number here and it will disagree with the DATEV structure; that is what makes this file safe.

import { COSTANALYSIS_SKELETON, type CostAnalysisSkeletonComputed } from "./adapter";

/** Rows above the operating result that are INCOME. Everything the result adds. */
const INCOME_KEYS = [
  "revenue",
  "change_in_inventory",
  "capitalized_own_work",
  "other_op_income",
] as const;

/** The one cost line that sits above gross profit. DATEV stops gross profit right after it. */
export const DIRECT_COST_KEYS = ["cogs_material"] as const;

/**
 * Every cost line between gross profit and the operating result, in DATEV Form 01 order.
 *
 * This order is NOT a display preference. It is the order of Philipp's real value statement and of
 * the account mapping (bwa-mapping-imko.xlsx, column `bwa_zeile`), and he reads this table against
 * that document line by line. An earlier pass sorted these biggest-first, which looks tidier and
 * makes the table stop matching the paper it is checked against.
 */
export const OPERATING_COST_KEYS = [
  "personnel",
  "occupancy",
  "business_tax",
  "insurance",
  "vehicle",
  "advertising_travel",
  "cogs_sold",
  "depreciation",
  "repair_maintenance",
  "other_costs",
] as const;

/**
 * Below the operating result: interest, neutral items and taxes.
 *
 * The redesign ends the report at the operating result, which is the last figure that describes the
 * business itself. These rows are not dropped: the group renders whenever any of them carries an
 * amount, and always in "show all categories". Silently hiding a non-zero tax line would be a
 * change to what the screen reports, not to how it looks.
 */
const BELOW_RESULT_KEYS = [
  "interest_expense",
  "other_neutral_expense",
  "interest_income",
  "other_neutral_income",
  "tax_income_earnings",
] as const;

export type ReportRowKind =
  /** A named group total, shown only when the group has more than one line under it. */
  | "group"
  /** A single skeleton line. Indented when it sits under a group row. */
  | "line"
  /** A figure the reader is meant to stop at, read off a skeleton subtotal. */
  | "result";

/** The arithmetic sign in front of a row, so the column reads as a sum rather than as a list. */
export type ReportOperator = "plus" | "minus" | "equals";

export interface CostAnalysisReportRow {
  /** Skeleton row key, or a synthetic group id. Drilldown keys off this. */
  key: string;
  kind: ReportRowKind;
  /** i18n key suffix under `reports.zeile.` */
  labelKey: string;
  /**
   * What the row shows in the amount column.
   *
   * A cost row carries its POSITIVE magnitude and lets the `minus` operator say the direction, the
   * way any handwritten calculation does. Signing it as well ("− −135,00 €") double-negates it, and
   * showing it unsigned with no operator asks the reader to know which lines get subtracted. A
   * result row keeps its real signed value, because that is the figure itself and not a step.
   */
  amount: number;
  /** Rendered in a narrow gutter before the label. */
  operator?: ReportOperator;
  /** Draw the calculation rule above this row: everything above it adds up to it. */
  rule?: boolean;
  /** One short line under a result, saying in plain words what it is. */
  caption?: boolean;
  /** Lines only. Opens the receipts behind the figure. */
  drilldownKey?: string;
  /** Indented under a group row. */
  child?: boolean;
  /** The final result line, given the heaviest weight. */
  emphasis?: boolean;
}

export interface CostAnalysisReport {
  rows: CostAnalysisReportRow[];
  /** The three summary figures. `revenue - totalCosts === operatingResult`, exactly. */
  revenue: number;
  totalCosts: number;
  operatingResult: number;
  /** Cost lines with an amount, biggest first, for the breakdown chart. Positive magnitudes. */
}

const SIGN_BY_KEY = new Map(COSTANALYSIS_SKELETON.map((r) => [r.key, r.sign]));

/**
 * Group the computed skeleton into the report.
 *
 * `alleZeilen` keeps every line including the zero ones; false drops lines that are zero in BOTH
 * the current and the comparison period, so a line that just fell to zero still shows its movement.
 */
export function buildCostAnalysisReport(
  computed: CostAnalysisSkeletonComputed,
  opts: { allRows: boolean; compareAmountFor?: (key: string) => number },
): CostAnalysisReport {
  const byKey = new Map(computed.rows.map((r) => [r.key, r]));
  const raw = (key: string) => byKey.get(key)?.amount ?? 0;
  // The signed contribution, the way the skeleton itself applies it to the running total.
  const signed = (key: string) => {
    const a = raw(key);
    return a === 0 ? 0 : (SIGN_BY_KEY.get(key) ?? 1) * a;
  };
  const compare = (key: string) => opts.compareAmountFor?.(key) ?? 0;
  const keep = (key: string) => opts.allRows || raw(key) !== 0 || compare(key) !== 0;

  const sum = (keys: readonly string[]) => keys.reduce((s, k) => s + signed(k), 0);

  const revenue = sum(INCOME_KEYS);
  // Positive magnitude: "Total costs" is a cost, and the summary prints its own minus sign.
  const totalCosts = -sum([...DIRECT_COST_KEYS, ...OPERATING_COST_KEYS]);
  // Straight off the skeleton's own subtotal, never recomputed from the groups above.
  const operatingResult = raw("operating_result");

  const rows: CostAnalysisReportRow[] = [];

  // "Show all categories" is not a longer version of the compact report — it is the DATEV Form 01
  // value statement, every line, in its own order, including the two lines the compact view has no
  // room for:
  //
  //   Gesamtleistung          revenue + change in inventory + capitalized own work
  //   Betrieblicher Rohertrag gross profit + other operating income
  //
  // Those two are separate subtotals and must never be merged. Gross profit stops BEFORE other
  // operating income; whoever pulls them together still lands on the right operating result but
  // reports a wrong Rohertrag, which is precisely the intermediate figure the client checks
  // against his own BWA. So the full view renders the skeleton verbatim rather than re-deriving it.
  if (opts.allRows) {
    for (const row of COSTANALYSIS_SKELETON) {
      const subtotal = row.kind === "subtotal";
      rows.push({
        key: row.key,
        kind: subtotal ? "result" : "line",
        labelKey: row.key,
        // A subtotal carries the running total the skeleton computed; a line carries its own
        // magnitude and lets the operator say the direction.
        amount: raw(row.key),
        operator: subtotal ? "equals" : row.sign === -1 ? "minus" : "plus",
        rule: subtotal,
        drilldownKey: subtotal ? undefined : row.key,
      });
    }
    return { rows, revenue, totalCosts, operatingResult };
  }

  /**
   * One cost block: the lines of a group, as subtraction steps.
   *
   * With a single line the group heading and the line carry the SAME label and the SAME number, one
   * directly above the other, which reads as the figure having been printed twice. So a one-line
   * block collapses to just that line; a group total only earns its row once there is more than one
   * thing to total.
   */
  const pushCost = (groupKey: string, keys: readonly string[]) => {
    const lines = keys.filter(keep);
    if (lines.length === 0) return;
    if (lines.length === 1) {
      const k = lines[0];
      rows.push({
        key: k,
        kind: "line",
        labelKey: k,
        amount: raw(k),
        operator: "minus",
        drilldownKey: k,
      });
      return;
    }
    rows.push({
      key: groupKey,
      kind: "group",
      labelKey: groupKey,
      amount: -sum(keys),
      operator: "minus",
    });
    for (const k of lines) {
      rows.push({
        key: k,
        kind: "line",
        labelKey: k,
        amount: raw(k),
        drilldownKey: k,
        child: true,
      });
    }
  };

  // Revenue always opens the calculation, even at zero: a reader looking at an all-negative result
  // has to see that nothing came in. Its own detail lines appear only if more than one of them
  // carries an amount, for the same reason a one-line cost block collapses.
  const revenueRows = INCOME_KEYS.filter(keep);
  rows.push({ key: "group_revenue", kind: "group", labelKey: "group_revenue", amount: revenue });
  if (revenueRows.length > 1) {
    for (const k of revenueRows) {
      rows.push({
        key: k,
        kind: "line",
        labelKey: k,
        amount: signed(k),
        drilldownKey: k,
        child: true,
      });
    }
  }

  pushCost("group_direct_costs", DIRECT_COST_KEYS);
  rows.push({
    key: "gross_profit",
    kind: "result",
    labelKey: "gross_profit",
    amount: raw("gross_profit"),
    operator: "equals",
    rule: true,
    caption: true,
  });

  pushCost("group_operating_costs", OPERATING_COST_KEYS);
  rows.push({
    key: "operating_result",
    kind: "result",
    labelKey: "operating_result",
    amount: operatingResult,
    operator: "equals",
    rule: true,
    caption: true,
    emphasis: true,
  });

  // Only when there is something below the line, or when the reader asked for everything. An empty
  // "interest, neutral items and taxes" section is an accounting heading with nothing under it.
  if (opts.allRows || BELOW_RESULT_KEYS.some((k) => raw(k) !== 0 || compare(k) !== 0)) {
    pushCost("group_below_result", BELOW_RESULT_KEYS);
    // And the preliminary result only when it is actually a different figure. With every line
    // between the two at zero it repeats the operating result verbatim, and two identical totals
    // one under the other read as a mistake rather than as a second result.
    if (raw("preliminary_result") !== operatingResult) {
      rows.push({
        key: "preliminary_result",
        kind: "result",
        labelKey: "preliminary_result",
        amount: raw("preliminary_result"),
        operator: "equals",
        rule: true,
      });
    }
  }

  return { rows, revenue, totalCosts, operatingResult };
}
