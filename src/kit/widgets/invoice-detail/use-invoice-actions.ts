import { useState } from "react";
import { toast } from "sonner";

import { readableErrorMessage } from "../../components/feedback/query-states";
import type { InvoiceDetailAdapter, InvoiceDetailRecord } from "../../adapters/invoice-detail";

export interface InvoiceActionLabels {
  noteAdded: string;
  deletedToast: string;
  paidToast: string;
}

export interface InvoiceActions {
  noteText: string;
  setNoteText: (text: string) => void;
  addNote: () => Promise<void>;

  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  deleteReason: string;
  setDeleteReason: (reason: string) => void;
  confirmDelete: () => Promise<void>;

  togglePaid: () => Promise<void>;

  approvalComment: string;
  setApprovalComment: (comment: string) => void;
  runApprovalAction: (actionId: string, requiresComment: boolean) => Promise<void>;
}

/** Everything a person can do to a document from its detail screen, with its own state. */
export function useInvoiceActions(
  invoice: InvoiceDetailRecord | null | undefined,
  adapter: InvoiceDetailAdapter,
  labels: InvoiceActionLabels,
): InvoiceActions {
  const [noteText, setNoteText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [approvalComment, setApprovalComment] = useState("");

  const failed = (error: unknown) => toast.error(readableErrorMessage(error, ""));

  return {
    noteText,
    setNoteText,
    addNote: async () => {
      const text = noteText.trim();
      if (!text || !invoice) return;
      try {
        await adapter.addNote(invoice.id, text);
        setNoteText("");
        toast.success(labels.noteAdded);
      } catch (error) {
        failed(error);
      }
    },

    deleteOpen,
    setDeleteOpen,
    deleteReason,
    setDeleteReason,
    confirmDelete: async () => {
      if (!invoice) return;
      try {
        await adapter.softDelete(invoice.id, deleteReason.trim());
        toast.success(labels.deletedToast);
        setDeleteOpen(false);
        adapter.openInvoiceList();
      } catch (error) {
        failed(error);
      }
    },

    togglePaid: async () => {
      if (!adapter.payment || !invoice) return;
      try {
        await adapter.payment.setPaid(invoice.id, !invoice.paid_at);
        toast.success(labels.paidToast);
      } catch (error) {
        failed(error);
      }
    },

    approvalComment,
    setApprovalComment,
    runApprovalAction: async (actionId, requiresComment) => {
      if (!adapter.approval || !invoice) return;
      if (requiresComment && !approvalComment.trim()) return;
      try {
        await adapter.approval.runAction(invoice.id, actionId, approvalComment.trim() || undefined);
        setApprovalComment("");
      } catch (error) {
        failed(error);
      }
    },
  };
}
