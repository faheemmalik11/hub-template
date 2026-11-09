import { supabase } from "@/integrations/supabase/client";
import { TABLE } from "@/config/tables";
import { toCsv, downloadCsv } from "@/lib/data/csv-download";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const EXPORT_PAGE_SIZE = 1000;

export interface ExportableTable {
  key: string;
  table: string;
  labelKey: string;
  group: ExportGroup;
}

export type ExportGroup = "documents" | "masterData" | "rules" | "bank" | "access";

export const EXPORT_GROUPS: readonly ExportGroup[] = [
  "documents",
  "masterData",
  "rules",
  "bank",
  "access",
];

export const EXPORTABLE_TABLES: ExportableTable[] = [
  { key: "invoices", table: TABLE.documents, labelKey: "invoices", group: "documents" },
  { key: "invoiceFiles", table: TABLE.documentFiles, labelKey: "invoiceFiles", group: "documents" },
  {
    key: "invoiceLineItems",
    table: TABLE.documentLineItems,
    labelKey: "invoiceLineItems",
    group: "documents",
  },
  { key: "invoiceTax", table: TABLE.documentTaxes, labelKey: "invoiceTax", group: "documents" },
  {
    key: "invoiceHistory",
    table: TABLE.documentHistory,
    labelKey: "invoiceHistory",
    group: "documents",
  },
  {
    key: "outgoingInvoices",
    table: TABLE.outgoingInvoices,
    labelKey: "outgoingInvoices",
    group: "documents",
  },
  {
    key: "outgoingInvoiceFiles",
    table: TABLE.outgoingInvoiceFiles,
    labelKey: "outgoingInvoiceFiles",
    group: "documents",
  },
  {
    key: "handoverBatches",
    table: TABLE.handoverBatches,
    labelKey: "handoverBatches",
    group: "documents",
  },
  {
    key: "processingLog",
    table: TABLE.processingLog,
    labelKey: "processingLog",
    group: "documents",
  },
  {
    key: "importedItems",
    table: TABLE.importedItems,
    labelKey: "importedItems",
    group: "documents",
  },

  { key: "companies", table: TABLE.companies, labelKey: "companies", group: "masterData" },
  { key: "properties", table: TABLE.properties, labelKey: "properties", group: "masterData" },
  {
    key: "propertyCompanies",
    table: TABLE.propertyCompanies,
    labelKey: "propertyCompanies",
    group: "masterData",
  },
  { key: "suppliers", table: TABLE.suppliers, labelKey: "suppliers", group: "masterData" },
  { key: "customers", table: TABLE.customers, labelKey: "customers", group: "masterData" },
  {
    key: "entityAliases",
    table: TABLE.entityAliases,
    labelKey: "entityAliases",
    group: "masterData",
  },
  { key: "categories", table: TABLE.categories, labelKey: "categories", group: "masterData" },
  {
    key: "categoryAccountMapping",
    table: TABLE.categoryAccountMapping,
    labelKey: "categoryAccountMapping",
    group: "masterData",
  },
  {
    key: "handoverRoutes",
    table: TABLE.handoverRoutes,
    labelKey: "handoverRoutes",
    group: "masterData",
  },

  { key: "approvers", table: TABLE.approvers, labelKey: "approvers", group: "rules" },
  { key: "approvalRules", table: TABLE.approvalRules, labelKey: "approvalRules", group: "rules" },
  {
    key: "assignmentRules",
    table: TABLE.assignmentRules,
    labelKey: "assignmentRules",
    group: "rules",
  },
  {
    key: "ingestExclusions",
    table: TABLE.ingestExclusions,
    labelKey: "ingestExclusions",
    group: "rules",
  },
  {
    key: "openItemWhitelistRules",
    table: TABLE.openItemWhitelistRules,
    labelKey: "openItemWhitelistRules",
    group: "rules",
  },
  {
    key: "filenameSettings",
    table: TABLE.filenameSettings,
    labelKey: "filenameSettings",
    group: "rules",
  },
  { key: "receiptChannels", table: TABLE.channels, labelKey: "receiptChannels", group: "rules" },
  {
    key: "receiptChannelFolders",
    table: TABLE.channelFolders,
    labelKey: "receiptChannelFolders",
    group: "rules",
  },

  { key: "bankAccounts", table: TABLE.bankAccounts, labelKey: "bankAccounts", group: "bank" },
  {
    key: "bankTransactions",
    table: TABLE.bankTransactions,
    labelKey: "bankTransactions",
    group: "bank",
  },
  {
    key: "documentTransactionMatches",
    table: TABLE.documentTransactionMatches,
    labelKey: "documentTransactionMatches",
    group: "bank",
  },
  { key: "manualBookings", table: TABLE.manualBookings, labelKey: "manualBookings", group: "bank" },

  { key: "appUsers", table: TABLE.appUsers, labelKey: "appUsers", group: "access" },
  { key: "roles", table: TABLE.roles, labelKey: "roles", group: "access" },
  { key: "permissions", table: TABLE.permissions, labelKey: "permissions", group: "access" },
  {
    key: "rolePermissions",
    table: TABLE.rolePermissions,
    labelKey: "rolePermissions",
    group: "access",
  },
  {
    key: "userPermissions",
    table: TABLE.userPermissions,
    labelKey: "userPermissions",
    group: "access",
  },
  { key: "changeHistory", table: TABLE.changeHistory, labelKey: "changeHistory", group: "access" },
];

async function fetchAllRows(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const to = from + EXPORT_PAGE_SIZE - 1;
    const { data, error } = await sb.from(table).select("*").range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < EXPORT_PAGE_SIZE) break;
    from += EXPORT_PAGE_SIZE;
  }
  return rows;
}

function rowsToCsvBody(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const body: Array<Array<string | number | null | undefined>> = [
    headers,
    ...rows.map((row) =>
      headers.map((h) => {
        const value = row[h];
        if (value === null || value === undefined) return "";
        if (typeof value === "number" || typeof value === "string") return value;
        return JSON.stringify(value);
      }),
    ),
  ];
  return toCsv(body);
}

export async function exportTableAsCsv(table: string): Promise<number> {
  const rows = await fetchAllRows(table);
  downloadCsv(`${table}-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsvBody(rows));
  return rows.length;
}

export async function exportEverythingAsZip(
  onProgress?: (done: number, total: number, table: string) => void,
): Promise<{ tables: number; rows: number }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const stamp = new Date().toISOString().slice(0, 10);
  const folder = zip.folder(`hub-export-${stamp}`) ?? zip;

  let rowsTotal = 0;
  const failedTables: string[] = [];

  for (const [index, entry] of EXPORTABLE_TABLES.entries()) {
    onProgress?.(index, EXPORTABLE_TABLES.length, entry.table);
    try {
      const rows = await fetchAllRows(entry.table);
      rowsTotal += rows.length;
      folder.file(`${entry.group}/${entry.table}.csv`, rowsToCsvBody(rows));
    } catch (error) {
      failedTables.push(
        `${entry.table}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  folder.file(
    "README.txt",
    [
      `Hub data export, ${stamp}`,
      "",
      `Included: ${EXPORTABLE_TABLES.length - failedTables.length} tables as CSV, one file per table,`,
      "sorted into subfolders by section. Empty tables are included as an empty file.",
      "",
      "The documents themselves (PDFs, scans) are NOT in this archive. invoiceFiles.csv lists",
      "every file with its document, filename, storage location and checksum.",
      "",
      "Left out on purpose:",
      "  credentials, credentialReads -- live third-party access tokens, not business data.",
      "  pipelineRuns, pipelineRunRequests, scheduledJobs, readCursors -- internal ingestion",
      "  machinery with nothing to say about the business.",
      "",
      failedTables.length ? `Could not be read:\n  ${failedTables.join("\n  ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  onProgress?.(EXPORTABLE_TABLES.length, EXPORTABLE_TABLES.length, "");
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hub-export-${stamp}.zip`;
  link.click();
  URL.revokeObjectURL(url);

  return { tables: EXPORTABLE_TABLES.length - failedTables.length, rows: rowsTotal };
}
