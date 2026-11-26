import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, sb } from "@/data/client";
import { queryKeys } from "@/data/keys";

export type InvoiceMailTemplateSide = "buyer" | "seller";
export type InvoiceMailTemplateCondition = "all" | "below_threshold" | "at_or_above_threshold";

export interface InvoiceMailTemplate {
  id: string;
  name: string;
  side: InvoiceMailTemplateSide;
  condition: InvoiceMailTemplateCondition;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ResolvedInvoiceMailText {
  id: string;
  name: string;
  subject: string;
  body: string;
}

const TEMPLATE_SELECT = "id, name, side, condition, subject, body, created_at, updated_at";

export function useInvoiceMailTemplates() {
  return useQuery({
    queryKey: queryKeys.invoiceMailTemplates.all,
    staleTime: STALE,
    queryFn: async (): Promise<InvoiceMailTemplate[]> => {
      const { data, error } = await sb
        .from(TABLE.invoiceMailTemplates)
        .select(TEMPLATE_SELECT)
        .order("side")
        .order("condition")
        .order("name");
      if (error) throw error;
      return (data ?? []) as InvoiceMailTemplate[];
    },
  });
}

export type InvoiceMailTemplateDraft = Pick<
  InvoiceMailTemplate,
  "name" | "side" | "condition" | "subject" | "body"
>;

export function useCreateInvoiceMailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: InvoiceMailTemplateDraft) => {
      const { error } = await sb.from(TABLE.invoiceMailTemplates).insert(draft);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invoiceMailTemplates.all }),
  });
}

export function useUpdateInvoiceMailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Pick<InvoiceMailTemplate, "id"> & InvoiceMailTemplateDraft) => {
      const { id, ...patch } = template;
      const { error } = await sb.from(TABLE.invoiceMailTemplates).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invoiceMailTemplates.all }),
  });
}

export function useDeleteInvoiceMailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from(TABLE.invoiceMailTemplates).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.invoiceMailTemplates.all }),
  });
}

/** The template that applies to a commission invoice, with {{invoice_number}}, {{invoice_amount}}
 * and whichever of {{buyer_name}}/{{seller_name}} matches resolved into its subject and body. Null
 * for a non-commission invoice, one with no side set, or no matching template. */
export function useOutgoingInvoiceMailText(invoiceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invoiceMailTemplates.forInvoice(invoiceId),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<ResolvedInvoiceMailText | null> => {
      const { data, error } = await sb
        .rpc("outgoing_invoice_mail_text", { p_invoice_id: invoiceId })
        .maybeSingle();
      if (error) throw error;
      return data as ResolvedInvoiceMailText | null;
    },
  });
}
