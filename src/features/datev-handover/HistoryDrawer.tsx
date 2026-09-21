import { AlertTriangle, CheckCircle2, FileX2 } from "lucide-react";

import {
  ErrorState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
  formatDate,
  formatDateTime,
  formatEUR,
  useDatevHandoverBatches,
  useTranslation,
  type DatevHandoverBatch,
} from "./adapter";
import { formatBytes, type CompanyRow } from "./model";

/**
 * One company's previous handovers.
 *
 * `datev_handover_batches` has recorded a row per email since migration 0038 and
 * `useDatevHandoverBatches` has existed to read it for just as long — and until this screen was
 * reworked, nothing in the app ever called that hook. So the only record of an irreversible send
 * was a toast, and the row the send function writes for its worst case ("the email went out but
 * recording it failed, do NOT resend") went into a table with no reader anywhere.
 *
 * NO AMOUNT COLUMN. The table stores `invoice_count`, `total_bytes`, `status`, `error_message`,
 * `sent_by` and `created_at`, and nothing else — a batch is not linked back to the invoices it
 * carried, so the euro value of a past handover is not recoverable here. Size is what the data
 * actually has, so size is what this shows.
 */
export function HistoryDrawer({
  row,
  open,
  onOpenChange,
}: {
  row: CompanyRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const batchesQ = useDatevHandoverBatches(row?.company.id ?? null, { enabled: !!row });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("handover.verlauf.title")}</SheetTitle>
          <SheetDescription>
            {row
              ? row.company.name
                ? `${row.company.code} · ${row.company.name}`
                : row.company.code
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-6">
          {/* WHAT DID NOT GO, above what did. A skipped receipt is the only thing on this screen
              that still needs somebody to act, and it is invisible everywhere else once the send
              drawer closes — the batch table records what was emailed, never what was left behind.
              These are read live rather than from history on purpose: a skip is not an event that
              happened once, it is a state that persists until the file is fixed, so the list is
              still true a week later and empties itself when the problem is solved. */}
          {row && row.blocked.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <FileX2 className="size-4 shrink-0" aria-hidden />
                {t("handover.verlauf.uebersprungenTitel", { count: row.blocked.length })}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("handover.verlauf.uebersprungenHilfe")}
              </p>
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-warning/40">
                {row.blocked.map((inv) => (
                  <li key={inv.id} className="bg-warning-soft/40 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {inv.invoice_number && (
                          <span className="text-foreground">{inv.invoice_number}</span>
                        )}
                        {inv.issuer && (
                          <span
                            className={cn(inv.invoice_number && "ml-1.5", "text-muted-foreground")}
                          >
                            {inv.issuer}
                          </span>
                        )}
                        {!inv.invoice_number && !inv.issuer && (
                          <span className="text-muted-foreground">
                            {formatDate(inv.document_date)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatEUR(inv.amount_gross)}
                      </span>
                    </div>
                    <p className="text-xs text-warning">
                      {t(`handover.blockGrund.${inv.blockReason}`)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-medium text-foreground">
              {t("handover.verlauf.gesendetTitel")}
            </h3>
            {batchesQ.isError ? (
              <ErrorState error={batchesQ.error} onRetry={() => void batchesQ.refetch()} />
            ) : batchesQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : (batchesQ.data ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t("handover.verlauf.leer")}
              </p>
            ) : (
              <ol className="space-y-2">
                {(batchesQ.data ?? []).map((b) => (
                  <BatchRow key={b.id} batch={b} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BatchRow({ batch }: { batch: DatevHandoverBatch }) {
  const { t } = useTranslation();
  // A bounce reads as a failure here even though the send itself succeeded: from this screen's
  // point of view the receipts did not arrive, which is the same outcome.
  const error = batch.status !== "success";
  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        error ? "border-danger/40 bg-danger-soft/40" : "border-border bg-card",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {formatDateTime(batch.created_at)}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-xs",
            error ? "text-danger" : "text-success",
          )}
        >
          {error ? (
            <AlertTriangle className="size-3.5" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5" aria-hidden />
          )}
          {t(`handover.verlauf.status.${batch.status}`)}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {t("handover.verlauf.zeile", {
          count: batch.invoice_count,
          size: formatBytes(batch.total_bytes),
        })}
      </p>
      {batch.sent_by && (
        <p className="text-xs text-muted-foreground">
          {t("handover.verlauf.von", { who: batch.sent_by })}
        </p>
      )}
      {/* Never truncated: see the send function's post-send bookkeeping failure. */}
      {(batch.error_message || batch.bounce_reason) && (
        <p className="mt-1.5 text-xs break-words text-danger">
          {batch.error_message ?? batch.bounce_reason}
        </p>
      )}
    </li>
  );
}
