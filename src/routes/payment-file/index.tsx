import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { useEmitOnboardingEvent } from "@/kit/components/onboarding";
import { pageTitle } from "@/config/brand";
import {
  useCompanies,
  useConfirmPaymentFilePaid,
  useCreatePaymentAccount,
  useCreatePaymentFile,
  useDeletePaymentAccount,
  useDiscardPaymentFile,
  useGenerateAndDownloadPaymentFile,
  usePayableDocuments,
  usePaymentAccounts,
  usePaymentFile,
  usePaymentFiles,
  usePendingPayments,
  useSetDefaultPaymentAccount,
  useUpdatePaymentAccount,
} from "@/data";
import { downloadTextFile } from "@/kit/lib/download";
import { PaymentFilePage } from "@/kit/pages/payment-file";
import type { PaymentAccountFormValues, PaymentFileAdapter } from "@/kit/adapters/payment-file";
import { formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

export const Route = createFileRoute("/payment-file/")({
  validateSearch: (input: Record<string, unknown>): { company?: string } => ({
    company: typeof input.company === "string" ? input.company : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitle("Payment file") }] }),
  component: PaymentFileRoute,
});

function PaymentFileRoute() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const companiesQuery = useCompanies();
  const emitOnboardingEvent = useEmitOnboardingEvent();
  const companyId = search.company;

  if (!companyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">{t("paymentFile.title")}</h1>
        <div className="max-w-sm space-y-1.5" data-tour="payment-company">
          <Label>{t("paymentFile.companyLabel")}</Label>
          <Combobox
            value={null}
            onValueChange={(value) => {
              emitOnboardingEvent({ type: "payment_company_chosen", recordId: value });
              void navigate({ search: { company: value } });
            }}
            options={(companiesQuery.data ?? []).map((company) => ({
              value: company.id,
              label: `${company.code} · ${company.name}`,
              keywords: company.name,
            }))}
            placeholder={t("paymentFile.companyPlaceholder")}
          />
        </div>
      </div>
    );
  }

  return <PaymentFileForCompany key={companyId} companyId={companyId} />;
}

function PaymentFileForCompany({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const docNavigate = useNavigate();

  const createAccount = useCreatePaymentAccount();
  const updateAccount = useUpdatePaymentAccount();
  const setDefaultAccount = useSetDefaultPaymentAccount();
  const deleteAccount = useDeletePaymentAccount();
  const createFile = useCreatePaymentFile();
  const generateAndDownload = useGenerateAndDownloadPaymentFile();
  const discardFile = useDiscardPaymentFile();
  const confirmPaid = useConfirmPaymentFilePaid();

  function accountInput(values: PaymentAccountFormValues) {
    return {
      label: values.label,
      payerName: values.payerName,
      payerIban: values.payerIban,
      payerBic: values.payerBic || null,
      painVersion: values.painVersion as
        "pain.001.001.02" | "pain.001.001.03" | "pain.001.001.08" | "pain.001.001.09",
      executionDateRule: values.executionDateRule as "as_soon_as_possible" | "on_due_date",
    };
  }

  const adapter: PaymentFileAdapter = {
    companyId,

    useAccounts() {
      const query = usePaymentAccounts(companyId);
      return {
        data: (query.data ?? []).map((row) => ({
          id: row.id,
          label: row.label,
          payerName: row.payer_name,
          payerIban: row.payer_iban,
          payerBic: row.payer_bic,
          painVersion: row.pain_version,
          executionDateRule: row.execution_date_rule,
          isDefault: row.is_default,
        })),
        loading: query.isLoading,
      };
    },

    useFiles() {
      const query = usePaymentFiles(companyId);
      return {
        data: (query.data ?? []).map((row) => ({
          id: row.id,
          filename: row.filename,
          createdAt: row.created_at,
          itemCount: row.item_count,
          total: row.total,
          status: row.status,
        })),
        loading: query.isLoading,
        error: query.error,
        refetch: () => void query.refetch(),
      };
    },

    usePayableDocuments(search, page, pageSize) {
      const query = usePayableDocuments(companyId, search, page, pageSize);
      const today = new Date().toISOString().slice(0, 10);
      return {
        data: {
          rows: (query.data?.rows ?? []).map((document) => {
            const deadline = (document.early_payment_deadline ?? "").slice(0, 10);
            const discountAvailable =
              !!deadline && deadline >= today && document.early_payment_discount_amount != null;
            const amountDueNow = discountAvailable
              ? (document.early_payment_discount_amount as number)
              : (document.amount_gross ?? 0);
            return {
              id: document.id,
              issuer: document.issuer,
              invoiceNumber: document.invoice_number,
              amountGross: document.amount_gross,
              dueDate: document.due_date,
              amountDueNow,
              discountApplied: discountAvailable,
            };
          }),
          total: query.data?.total ?? 0,
        },
        loading: query.isLoading,
        error: query.error,
        refetch: () => void query.refetch(),
      };
    },

    useFile(fileId) {
      const query = usePaymentFile(fileId);
      return {
        data: query.data
          ? {
              file: {
                id: query.data.file.id,
                filename: query.data.file.filename,
                createdAt: query.data.file.created_at,
                itemCount: query.data.file.item_count,
                total: query.data.file.total,
                status: query.data.file.status,
              },
              items: query.data.items.map((item) => ({
                id: item.id,
                documentId: item.document_id,
                recipientName: item.recipient_name,
                iban: item.iban,
                amount: item.amount,
                skippedReason: item.skipped_reason,
              })),
            }
          : undefined,
        loading: query.isLoading,
        error: query.error,
        refetch: () => void query.refetch(),
      };
    },

    usePendingPayments() {
      const query = usePendingPayments(companyId);
      return {
        data: (query.data ?? []).map((row) => ({
          documentId: row.document_id,
          recipientName: row.recipient_name,
          iban: row.iban,
          amount: row.amount,
          fileName: row.file_name,
        })),
        loading: query.isLoading,
        error: query.error,
        refetch: () => void query.refetch(),
      };
    },

    busy: {
      creatingFile: createFile.isPending,
      downloading: generateAndDownload.isPending,
      discarding: discardFile.isPending,
      confirmingPaid: confirmPaid.isPending,
      savingAccount: createAccount.isPending || updateAccount.isPending,
    },

    async createAccount(values) {
      await createAccount.mutateAsync(
        { companyId, ...accountInput(values) },
        { onError: () => toast.error(t("paymentFile.error.saveAccount")) },
      );
    },
    async updateAccount(id, values) {
      await updateAccount.mutateAsync(
        { id, companyId, ...accountInput(values) },
        { onError: () => toast.error(t("paymentFile.error.saveAccount")) },
      );
    },
    async setDefaultAccount(id) {
      await setDefaultAccount.mutateAsync(
        { id, companyId },
        { onError: () => toast.error(t("paymentFile.error.saveAccount")) },
      );
    },
    async deleteAccount(id) {
      await deleteAccount.mutateAsync(
        { id, companyId },
        { onError: () => toast.error(t("paymentFile.error.saveAccount")) },
      );
    },
    async createFile(documentIds, accountId) {
      return createFile.mutateAsync(
        { companyId, documentIds, accountId },
        { onError: () => toast.error(t("paymentFile.error.createFile")) },
      );
    },
    async generateAndDownloadFile(fileId) {
      try {
        const files = await generateAndDownload.mutateAsync({ fileId });
        return files.map((one) => ({ fileName: one.file_name, content: one.content }));
      } catch (error) {
        toast.error(
          error instanceof Error && error.message === "nothing_to_transfer"
            ? t("paymentFile.error.nothingToTransfer")
            : t("paymentFile.error.generateFile"),
        );
        throw error;
      }
    },
    async discardFile(fileId) {
      await discardFile.mutateAsync(
        { fileId },
        { onError: () => toast.error(t("paymentFile.error.discardFile")) },
      );
    },
    async confirmPaid(documentId) {
      await confirmPaid.mutateAsync(
        { documentId },
        { onError: () => toast.error(t("paymentFile.error.confirmPaid")) },
      );
    },

    openDocument(documentId) {
      void docNavigate({ to: "/incoming-invoices/$nr", params: { nr: documentId } });
    },
    downloadFile(fileName, content) {
      downloadTextFile(fileName, content, "application/xml");
    },
    formatMoney: formatEUR,
    formatDate,
  };

  const labels = {
    title: t("paymentFile.title"),
    description: t("paymentFile.description"),
    manualUploadNotice: t("paymentFile.manualUploadNotice"),
    stepsAriaLabel: t("paymentFile.stepsAriaLabel"),
    steps: {
      prepare: {
        title: t("paymentFile.steps.prepare.title"),
        subtitle: t("paymentFile.steps.prepare.subtitle"),
      },
      review: {
        title: t("paymentFile.steps.review.title"),
        subtitle: t("paymentFile.steps.review.subtitle"),
      },
      track: {
        title: t("paymentFile.steps.track.title"),
        subtitle: t("paymentFile.steps.track.subtitle"),
      },
    },
    manageAccounts: t("paymentFile.manageAccounts"),
    payFrom: {
      label: t("paymentFile.payFrom.label"),
      manage: t("paymentFile.payFrom.manage"),
      missing: t("paymentFile.payFrom.missing"),
    },
    prepare: {
      title: t("paymentFile.prepare.title"),
      description: t("paymentFile.prepare.description"),
      searchPlaceholder: t("paymentFile.prepare.searchPlaceholder"),
      empty: t("paymentFile.prepare.empty"),
      noResults: t("paymentFile.prepare.noResults"),
      selectAll: t("paymentFile.prepare.selectAll"),
      colSupplier: t("paymentFile.prepare.colSupplier"),
      colInvoiceNumber: t("paymentFile.prepare.colInvoiceNumber"),
      colAmount: t("paymentFile.prepare.colAmount"),
      colDueDate: t("paymentFile.prepare.colDueDate"),
      colPaymentAmount: t("paymentFile.prepare.colPaymentAmount"),
      discountBadge: t("paymentFile.prepare.discountBadge"),
      noInvoiceNumber: t("paymentFile.prepare.noInvoiceNumber"),
    },
    draft: {
      title: t("paymentFile.draft.title"),
      selected: t("paymentFile.draft.selected"),
      invoiceTotal: t("paymentFile.draft.invoiceTotal"),
      discountTotal: t("paymentFile.draft.discountTotal"),
      paymentTotal: t("paymentFile.draft.paymentTotal"),
      unselectedHint: (count: number) => t("paymentFile.draft.unselectedHint", { count }),
      selectHint: t("paymentFile.draft.selectHint"),
      build: t("paymentFile.draft.build"),
      building: t("paymentFile.draft.building"),
      buildDisabledNoInvoices: t("paymentFile.draft.buildDisabledNoInvoices"),
    },
    accounts: {
      title: t("paymentFile.accounts.title"),
      empty: t("paymentFile.accounts.empty"),
      default: t("paymentFile.accounts.default"),
      setDefault: t("paymentFile.accounts.setDefault"),
      edit: t("paymentFile.accounts.edit"),
      delete: t("paymentFile.accounts.delete"),
      add: t("paymentFile.accounts.add"),
      close: t("paymentFile.accounts.close"),
      deleteConfirmTitle: t("paymentFile.accounts.deleteConfirmTitle"),
      deleteConfirmBody: t("paymentFile.accounts.deleteConfirmBody"),
      deleteConfirmCancel: t("paymentFile.accounts.deleteConfirmCancel"),
      deleteConfirmConfirm: t("paymentFile.accounts.deleteConfirmConfirm"),
    },
    accountForm: {
      titleAdd: t("paymentFile.accountForm.titleAdd"),
      titleEdit: t("paymentFile.accountForm.titleEdit"),
      label: t("paymentFile.accountForm.label"),
      payerName: t("paymentFile.accountForm.payerName"),
      payerIban: t("paymentFile.accountForm.payerIban"),
      payerBic: t("paymentFile.accountForm.payerBic"),
      painVersion: t("paymentFile.accountForm.painVersion"),
      executionDateRule: t("paymentFile.accountForm.executionDateRule"),
      executionDateAsSoonAsPossible: t("paymentFile.accountForm.executionDateAsSoonAsPossible"),
      executionDateOnDueDate: t("paymentFile.accountForm.executionDateOnDueDate"),
      save: t("paymentFile.accountForm.save"),
      cancel: t("paymentFile.accountForm.cancel"),
      errorLabelRequired: t("paymentFile.accountForm.errorLabelRequired"),
      errorNameRequired: t("paymentFile.accountForm.errorNameRequired"),
      errorIbanRequired: t("paymentFile.accountForm.errorIbanRequired"),
      errorIbanInvalid: t("paymentFile.accountForm.errorIbanInvalid"),
      errorIbanNotSepa: t("paymentFile.accountForm.errorIbanNotSepa"),
      errorBicInvalid: t("paymentFile.accountForm.errorBicInvalid"),
    },
    review: {
      title: t("paymentFile.review.title"),
      none: t("paymentFile.review.none"),
      goToPrepare: t("paymentFile.review.goToPrepare"),
      colRecipient: t("paymentFile.review.colRecipient"),
      colIban: t("paymentFile.review.colIban"),
      colAmount: t("paymentFile.review.colAmount"),
      colStatus: t("paymentFile.review.colStatus"),
      downloadFile: t("paymentFile.review.downloadFile"),
      discard: t("paymentFile.review.discard"),
      discardConfirmTitle: t("paymentFile.review.discardConfirmTitle"),
      discardConfirmBody: t("paymentFile.review.discardConfirmBody"),
      discardConfirmCancel: t("paymentFile.review.discardConfirmCancel"),
      discardConfirmConfirm: t("paymentFile.review.discardConfirmConfirm"),
      statusDraft: t("paymentFile.review.statusDraft"),
      statusGenerated: t("paymentFile.review.statusGenerated"),
      statusDownloaded: t("paymentFile.review.statusDownloaded"),
      statusDiscarded: t("paymentFile.review.statusDiscarded"),
      discardedNotice: t("paymentFile.review.discardedNotice"),
      skippedReason: (reason: string) =>
        t(`paymentFile.review.skippedReason.${reason}`, { defaultValue: reason }),
    },
    track: {
      title: t("paymentFile.track.title"),
      empty: t("paymentFile.track.empty"),
      colRecipient: t("paymentFile.track.colRecipient"),
      colIban: t("paymentFile.track.colIban"),
      colAmount: t("paymentFile.track.colAmount"),
      colFile: t("paymentFile.track.colFile"),
    },
    history: {
      title: t("paymentFile.history.title"),
      empty: t("paymentFile.history.empty"),
      colFile: t("paymentFile.history.colFile"),
      colDate: t("paymentFile.history.colDate"),
      colCount: t("paymentFile.history.colCount"),
      colTotal: t("paymentFile.history.colTotal"),
      colStatus: t("paymentFile.history.colStatus"),
    },
    markPaid: t("paymentFile.markPaid"),
    markPaidConfirmTitle: t("paymentFile.markPaidConfirmTitle"),
    markPaidConfirmBody: t("paymentFile.markPaidConfirmBody"),
    markPaidConfirmCancel: t("paymentFile.markPaidConfirmCancel"),
    markPaidConfirmConfirm: t("paymentFile.markPaidConfirmConfirm"),
  };

  return <PaymentFilePage adapter={adapter} labels={labels} />;
}
