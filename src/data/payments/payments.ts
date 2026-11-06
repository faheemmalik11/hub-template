import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { actorEmail, sb, STALE } from "@/data/client";
import { buildPaymentRun, centsToNumber, checkTransfer, resolveSettings } from "@/kit/lib/sepa";
import { todayLocal } from "@/lib/data/format";
import type {
  PainVersion,
  PaymentExecutionDateRule,
  PaymentFile,
  PaymentFileItem,
  PayableDocument,
  PaymentSettings,
  PendingPayment,
} from "@/lib/data/types";

import {
  amountDueNow,
  PAYABLE_WORKFLOW_STATUSES,
  paymentFileMessageId,
  transferDirectDebit,
  transfersFromItems,
  usableAccount,
  type PaymentFileItemRow,
} from "./payment-file-logic";

export const PAYABLE_DOCUMENTS_PAGE_SIZE = 25;

export function usePaymentAccounts(companyId: string | undefined) {
  return useQuery({
    queryKey: ["payment_accounts", companyId],
    staleTime: STALE,
    enabled: !!companyId,
    queryFn: async (): Promise<PaymentSettings[]> => {
      const { data, error } = await sb
        .from(TABLE.paymentSettings)
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaymentSettings[];
    },
  });
}

interface PaymentAccountFormInput {
  label: string;
  payerName: string;
  payerIban: string;
  payerBic?: string | null;
  painVersion?: PainVersion;
  executionDateRule?: PaymentExecutionDateRule;
  batchBooking?: boolean;
  maxTransfersPerFile?: number | null;
}

function paymentAccountRow(input: PaymentAccountFormInput, actor: string | null) {
  return {
    label: input.label,
    payer_name: input.payerName,
    payer_iban: input.payerIban,
    payer_bic: input.payerBic ?? null,
    pain_version: input.painVersion ?? "pain.001.001.09",
    execution_date_rule: input.executionDateRule ?? "as_soon_as_possible",
    batch_booking: input.batchBooking ?? false,
    max_transfers_per_file: input.maxTransfersPerFile ?? null,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };
}

export function useCreatePaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentAccountFormInput & { companyId: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.paymentSettings)
        .insert({ company_id: input.companyId, ...paymentAccountRow(input, actor) });
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_accounts", variables.companyId] });
    },
  });
}

export function useUpdatePaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentAccountFormInput & { id: string; companyId: string }) => {
      const actor = await actorEmail();
      const { error } = await sb
        .from(TABLE.paymentSettings)
        .update(paymentAccountRow(input, actor))
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_accounts", variables.companyId] });
    },
  });
}

export function useSetDefaultPaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; companyId: string }) => {
      const { error } = await sb.rpc("set_default_payment_account", { p_account_id: input.id });
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_accounts", variables.companyId] });
    },
  });
}

export function useDeletePaymentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; companyId: string }) => {
      const { error } = await sb
        .from(TABLE.paymentSettings)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_accounts", variables.companyId] });
    },
  });
}

export function usePayableDocuments(
  companyId: string | undefined,
  search = "",
  page = 1,
  pageSize = PAYABLE_DOCUMENTS_PAGE_SIZE,
) {
  return useQuery({
    queryKey: ["payable_documents", companyId, search, page, pageSize],
    staleTime: STALE,
    enabled: !!companyId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: PayableDocument[]; total: number }> => {
      const queued = await sb
        .from(TABLE.paymentFileItems)
        .select("document_id, payment_files(status)")
        .eq("company_id", companyId);
      if (queued.error) throw queued.error;
      const queuedIds = (
        (queued.data ?? []) as { document_id: string; payment_files: { status: string } | null }[]
      )
        .filter((row) => row.payment_files?.status !== "discarded")
        .map((row) => row.document_id);

      let query = sb
        .from(TABLE.documents)
        .select(
          "id, issuer, invoice_number, amount_gross, due_date, payment_method, supplier_id, payment_reference, early_payment_deadline, early_payment_discount_percent, early_payment_discount_amount, paid_at",
          { count: "exact" },
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .is("paid_at", null)
        .in("workflow_status", PAYABLE_WORKFLOW_STATUSES);
      if (queuedIds.length > 0) query = query.not("id", "in", `(${queuedIds.join(",")})`);
      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        query = query.or(`issuer.ilike.%${trimmedSearch}%,invoice_number.ilike.%${trimmedSearch}%`);
      }

      const from = (page - 1) * pageSize;
      const { data, error, count } = await query
        .order("due_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as PayableDocument[], total: count ?? 0 };
    },
  });
}

export function usePaymentFiles(companyId: string | undefined) {
  return useQuery({
    queryKey: ["payment_files", companyId],
    staleTime: STALE,
    enabled: !!companyId,
    queryFn: async (): Promise<PaymentFile[]> => {
      const { data, error } = await sb
        .from(TABLE.paymentFiles)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentFile[];
    },
  });
}

export function usePaymentFile(fileId: string | undefined) {
  return useQuery({
    queryKey: ["payment_file", fileId],
    staleTime: STALE,
    enabled: !!fileId,
    queryFn: async (): Promise<{ file: PaymentFile; items: PaymentFileItem[] }> => {
      const file = await sb.from(TABLE.paymentFiles).select("*").eq("id", fileId).single();
      if (file.error) throw file.error;
      const items = await sb
        .from(TABLE.paymentFileItems)
        .select("*")
        .eq("payment_file_id", fileId)
        .order("created_at", { ascending: true });
      if (items.error) throw items.error;
      return { file: file.data as PaymentFile, items: (items.data ?? []) as PaymentFileItem[] };
    },
  });
}

export function useCreatePaymentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      documentIds: string[];
      accountId: string;
    }): Promise<string> => {
      const settings = await sb
        .from(TABLE.paymentSettings)
        .select("*")
        .eq("id", input.accountId)
        .single();
      if (settings.error) throw settings.error;
      const settingsRow = settings.data as PaymentSettings;
      const sepaSettings = resolveSettings({
        version: settingsRow.pain_version,
        batchBooking: settingsRow.batch_booking,
        executionDateRule: settingsRow.execution_date_rule,
        maxTransfersPerFile: settingsRow.max_transfers_per_file,
      });

      const accounts = await sb
        .from(TABLE.documentBankAccounts)
        .select(
          "document_id, position, supplier_bank_accounts(iban, bic, deleted_at, is_active, is_payable, confirmed_at)",
        )
        .in("document_id", input.documentIds)
        .order("position", { ascending: true });
      if (accounts.error) throw accounts.error;

      const accountByDocument = new Map<string, { iban: string; bic: string | null }>();
      for (const row of (accounts.data ?? []) as {
        document_id: string;
        supplier_bank_accounts: {
          iban: string | null;
          bic: string | null;
          deleted_at: string | null;
          is_active: boolean;
          is_payable: boolean | null;
          confirmed_at: string | null;
        } | null;
      }[]) {
        if (accountByDocument.has(row.document_id)) continue;
        const usable = usableAccount(row.supplier_bank_accounts);
        if (usable) accountByDocument.set(row.document_id, usable);
      }

      const documents = await sb
        .from(TABLE.documents)
        .select(
          "id, issuer, amount_gross, payment_method, payment_reference, early_payment_deadline, early_payment_discount_percent, early_payment_discount_amount, paid_at",
        )
        .in("id", input.documentIds);
      if (documents.error) throw documents.error;

      const created = await sb
        .from(TABLE.paymentFiles)
        .insert({
          company_id: input.companyId,
          payment_settings_id: input.accountId,
          status: "draft",
        })
        .select("id")
        .single();
      if (created.error) throw created.error;
      const fileId = String((created.data as { id: string }).id);

      const today = todayLocal();
      const items = (
        (documents.data ?? []) as {
          id: string;
          issuer: string | null;
          amount_gross: number | null;
          payment_method: string | null;
          payment_reference: string | null;
          early_payment_deadline: string | null;
          early_payment_discount_percent: number | null;
          early_payment_discount_amount: number | null;
          paid_at: string | null;
        }[]
      ).map((document) => {
        const account = accountByDocument.get(document.id);
        const { amount, discountApplied } = amountDueNow(document, today);
        const reason = checkTransfer(
          {
            reference: document.id,
            recipientName: document.issuer,
            iban: account?.iban ?? null,
            bic: account?.bic ?? null,
            amount,
            remittance: document.payment_reference,
            accountConfirmed: !!account,
            isDirectDebit: transferDirectDebit(document.payment_method),
          },
          sepaSettings,
        );
        return {
          payment_file_id: fileId,
          document_id: document.id,
          recipient_name: document.issuer || "Unknown",
          iban: account?.iban ?? "",
          bic: account?.bic ?? null,
          amount: amount && amount > 0 ? amount : 0.01,
          payment_reference: document.payment_reference,
          discount_applied: discountApplied,
          skipped_reason: reason,
        };
      });

      const written = await sb.from(TABLE.paymentFileItems).insert(items);
      if (written.error) throw written.error;

      return fileId;
    },
    onSuccess: (_fileId, variables) => {
      qc.invalidateQueries({ queryKey: ["payable_documents", variables.companyId] });
      qc.invalidateQueries({ queryKey: ["payment_files", variables.companyId] });
    },
  });
}

export function useGenerateAndDownloadPaymentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fileId: string;
    }): Promise<{ file_name: string; content: string }[]> => {
      const file = await sb.from(TABLE.paymentFiles).select("*").eq("id", input.fileId).single();
      if (file.error) throw file.error;
      const fileRow = file.data as PaymentFile;

      const existingDocuments = await sb
        .from(TABLE.paymentFileDocuments)
        .select("file_name, content")
        .eq("payment_file_id", input.fileId);
      if (existingDocuments.error) throw existingDocuments.error;

      if ((existingDocuments.data ?? []).length > 0) {
        const update = await sb
          .from(TABLE.paymentFiles)
          .update({
            status: "downloaded",
            downloaded_at: new Date().toISOString(),
            download_count: fileRow.download_count + 1,
          })
          .eq("id", input.fileId);
        if (update.error) throw update.error;
        qc.invalidateQueries({ queryKey: ["payment_file", input.fileId] });
        return existingDocuments.data as { file_name: string; content: string }[];
      }

      if (!fileRow.payment_settings_id) {
        throw new Error("no_payment_account");
      }

      const settings = await sb
        .from(TABLE.paymentSettings)
        .select("*")
        .eq("id", fileRow.payment_settings_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (settings.error) throw settings.error;
      const settingsRow = settings.data as PaymentSettings | null;
      if (!settingsRow) {
        throw new Error("payment_account_removed");
      }

      const items = await sb
        .from(TABLE.paymentFileItems)
        .select("document_id, recipient_name, iban, bic, amount, payment_reference")
        .eq("payment_file_id", input.fileId)
        .is("skipped_reason", null);
      if (items.error) throw items.error;

      const today = todayLocal();
      const transfers = transfersFromItems((items.data ?? []) as PaymentFileItemRow[]);

      const built = buildPaymentRun({
        payer: {
          name: settingsRow.payer_name,
          iban: settingsRow.payer_iban,
          bic: settingsRow.payer_bic,
        },
        transfers,
        messageId: paymentFileMessageId(today, input.fileId),
        today,
        settings: {
          version: settingsRow.pain_version,
          batchBooking: settingsRow.batch_booking,
          executionDateRule: settingsRow.execution_date_rule,
          maxTransfersPerFile: settingsRow.max_transfers_per_file,
        },
      });

      if (built.blocker) throw new Error(built.blocker.reason);

      const documentRows = built.files.map((one) => ({
        payment_file_id: input.fileId,
        file_name: one.fileName,
        message_id: one.messageId,
        content: one.content,
        transfer_count: one.transferCount,
        total: centsToNumber(one.totalCents),
      }));
      const insertedDocuments = await sb.from(TABLE.paymentFileDocuments).insert(documentRows);
      if (insertedDocuments.error) throw insertedDocuments.error;

      const update = await sb
        .from(TABLE.paymentFiles)
        .update({
          status: "downloaded",
          filename: built.files.map((one) => one.fileName).join(", "),
          pain_version: settingsRow.pain_version,
          total: centsToNumber(built.totalCents),
          item_count: built.accepted.length,
          downloaded_at: new Date().toISOString(),
          download_count: fileRow.download_count + 1,
        })
        .eq("id", input.fileId);
      if (update.error) throw update.error;

      qc.invalidateQueries({ queryKey: ["payment_file", input.fileId] });
      qc.invalidateQueries({ queryKey: ["payment_files", fileRow.company_id] });

      return documentRows.map((one) => ({ file_name: one.file_name, content: one.content }));
    },
  });
}

export function useDiscardPaymentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fileId: string }): Promise<string> => {
      const updated = await sb
        .from(TABLE.paymentFiles)
        .update({ status: "discarded" })
        .eq("id", input.fileId)
        .select("company_id")
        .single();
      if (updated.error) throw updated.error;
      return String((updated.data as { company_id: string }).company_id);
    },
    onSuccess: (companyId, variables) => {
      qc.invalidateQueries({ queryKey: ["payment_file", variables.fileId] });
      qc.invalidateQueries({ queryKey: ["payment_files", companyId] });
      qc.invalidateQueries({ queryKey: ["payable_documents", companyId] });
    },
  });
}

export function usePendingPayments(companyId: string | undefined) {
  return useQuery({
    queryKey: ["pending_payments", companyId],
    staleTime: STALE,
    enabled: !!companyId,
    queryFn: async (): Promise<PendingPayment[]> => {
      const { data, error } = await sb
        .from(TABLE.paymentFileItems)
        .select(
          "document_id, recipient_name, iban, amount, payment_file_id, payment_files!inner(company_id, status, filename, downloaded_at)",
        )
        .eq("company_id", companyId)
        .is("skipped_reason", null)
        .eq("payment_files.status", "downloaded");
      if (error) throw error;

      const documentIds = ((data ?? []) as { document_id: string }[]).map((row) => row.document_id);
      if (documentIds.length === 0) return [];

      const unpaid = await sb
        .from(TABLE.documents)
        .select("id")
        .in("id", documentIds)
        .is("paid_at", null);
      if (unpaid.error) throw unpaid.error;
      const unpaidIds = new Set(((unpaid.data ?? []) as { id: string }[]).map((row) => row.id));

      return (
        data as unknown as {
          document_id: string;
          recipient_name: string;
          iban: string;
          amount: number;
          payment_file_id: string;
          payment_files: { filename: string | null; downloaded_at: string | null };
        }[]
      )
        .filter((row) => unpaidIds.has(row.document_id))
        .map((row) => ({
          document_id: row.document_id,
          recipient_name: row.recipient_name,
          iban: row.iban,
          amount: row.amount,
          payment_file_id: row.payment_file_id,
          file_name: row.payment_files.filename,
          downloaded_at: row.payment_files.downloaded_at,
        }));
    },
  });
}

export function useConfirmPaymentFilePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { documentId: string }) => {
      const { error } = await sb
        .from(TABLE.documents)
        .update({ paid_at: new Date().toISOString(), paid_source: "payment_file" })
        .eq("id", input.documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["payable_documents"] });
      qc.invalidateQueries({ queryKey: ["pending_payments"] });
      qc.invalidateQueries({ queryKey: ["payment_file"] });
    },
  });
}
