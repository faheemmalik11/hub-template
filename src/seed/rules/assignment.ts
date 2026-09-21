import type { AssignmentRule } from "@/lib/data/types";
import { COMPANIES, SUPPLIERS, sampleId } from "../shared";

const base = {
  cost_category: null,
  vat_rate: null,
  vat_treatment: null,
  vat_deductible_pct: null,
  vat_special_case: null,
  reference_pattern: null,
  is_active: true,
  note: null,
  created_by: null,
  created_at: "2026-02-01T09:00:00Z",
  updated_at: "2026-02-01T09:00:00Z",
  deleted_at: null,
  deleted_by: null,
  delete_reason: null,
};

/**
 * Two rules that both match the same document, so the list shows why the narrower one wins.
 * Specificity decides, never the order they were written in, which is the thing people expect
 * wrongly and the screen has to make plain.
 */
export const assignmentRules: AssignmentRule[] = [
  {
    ...base,
    id: sampleId(110, 1),
    target: "cost_category",
    category_id: sampleId(60, 2),
    supplier_id: SUPPLIERS[0].id,
    property_id: null,
    company_id: null,
    specificity: 1,
  } as AssignmentRule,
  {
    ...base,
    id: sampleId(110, 2),
    target: "cost_category",
    category_id: sampleId(60, 3),
    supplier_id: SUPPLIERS[0].id,
    property_id: sampleId(40, 2),
    company_id: COMPANIES[0].id,
    specificity: 3,
    note: "Strom für Mühlenweg zählt als Instandhaltung",
  } as AssignmentRule,
];
