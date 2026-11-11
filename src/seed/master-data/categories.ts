import type { CostAnalysisCategory } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

const base = {
  parent_id: null,
  note: null,
  lexware_category_id: null,
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

/** Two categories wired to a DATEV account number, both specificity levels assignment-rules draws apart. */
export const categoryAccountMapping = [
  {
    id: sampleId(69, 1),
    category_id: categories[1].id,
    company_id: null,
    account_number: "4240",
    account_name: "Strom",
    direction: "incoming",
    is_active: true,
    note: null,
    created_at: "2026-01-05T08:00:00Z",
    updated_at: "2026-01-05T08:00:00Z",
  },
  {
    id: sampleId(69, 2),
    category_id: categories[2].id,
    company_id: COMPANIES[0].id,
    account_number: "4805",
    account_name: "Instandhaltung",
    direction: "incoming",
    is_active: true,
    note: "Nur für diese Gesellschaft, abweichend vom Kontenrahmen.",
    created_at: "2026-01-05T08:00:00Z",
    updated_at: "2026-01-05T08:00:00Z",
  },
];
