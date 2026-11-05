import type { DatevHandoverBatch } from "@/lib/data/types";
import { COMPANIES, sampleId } from "../shared";

const base = {
  error_message: null,
  sent_by: "owner@example.com",
  bounced_at: null,
  bounce_reason: null,
  acknowledged_at: null,
  acknowledged_by: null,
};

/**
 * Sent and acknowledged, sent and still waiting, and one that bounced. The acknowledgement is the
 * point: without it nobody can tell a batch that arrived from one that vanished, and sending it
 * twice is a real problem with no trace.
 */
export const handoverBatches: DatevHandoverBatch[] = [
  {
    ...base,
    id: sampleId(130, 1),
    company_id: COMPANIES[0].id,
    direction: "incoming",
    invoice_count: 24,
    total_bytes: 3_140_992,
    status: "success",
    created_at: "2026-09-01T07:00:00Z",
    acknowledged_at: "2026-09-01T09:12:00Z",
    acknowledged_by: "kanzlei@example.com",
  },
  {
    ...base,
    id: sampleId(130, 2),
    company_id: COMPANIES[0].id,
    direction: "outgoing",
    invoice_count: 6,
    total_bytes: 512_400,
    status: "success",
    created_at: "2026-09-15T07:00:00Z",
  },
  {
    ...base,
    id: sampleId(130, 3),
    company_id: COMPANIES[1].id,
    direction: "incoming",
    invoice_count: 11,
    total_bytes: 1_204_880,
    status: "bounced",
    created_at: "2026-09-16T07:00:00Z",
    bounced_at: "2026-09-16T07:04:00Z",
    bounce_reason: "Mailbox full",
  },
];

/** One company set up for both directions, one for incoming only -- the address list draws these differently. */
export const handoverRoutes = [
  {
    id: sampleId(131, 1),
    company_id: COMPANIES[0].id,
    direction: "incoming",
    address: "kanzlei@example.com",
    is_enabled: true,
    note: null,
    updated_by: "owner@example.com",
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
  },
  {
    id: sampleId(131, 2),
    company_id: COMPANIES[0].id,
    direction: "outgoing",
    address: "kanzlei@example.com",
    is_enabled: true,
    note: null,
    updated_by: "owner@example.com",
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
  },
  {
    id: sampleId(131, 3),
    company_id: COMPANIES[1].id,
    direction: "incoming",
    address: "steuerberater@example.com",
    is_enabled: true,
    note: null,
    updated_by: "owner@example.com",
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
  },
];
