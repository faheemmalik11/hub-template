import type { ApprovalRule } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

const base = {
  supplier_id: null,
  property_id: null,
  step_1_user_id: null,
  step_2_user_id: null,
  step_1_approver: null,
  step_2_approver: null,
  is_active: true,
  note: null,
  created_by: null,
  created_at: "2026-02-01T09:00:00Z",
  updated_at: "2026-02-01T09:00:00Z",
  deleted_at: null,
  deleted_by: null,
  delete_reason: null,
};

/** Anything over a threshold needs both steps; everything else needs one. */
export const approvalRules: ApprovalRule[] = [
  {
    ...base,
    id: sampleId(120, 1),
    company_id: COMPANIES[0].id,
    min_amount: 0,
    skip_step_2: true,
    specificity: 1,
  } as ApprovalRule,
  {
    ...base,
    id: sampleId(120, 2),
    company_id: COMPANIES[0].id,
    min_amount: 1000,
    skip_step_2: false,
    specificity: 2,
    note: "Ab 1.000 EUR zweite Freigabe",
  } as ApprovalRule,
];
