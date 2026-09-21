import { AlertTriangle } from "lucide-react";

import {
  Button,
  errorText,
  formatDateTime,
  toast,
  useAcknowledgeDatevBounce,
  useCompanies,
  useOpenDatevBounces,
  useTranslation,
  type DatevHandoverBatch,
} from "./adapter";

/**
 * Handovers that were accepted and then never delivered.
 *
 * THE ONE FAILURE NOTHING ELSE ON THIS SCREEN CAN SHOW. A send that fails is visible the moment it
 * happens and leaves its receipts on the ready list. A bounce is the opposite: the mail provider
 * accepted the message, the batch was recorded as a success, the receipts were ticked off as handed
 * over, and the non-delivery report arrived minutes later into a mailbox. DATEV has no return
 * channel, so nothing else in the system will ever notice that the tax advisor received nothing.
 *
 * Above the table rather than inside it, and not scoped to any one company: a misdelivery is not
 * something anybody goes looking for by first picking the company it happened to. It stays on
 * screen until somebody explicitly clears it, because a misdelivery nobody has seen is the entire
 * failure this exists to prevent.
 *
 * The reason is printed verbatim and never summarised. A non-delivery report names the address it
 * could not reach, which is exactly what somebody diagnosing a wrong DATEV address needs, and the
 * address itself is the one thing this app deliberately cannot show them anywhere else.
 */
export function BounceBanner() {
  const { t } = useTranslation();
  const bouncesQ = useOpenDatevBounces();
  const companiesQ = useCompanies();
  const acknowledge = useAcknowledgeDatevBounce();

  const bounces = bouncesQ.data ?? [];
  if (bounces.length === 0) return null;

  const codeFor = (companyId: string) =>
    (companiesQ.data ?? []).find((c) => c.id === companyId)?.code ?? "—";

  return (
    <div className="mt-5 rounded-xl border border-danger/40 bg-danger-soft/40 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t("handover.bounce.title", { count: bounces.length })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("handover.bounce.body")}</p>

          <ul className="mt-3 space-y-2">
            {bounces.map((batch: DatevHandoverBatch) => (
              <li
                key={batch.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {codeFor(batch.company_id)}
                    {" · "}
                    {t(`handover.richtung.${batch.direction}`)}
                    {" · "}
                    {t("handover.bounce.belege", { count: batch.invoice_count })}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(batch.bounced_at ?? batch.created_at)}
                  </p>
                  {batch.bounce_reason && (
                    <p className="mt-1 text-xs break-words text-muted-foreground">
                      {batch.bounce_reason}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={acknowledge.isPending}
                  onClick={() =>
                    acknowledge.mutate(
                      { batchId: batch.id },
                      {
                        onSuccess: () => toast.success(t("handover.bounce.toast.ok")),
                        onError: (e: unknown) =>
                          toast.error(
                            t("handover.bounce.toast.fehlgeschlagen", {
                              error: errorText(e),
                            }),
                          ),
                      },
                    )
                  }
                >
                  {t("handover.bounce.erledigt")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
