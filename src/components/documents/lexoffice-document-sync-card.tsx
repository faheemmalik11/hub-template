import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRetryLexofficeDocumentPush } from "@/data";
import { useFeature } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import type { Document } from "@/lib/data/types";

// Lexware's own web app, not the REST API: confirmed live by opening a real purchase voucher
// there and reading the address bar, since the API's resourceUri isn't a page a person can open.
export function lexwareVoucherUrl(voucherId: string): string {
  return `https://app.lexware.de/vouchers#!/VoucherList//PurchaseInvoice/${voucherId}`;
}

// Only while there's something to watch or fix. A sent document is a header badge instead
// (InvoiceDetailPage) -- a banner that keeps saying "done" long after it happened outstays its
// welcome, the same reason a finished progress bar does not stay on screen.
export function LexofficeDocumentSyncCard({ doc }: { doc: Document }) {
  const { t } = useTranslation();
  const canSync = useFeature(PERMISSIONS.lexofficeDocumentSync);
  const retry = useRetryLexofficeDocumentPush(doc.id);

  if (!canSync || doc.accounting_external_id) return null;
  if (!doc.lexoffice_sync_error && !doc.lexoffice_sync_requested_at) return null;

  const failed = !!doc.lexoffice_sync_error;

  return (
    <div
      className={
        failed
          ? "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-base text-foreground"
          : "flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-base text-foreground"
      }
    >
      {failed ? (
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
      ) : (
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-brand" />
      )}
      <div>
        <p className="font-medium">{t("documents.detail.lexoffice.title")}</p>
        <p className="mt-0.5 text-muted-foreground">
          {failed ? doc.lexoffice_sync_error : t("documents.detail.lexoffice.pending")}
        </p>
        {failed && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2 shadow-none"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(undefined, {
                onSuccess: () => toast.success(t("documents.detail.lexoffice.retrySuccess")),
                onError: (error) =>
                  toast.error(
                    t("documents.detail.lexoffice.retryFailed", { error: error.message }),
                  ),
              })
            }
          >
            {retry.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {retry.isPending
              ? t("documents.detail.lexoffice.retrying")
              : t("documents.detail.lexoffice.retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
