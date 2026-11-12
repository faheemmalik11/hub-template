import { AlertTriangle, ExternalLink, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRetryLexofficeDocumentPush } from "@/data";
import { useFeature } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import type { Document } from "@/lib/data/types";

// Lexware's own web app, not the REST API: confirmed live by opening a real purchase voucher
// there and reading the address bar, since the API's resourceUri isn't a page a person can open.
function lexwareVoucherUrl(voucherId: string): string {
  return `https://app.lexware.de/vouchers#!/VoucherList//PurchaseInvoice/${voucherId}`;
}

// Same banner shape as the direct-debit notice on this page: icon + title + body, calm brand
// colour for a plain fact, the destructive triangle reserved for the one case that needs action.
export function LexofficeDocumentSyncCard({ doc }: { doc: Document }) {
  const { t } = useTranslation();
  const canSync = useFeature(PERMISSIONS.lexofficeDocumentSync);
  const retry = useRetryLexofficeDocumentPush(doc.id);

  if (!canSync) return null;
  if (
    !doc.lexoffice_sync_error &&
    !doc.lexoffice_sync_requested_at &&
    !doc.accounting_external_id
  ) {
    return null;
  }

  const failed = !!doc.lexoffice_sync_error;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-base text-foreground",
        failed ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      {failed ? (
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
      ) : doc.accounting_external_id ? (
        <Info className="mt-0.5 size-5 shrink-0 text-brand" />
      ) : (
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-brand" />
      )}
      <div>
        <p className="font-medium">{t("documents.detail.lexoffice.title")}</p>
        <p className="mt-0.5 text-muted-foreground">
          {doc.accounting_external_id
            ? t("documents.detail.lexoffice.sent")
            : failed
              ? doc.lexoffice_sync_error
              : t("documents.detail.lexoffice.pending")}
        </p>
        {doc.accounting_external_id && (
          <a
            href={lexwareVoucherUrl(doc.accounting_external_id)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
          >
            {t("documents.detail.lexoffice.openInLexware")}
            <ExternalLink className="size-3.5" />
          </a>
        )}
        {failed && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
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
