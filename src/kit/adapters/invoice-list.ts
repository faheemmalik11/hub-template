import type { LucideIcon } from "lucide-react";

import type { Extracted, Validation } from "../components/invoice-review/pipeline-types";
import type { QueueTone } from "../components/invoice-queue";

export interface InvoiceListRow {
  id: string;
  issuer: string | null;
  invoiceNumber: string | null;
  costCategory: string | null;
  documentType: string | null;
  paymentMethod: string | null;
  companyCode: string | null;
  amountGross: number | null;
  vatRate: number | null;
  documentDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  confidenceScore: number | null;
  status: string | null;
  workflowStatus: string | null;
  extracted: Extracted | null;
  validation: Validation | null;
  validation_detail?: Record<string, unknown> | null;
  hasConfirmedBankMatch?: boolean;
  hasSuggestedBankMatch?: boolean;
}

export interface InvoiceQueueCardData {
  key: string;
  count: number;
  amount: number;
}

export interface InvoiceListAdapter {
  useInvoices(): { data: InvoiceListRow[]; loading: boolean; error: unknown };
  useQueueCards?(): { data: InvoiceQueueCardData[]; loading: boolean };
  useCompanyOptions?(): { data: { code: string; name: string }[]; loading: boolean };
  openInvoice(id: string): void;
  formatMoney: (value: number | null) => string;
  formatDate: (iso: string | null) => string;
}

export interface InvoiceQueueCardConfig {
  key: string;
  icon: LucideIcon;
  tone: QueueTone;
  filter: (row: InvoiceListRow) => boolean;
}

export interface InvoiceListConfig {
  direction: "incoming" | "outgoing";
  queueCards?: InvoiceQueueCardConfig[];
  showBankMatch?: boolean;
  showConfidence?: boolean;
}
