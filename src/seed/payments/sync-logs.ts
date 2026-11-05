import { sampleId } from "../shared";

/** One ok run and one warning, the two levels the sync-log dialog colours differently. */
export const bankSyncLogs = [
  {
    id: sampleId(84, 1),
    run_id: sampleId(84, 10),
    connection_id: sampleId(71, 1),
    event: "sync_completed",
    level: "info",
    message: null,
    counts: { accounts: 1, transactions_new: 2, transactions_updated: 0 },
    created_at: "2026-09-21T06:00:00Z",
    deleted_at: null,
  },
  {
    id: sampleId(84, 2),
    run_id: sampleId(84, 9),
    connection_id: sampleId(71, 1),
    event: "account_revived",
    level: "warning",
    message: "Konto war ausgeblendet und wurde wieder eingeblendet.",
    counts: null,
    created_at: "2026-09-14T06:00:00Z",
    deleted_at: null,
  },
];
