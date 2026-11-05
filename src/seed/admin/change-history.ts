import { sampleId } from "../shared";
import { COMPANIES, SUPPLIERS } from "../shared";

/** One edit and one approval-chain change, the two kinds this log actually fills with. */
export const changeHistory = [
  {
    id: sampleId(67, 1),
    table_name: "suppliers",
    record_id: SUPPLIERS[0].id,
    type: "update",
    text: `IBAN von ${SUPPLIERS[0].name} geändert.`,
    data: { field: "iban" },
    actor: "owner@example.com",
    at: "2026-08-20T10:00:00Z",
  },
  {
    id: sampleId(67, 2),
    table_name: "companies",
    record_id: COMPANIES[0].id,
    type: "role_permission_granted",
    text: "supervisor: invoices.approve_final erteilt",
    data: { role: "supervisor", permission: "invoices.approve_final", granted: true },
    actor: "owner@example.com",
    at: "2026-09-01T08:00:00Z",
  },
];
