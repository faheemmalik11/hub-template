import { sampleId } from "../shared";

/** One rule per valid scope, so the filter options all have at least one row behind them. */
export const openItemWhitelistRules = [
  {
    id: sampleId(64, 1),
    term: "Baumarkt Nord",
    scope: "counterparty",
    category: null,
    is_active: true,
    note: "Kleinbeträge, Kassenbons liegen in Papierform vor.",
    created_by: "owner@example.com",
    created_at: "2026-04-01T09:00:00Z",
    updated_at: "2026-04-01T09:00:00Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  },
];
