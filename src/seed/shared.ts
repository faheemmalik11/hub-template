/**
 * The parts every fixture shares, so one page's sample data reads like the next one's.
 *
 * Dates are fixed strings, never `new Date()`: a screenshot taken today and one taken next month
 * should differ because the code changed, not because the clock moved.
 */
export const TODAY = "2026-09-21";
export const THIS_MONTH = "2026-09";

export const COMPANIES = [
  { id: "10000000-0000-4000-8000-000000000001", code: "NORTH", name: "Northwind Holding GmbH" },
  { id: "10000000-0000-4000-8000-000000000002", code: "HARBOUR", name: "Harbour Estates GmbH" },
] as const;

export const SUPPLIERS = [
  { id: "20000000-0000-4000-8000-000000000001", name: "Vattenfall" },
  { id: "20000000-0000-4000-8000-000000000002", name: "Telekom" },
  { id: "20000000-0000-4000-8000-000000000003", name: "Hausmeister Service Nord" },
] as const;

/** A uuid that reads as what it is, so a fixture id in a screenshot is obviously not real data. */
export const sampleId = (group: number, one: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(one).padStart(12, "0")}`;
