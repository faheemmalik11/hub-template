import type { CostAnalysisCategory } from "@/lib/data/types";
import { sampleId } from "../shared";

const base = {
  parent_id: null,
  note: null,
  created_by: null,
  created_at: "2026-01-05T08:00:00Z",
  updated_at: "2026-01-05T08:00:00Z",
  deleted_at: null,
  deleted_by: null,
  delete_reason: null,
  excluded_from_profit_and_loss: false,
  is_active: true,
};

/**
 * One category per report block the cost analysis draws, plus the catch-all, because a document
 * that matched nothing is the row that screen exists to make visible.
 */
export const categories: CostAnalysisCategory[] = [
  {
    ...base,
    id: sampleId(60, 1),
    code: "4000",
    name: "Mieteinnahmen",
    name_en: "Rental income",
    report_block: "einnahmen",
    report_line: "Umsatzerlöse",
    direction: "incoming",
    sort_order: 10,
    is_catchall: false,
  },
  {
    ...base,
    id: sampleId(60, 2),
    code: "6310",
    name: "Strom",
    name_en: "Electricity",
    report_block: "kosten",
    report_line: "Betriebskosten",
    direction: "outgoing",
    sort_order: 20,
    is_catchall: false,
  },
  {
    ...base,
    id: sampleId(60, 3),
    code: "6335",
    name: "Instandhaltung",
    name_en: "Maintenance",
    report_block: "kosten",
    report_line: "Instandhaltung",
    direction: "outgoing",
    sort_order: 30,
    is_catchall: false,
  },
  {
    ...base,
    id: sampleId(60, 9),
    code: "9999",
    name: "Nicht zugeordnet",
    name_en: "Unassigned",
    report_block: "neutral",
    report_line: "Nicht zugeordnet",
    direction: "outgoing",
    sort_order: 999,
    is_catchall: true,
  },
];
