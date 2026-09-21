import type { OutgoingInvoice } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

const base = {
  lexoffice_voucher_id: null,
  currency: "EUR",
  line_items: null,
  source: "upload" as const,
  status_source: null,
  reminder_level: null,
  reminder_due_date: null,
  created_by: null,
  last_synced_at: null,
  customers: null,
};

/** Paid, still open, and one overdue enough to have a reminder: what the list colours differently. */
export const outgoingInvoices: OutgoingInvoice[] = [
  {
    ...base,
    id: sampleId(90, 1),
    company_id: COMPANIES[1].id,
    customer_id: sampleId(50, 2),
    invoice_number: "AR-2026-0041",
    status: "paidoff",
    invoice_date: "2026-09-01",
    due_date: "2026-09-15",
    amount_net: 1450,
    amount_gross: 1450,
    created_at: "2026-09-01T09:00:00Z",
    updated_at: "2026-09-02T07:30:00Z",
  } as OutgoingInvoice,
  {
    ...base,
    id: sampleId(90, 2),
    company_id: COMPANIES[0].id,
    customer_id: sampleId(50, 1),
    invoice_number: "AR-2026-0042",
    status: "open",
    invoice_date: "2026-09-12",
    due_date: "2026-09-26",
    amount_net: 2400,
    amount_gross: 2856,
    created_at: "2026-09-12T10:15:00Z",
    updated_at: "2026-09-12T10:15:00Z",
  } as OutgoingInvoice,
  {
    ...base,
    id: sampleId(90, 3),
    company_id: COMPANIES[0].id,
    customer_id: sampleId(50, 1),
    invoice_number: "AR-2026-0031",
    status: "open",
    invoice_date: "2026-07-20",
    due_date: "2026-08-03",
    amount_net: 780,
    amount_gross: 928.2,
    reminder_level: 1,
    reminder_due_date: "2026-09-24",
    created_at: "2026-07-20T08:00:00Z",
    updated_at: "2026-09-10T08:00:00Z",
  } as OutgoingInvoice,
];
