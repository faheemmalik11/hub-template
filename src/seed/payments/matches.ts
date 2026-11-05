import { sampleId } from "../shared";

/** One confirmed and one candidate match per side -- reconciled vs. still waiting on a person. */
export const documentTransactionMatches = [
  {
    id: sampleId(81, 1),
    document_id: sampleId(30, 3),
    transaction_id: sampleId(80, 1),
    status: "confirmed",
    score: 0.98,
    amount_matched: 1499.4,
    matched_by: "owner@example.com",
    matched_at: "2026-09-05T11:05:00Z",
    confirmed_by: "owner@example.com",
    confirmed_at: "2026-09-05T11:05:00Z",
  },
  {
    id: sampleId(81, 2),
    document_id: sampleId(30, 2),
    transaction_id: sampleId(80, 2),
    status: "candidate",
    score: 0.81,
    amount_matched: null,
    matched_by: null,
    matched_at: null,
    confirmed_by: null,
    confirmed_at: null,
  },
];

export const outgoingInvoiceTransactionMatches = [
  {
    id: sampleId(82, 1),
    outgoing_invoice_id: sampleId(90, 1),
    transaction_id: sampleId(80, 4),
    status: "confirmed",
    score: 0.95,
    amount_matched: 1450,
    matched_by: "owner@example.com",
    matched_at: "2026-09-01T09:10:00Z",
    confirmed_by: "owner@example.com",
    confirmed_at: "2026-09-01T09:10:00Z",
  },
];
