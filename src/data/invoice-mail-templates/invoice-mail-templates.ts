import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export type InvoiceMailTemplateCase = "buyer" | "seller_under_threshold" | "seller_over_threshold";

export interface InvoiceMailTemplate {
  case_key: InvoiceMailTemplateCase;
  subject: string;
  body: string;
}

const TEMPLATE_SELECT = "case_key, subject, body";

const CASE_ORDER: InvoiceMailTemplateCase[] = [
  "buyer",
  "seller_under_threshold",
  "seller_over_threshold",
];

export function useInvoiceMailTemplates() {
  return useQuery({
    queryKey: queryKeys.invoiceMailTemplates.all,
    staleTime: STALE,
    queryFn: async (): Promise<InvoiceMailTemplate[]> => {
      const { data, error } = await sb.from(TABLE.invoiceMailTemplates).select(TEMPLATE_SELECT);
      if (error) throw error;
      const rows = (data ?? []) as InvoiceMailTemplate[];
      return CASE_ORDER.map(
        (caseKey) =>
          rows.find((row) => row.case_key === caseKey) ?? {
            case_key: caseKey,
            subject: "",
            body: "",
          },
      );
    },
  });
}

export function useUpdateInvoiceMailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: InvoiceMailTemplate) => {
      const { error } = await sb
        .from(TABLE.invoiceMailTemplates)
        .update({ subject: template.subject, body: template.body })
        .eq("case_key", template.case_key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invoiceMailTemplates.all }),
  });
}

/** The one of the three texts that applies to a commission invoice, resolved server-side from its
 * side and the deal's realised price. Null for a non-commission invoice, or one with no side set. */
export function useOutgoingInvoiceMailText(invoiceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invoiceMailTemplates.forInvoice(invoiceId),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<InvoiceMailTemplate | null> => {
      const { data, error } = await sb
        .rpc("outgoing_invoice_mail_text", { p_invoice_id: invoiceId })
        .maybeSingle();
      if (error) throw error;
      return data as InvoiceMailTemplate | null;
    },
  });
}
