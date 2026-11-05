import { sampleId } from "../shared";

/** One sender exclusion and one supplier exclusion -- two of the valid scopes, nothing deleted. */
export const ingestExclusions = [
  {
    id: sampleId(63, 1),
    term: "newsletter@",
    scope: "sender",
    is_active: true,
    note: "Automatischer Newsletter, kein Beleg.",
    created_by: "owner@example.com",
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  },
  {
    id: sampleId(63, 2),
    term: "Finanzamt",
    scope: "supplier",
    is_active: true,
    note: null,
    created_by: "owner@example.com",
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-01T09:00:00Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  },
];
