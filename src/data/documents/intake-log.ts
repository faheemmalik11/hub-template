import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { STALE, sb } from "@/data/client";

export type DocumentIntakeOutcome =
  | "open"
  | "in_review"
  | "recognised"
  | "approved"
  | "handed_over"
  | "not_relevant"
  | "archived"
  | "filed";

export const DOCUMENT_INTAKE_OUTCOMES: DocumentIntakeOutcome[] = [
  "open",
  "in_review",
  "recognised",
  "approved",
  "handed_over",
  "filed",
  "not_relevant",
  "archived",
];

const OUTCOMES_NEEDING_ACTION: DocumentIntakeOutcome[] = ["open", "in_review"];
const OUTCOMES_DONE: DocumentIntakeOutcome[] = [
  "recognised",
  "approved",
  "handed_over",
  "filed",
  "not_relevant",
  "archived",
];

export type DocumentIntakeLogTab = "all" | "open" | "done";

export interface DocumentIntakeLogEntry {
  id: string;
  invoiceNumber: string | null;
  receivedAt: string | null;
  sender: string | null;
  subject: string | null;
  documentType: string | null;
  companyCode: string | null;
  channel: string | null;
  outcome: DocumentIntakeOutcome;
}

export interface DocumentIntakeLogPage {
  rows: DocumentIntakeLogEntry[];
  total: number;
}

export const DOCUMENT_INTAKE_LOG_PAGE_SIZE = 50;

export function useDocumentIntakeLog(args: {
  tab: DocumentIntakeLogTab;
  search: string;
  page: number;
  from?: string | null;
  to?: string | null;
  outcome?: DocumentIntakeOutcome | null;
  channel?: string | null;
  pageSize?: number;
}) {
  const search = args.search.trim();
  const pageSize = args.pageSize ?? DOCUMENT_INTAKE_LOG_PAGE_SIZE;
  return useQuery({
    queryKey: [
      "document-intake-log",
      args.tab,
      search,
      args.page,
      pageSize,
      args.from ?? "",
      args.to ?? "",
      args.outcome ?? "",
      args.channel ?? "",
    ],
    staleTime: STALE,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DocumentIntakeLogPage> => {
      let query = sb
        .from("v_document_intake_log")
        .select(
          "id, invoice_number, created_at, issuer, service_description, document_type, company_code, intake_channel, outcome",
          { count: "exact" },
        );
      if (args.tab === "open") query = query.in("outcome", OUTCOMES_NEEDING_ACTION);
      if (args.tab === "done") query = query.in("outcome", OUTCOMES_DONE);
      if (search) query = query.textSearch("fts", search, { type: "websearch", config: "german" });
      if (args.from) query = query.gte("created_at", args.from);
      if (args.to) query = query.lte("created_at", `${args.to}T23:59:59.999Z`);
      if (args.outcome) query = query.eq("outcome", args.outcome);
      if (args.channel) query = query.eq("intake_channel", args.channel);

      const offset = args.page * pageSize;
      const { data, error, count } = await query
        .order("created_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;

      const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: row.id as string,
        invoiceNumber: (row.invoice_number as string | null) ?? null,
        receivedAt: (row.created_at as string | null) ?? null,
        sender: (row.issuer as string | null) ?? null,
        subject: (row.service_description as string | null) ?? null,
        documentType: (row.document_type as string | null) ?? null,
        companyCode: (row.company_code as string | null) ?? null,
        channel: (row.intake_channel as string | null) ?? null,
        outcome: row.outcome as DocumentIntakeOutcome,
      }));
      return { rows, total: count ?? 0 };
    },
  });
}
