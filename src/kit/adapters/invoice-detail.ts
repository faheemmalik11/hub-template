import type { HistoryConfig } from "../pages/invoice-detail/history";
import type { LadderColors } from "../pages/invoice-detail/WorkflowLadder";
import type {
  InvoiceHistoryEntry,
  InvoiceReviewFields,
} from "../components/invoice-review/pipeline-types";

export interface InvoiceDetailConfig extends HistoryConfig {
  chainActionIds: string[];
  autoSteps: string[];
  correctableStatuses: string[];
  ladderColors: LadderColors;
  fieldJumpTargets: Record<string, { tab: string; anchor: string }>;
  workflowSteps: readonly string[];
}

export interface InvoiceDetailRecord extends InvoiceReviewFields {
  id: string;
  supplier_id: string | null;
  issuer_address: string | null;
  document_type: string | null;
  service_date: string | null;
  service_period_from: string | null;
  service_period_to: string | null;
  invoice_number: string | null;
  order_number: string | null;
  currency: string | null;
  property_code: string | null;
  category_id: string | null;
  cost_category: string | null;
  service_description: string | null;
  recipient_address: string | null;
  customer_number: string | null;
  payment_reference: string | null;
  payment_method: string | null;
  tax_note: string | null;
  due_date: string | null;
  early_payment_deadline: string | null;
  early_payment_discount_percent: number | null;
  early_payment_discount_amount: number | null;
  paid_at: string | null;
  workflow_status: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string | null;
  archived_at: string | null;
  not_relevant_at: string | null;
  deleted_at: string | null;
}

export interface Approver {
  id: string;
  name: string;
  role: string;
}

export interface ApprovalAction {
  id: string;
  requiresComment: boolean;
}

export interface InvoiceDetailAdapter {
  useInvoice(id: string): {
    data: InvoiceDetailRecord | undefined;
    loading: boolean;
    error: unknown;
    refetch: () => void;
  };
  useHistory(invoiceId: string): { data: InvoiceHistoryEntry[]; loading: boolean };
  useCompanyOptions(): { data: { code: string; name: string }[]; loading: boolean };
  usePropertyOptions(): { data: { code: string; name: string }[]; loading: boolean };
  useCategoryOptions(): { data: { id: string; name: string }[]; loading: boolean };

  canEdit: boolean;
  updateInvoice(
    id: string,
    changes: Record<string, unknown>,
    changedFieldLabels: string[],
  ): Promise<void>;
  addNote(id: string, text: string): Promise<void>;
  softDelete(id: string, reason: string): Promise<void>;

  openInvoiceList: () => void;

  approval?: {
    useApprovers(): { data: Approver[]; loading: boolean };
    useLegalActions(invoice: InvoiceDetailRecord): {
      data: Map<string, ApprovalAction>;
      loading: boolean;
    };
    runAction(id: string, actionId: string, comment: string | undefined): Promise<void>;
  };

  payment?: {
    setPaid(id: string, paid: boolean): Promise<void>;
    usePayableAccount(invoice: InvoiceDetailRecord): {
      data: { iban: string; bankName: string | null } | null;
      loading: boolean;
    };
  };

  supplier?: {
    openSupplier: (supplierId: string) => void;
  };

  archive?: {
    archive(id: string, note: string): Promise<void>;
    unarchive(id: string): Promise<void>;
  };

  notRelevant?: {
    setNotRelevant(id: string, reason: string): Promise<void>;
    clearNotRelevant(id: string): Promise<void>;
  };
}
