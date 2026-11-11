import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRetryLexofficeDocumentPush } from "@/data";
import { useFeature } from "@/data/use-feature";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import type { Document } from "@/lib/data/types";

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

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {t("documents.detail.lexoffice.title")}
      </h2>
      <div className="mt-2 flex items-center gap-2 text-sm">
        {doc.accounting_external_id ? (
          <>
            <CheckCircle2 className="size-4 text-muted-foreground" />
            <span>{t("documents.detail.lexoffice.sent")}</span>
          </>
        ) : doc.lexoffice_sync_error ? (
          <>
            <AlertCircle className="size-4 text-destructive" />
            <span title={doc.lexoffice_sync_error}>{t("documents.detail.lexoffice.failed")}</span>
          </>
        ) : (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>{t("documents.detail.lexoffice.pending")}</span>
          </>
        )}
      </div>
      {doc.lexoffice_sync_error && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={retry.isPending}
          onClick={() =>
            retry.mutate(undefined, {
              onSuccess: () => toast.success(t("documents.detail.lexoffice.retrySuccess")),
              onError: (error) =>
                toast.error(t("documents.detail.lexoffice.retryFailed", { error: error.message })),
            })
          }
        >
          {retry.isPending
            ? t("documents.detail.lexoffice.retrying")
            : t("documents.detail.lexoffice.retry")}
        </Button>
      )}
    </div>
  );
}
