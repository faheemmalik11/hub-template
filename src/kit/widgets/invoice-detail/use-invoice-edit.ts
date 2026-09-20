import { useState } from "react";
import { toast } from "sonner";

import { readableErrorMessage } from "../../components/feedback/query-states";
import type { InvoiceDetailAdapter, InvoiceDetailRecord } from "../../adapters/invoice-detail";
import {
  changedFields,
  detailsFormFrom,
  overviewFormFrom,
  type DetailsForm,
  type OverviewForm,
} from "./edit-forms";

const NUMERIC_OVERVIEW_FIELDS = ["amount_net", "vat_rate", "vat_amount", "amount_gross"];

export interface InvoiceEditLabels {
  saved: string;
  saveFailed: (reason: string) => string;
}

export interface InvoiceEdit {
  overviewOpen: boolean;
  openOverview: (invoice: InvoiceDetailRecord) => void;
  closeOverview: () => void;
  overviewForm: OverviewForm | null;
  setOverviewForm: (form: OverviewForm) => void;
  setOverviewOpen: (open: boolean) => void;
  saveOverview: () => Promise<void>;

  detailsOpen: boolean;
  openDetails: (invoice: InvoiceDetailRecord) => void;
  closeDetails: () => void;
  detailsForm: DetailsForm | null;
  setDetailsForm: (form: DetailsForm) => void;
  setDetailsOpen: (open: boolean) => void;
  saveDetails: () => Promise<void>;

  saving: boolean;
}

/**
 * The two edit panels on a document: what is on screen, what changed, and what gets sent.
 *
 * Only changed fields are sent, with their labels, so the history line says what a person actually
 * altered rather than listing every field on the form.
 */
export function useInvoiceEdit(
  invoice: InvoiceDetailRecord | null | undefined,
  adapter: InvoiceDetailAdapter,
  fieldLabel: (key: string) => string,
  labels: InvoiceEditLabels,
): InvoiceEdit {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [overviewForm, setOverviewForm] = useState<OverviewForm | null>(null);
  const [detailsForm, setDetailsForm] = useState<DetailsForm | null>(null);
  const [saving, setSaving] = useState(false);

  const send = async (
    changes: Record<string, unknown>,
    changedLabels: string[],
    close: () => void,
  ) => {
    if (!invoice) return;
    if (Object.keys(changes).length === 0) {
      close();
      return;
    }
    setSaving(true);
    try {
      await adapter.updateInvoice(invoice.id, changes, changedLabels);
      toast.success(labels.saved);
      close();
    } catch (error) {
      toast.error(labels.saveFailed(readableErrorMessage(error, "")));
    } finally {
      setSaving(false);
    }
  };

  return {
    overviewOpen,
    openOverview: (record) => {
      setOverviewForm(overviewFormFrom(record));
      setOverviewOpen(true);
    },
    closeOverview: () => setOverviewOpen(false),
    setOverviewOpen,
    overviewForm,
    setOverviewForm,
    saveOverview: async () => {
      if (!overviewForm || !invoice) return;
      const {
        changes,
        labels: changed,
        invalid,
      } = changedFields(
        overviewForm as unknown as Record<string, string>,
        invoice as unknown as Record<string, unknown>,
        NUMERIC_OVERVIEW_FIELDS,
        fieldLabel,
      );
      if (invalid.length > 0) {
        toast.error(labels.saveFailed(invalid.join(", ")));
        return;
      }
      await send(changes, changed, () => setOverviewOpen(false));
    },

    detailsOpen,
    openDetails: (record) => {
      setDetailsForm(detailsFormFrom(record));
      setDetailsOpen(true);
    },
    closeDetails: () => setDetailsOpen(false),
    setDetailsOpen,
    detailsForm,
    setDetailsForm,
    saveDetails: async () => {
      if (!detailsForm || !invoice) return;
      const { changes, labels: changed } = changedFields(
        detailsForm as unknown as Record<string, string>,
        invoice as unknown as Record<string, unknown>,
        [],
        fieldLabel,
      );
      await send(changes, changed, () => setDetailsOpen(false));
    },

    saving,
  };
}
