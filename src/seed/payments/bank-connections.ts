import { sampleId } from "../shared";

/** The one connection the synced account (bank-accounts.ts) belongs to. */
export const bankConnections = [
  {
    id: sampleId(71, 1),
    provider_access_ref: "seed-access-1",
    provider_user: null,
    provider_id: "banksapi",
    provider_name: "Berliner Sparkasse",
    bank_name: "Berliner Sparkasse",
    status: "active",
    is_sandbox: false,
    last_sync_at: "2026-09-21T06:00:00Z",
    last_sync_status: "ok",
    disconnected_at: null,
    connected_by: "owner@example.com",
    connected_by_email: "owner@example.com",
    created_at: "2026-01-12T09:00:00Z",
    updated_at: "2026-09-21T06:00:00Z",
    deleted_at: null,
    deleted_by: null,
  },
];
