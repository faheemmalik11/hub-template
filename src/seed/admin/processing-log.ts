import type { ProcessingLog } from "@/lib/data/types";
import { sampleId } from "../shared";

/**
 * Read and filed, read and set aside, and one that failed: the three outcomes the log has to tell
 * apart. A run that read nothing and a run that failed look identical in a count, which is why the
 * reason is a column and not a tooltip.
 */
export const processingLog: ProcessingLog[] = [
  {
    id: 3001,
    source_item_id: "msg-0914-a",
    subject: "Ihre Rechnung RE-2026-0914",
    sender: "rechnung@vattenfall.example",
    status: "filed",
    reason: null,
    document_id: sampleId(30, 1),
    processed_at: "2026-09-14T08:12:04Z",
    body: null,
    sent_at: "2026-09-14T08:10:00Z",
  },
  {
    id: 3002,
    source_item_id: "msg-0916-b",
    subject: "Newsletter September",
    sender: "news@baumarkt-nord.example",
    status: "not_relevant",
    reason: "Sender on the exclusion list",
    document_id: null,
    processed_at: "2026-09-16T06:30:11Z",
    body: null,
    sent_at: "2026-09-16T06:00:00Z",
  },
  {
    id: 3003,
    source_item_id: "msg-0918-c",
    subject: "Scan_0031.pdf",
    sender: "scan@example.com",
    status: "failed",
    reason: "No text could be read from the document",
    document_id: null,
    processed_at: "2026-09-18T11:02:47Z",
    body: null,
    sent_at: "2026-09-18T11:00:00Z",
  },
];
