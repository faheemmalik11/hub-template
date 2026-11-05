import { sampleId } from "../shared";

/** One mailbox, one filing folder -- the two kinds the inbox screen tells apart. */
export const channels = [
  {
    key: "mailbox",
    kind: "mailbox",
    provider: "microsoft",
    enabled: true,
    connection_id: null,
    provider_ref: null,
    settings: {},
    position: 10,
    updated_at: "2026-09-01T09:00:00Z",
    updated_by: "owner@example.com",
  },
  {
    key: "filing",
    kind: "filing",
    provider: "dropbox",
    enabled: true,
    connection_id: null,
    provider_ref: null,
    settings: {},
    position: 20,
    updated_at: "2026-09-01T09:00:00Z",
    updated_by: "owner@example.com",
  },
];

export const channelFolders = [
  {
    id: sampleId(68, 1),
    channel_key: "mailbox",
    identity: "buchhaltung@example.com",
    role: "source",
    external_id: "inbox",
    display_name: "Posteingang",
    well_known_name: "inbox",
    position: 10,
  },
  {
    id: sampleId(68, 2),
    channel_key: "mailbox",
    identity: "buchhaltung@example.com",
    role: "processed",
    external_id: "processed",
    display_name: "Verarbeitet",
    well_known_name: null,
    position: 20,
  },
  {
    id: sampleId(68, 3),
    channel_key: "filing",
    identity: "",
    role: "destination",
    external_id: "/Belege",
    display_name: "Belege",
    well_known_name: null,
    position: 10,
  },
];

/** The last run the health panel reads, and a page of history behind it. */
export const pipelineRuns = [
  {
    id: sampleId(61, 1),
    source: "mailbox",
    status: "completed",
    started_at: "2026-09-21T05:00:00Z",
    finished_at: "2026-09-21T05:02:00Z",
    trigger: "schedule",
    request_id: null,
    processed_count: 4,
    error_count: 0,
    filed_count: 3,
    skipped_count: 1,
    duplicate_count: 0,
    discarded_count: 0,
    relinked_count: 0,
    folders_read: ["inbox"],
    folders_skipped: null,
  },
];

export const pipelineRunRequests: unknown[] = [];
