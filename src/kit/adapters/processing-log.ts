import type { QueryResult } from "../lib/query-result";

export type StatusTone = "brand" | "success" | "warning" | "danger" | "neutral";

export interface ProcessingLogEntry {
  id: string;
  processedAt: string | null;
  subject: string | null;
  sender: string | null;
  status: string | null;
  reason: string | null;
  invoiceId: string | null;
}

export interface ProcessingLogPageQuery {
  search: string;
  status: string | undefined;
  fromDate: string | null;
  toDate: string | null;
  page: number;
  pageSize: number;
}

export interface ProcessingLogCountsQuery {
  search: string;
  fromDate: string | null;
  toDate: string | null;
}

export interface ChangeHistoryEntry {
  id: string;
  at: string | null;
  actor: string | null;
  type: string | null;
  tableName: string | null;
  text: string | null;
}

export interface PageOfRows<Row> {
  rows: Row[];
  total: number;
}

export interface ProcessingLogAdapter {
  useLogPage(query: ProcessingLogPageQuery): QueryResult<PageOfRows<ProcessingLogEntry>>;
  useStatusCounts(query: ProcessingLogCountsQuery): QueryResult<Record<string, number>>;
  useChangeHistoryPage(query: {
    search: string;
    page: number;
    pageSize: number;
  }): QueryResult<PageOfRows<ChangeHistoryEntry>>;
  searchTermWasIgnored(term: string): boolean;
  openInvoice(invoiceId: string): void;
  statusTone: Record<string, StatusTone>;
}
