import { COMPANIES, sampleId } from "../shared";

/**
 * The cost analysis reads across everything else, so its fixture is a result rather than rows: the
 * figures a period produces once the documents, bookings and categories above are counted.
 *
 * The unassigned line is deliberate. A report that quietly drops what it could not categorise
 * reads as complete and is wrong by exactly that amount.
 */
export const costAnalysis = {
  period: { from: "2026-07-01", to: "2026-09-30" },
  companyId: COMPANIES[0].id,
  lines: [
    { categoryId: sampleId(60, 1), block: "einnahmen", label: "Mieteinnahmen", amount: 24_600 },
    { categoryId: sampleId(60, 2), block: "kosten", label: "Strom", amount: -1_480.2 },
    { categoryId: sampleId(60, 3), block: "kosten", label: "Instandhaltung", amount: -3_940.6 },
    { categoryId: sampleId(60, 9), block: "neutral", label: "Nicht zugeordnet", amount: -212.4 },
  ],
  totals: { income: 24_600, cost: -5_633.2, result: 18_966.8 },
};
