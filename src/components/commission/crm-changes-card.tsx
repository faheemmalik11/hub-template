import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAcknowledgeDealCrmChanges, useDealCrmChanges } from "@/data";
import type { Deal, DealCrmChange } from "@/data";
import { errorText, formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const DATE_FIELDS = new Set(["sold_on"]);
const MONEY_FIELDS = new Set(["sold_price"]);
const RATE_FIELDS = new Set(["buyer_rate", "seller_rate"]);

function readableValue(field: string, value: string | null): string | null {
  if (value === null) return null;
  if (DATE_FIELDS.has(field)) return formatDate(value);
  if (MONEY_FIELDS.has(field)) return formatEUR(Number(value));
  if (RATE_FIELDS.has(field)) return `${Number(value)} %`;
  return value;
}

export function CrmChangesCard({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const changesQ = useDealCrmChanges(deal.id);
  const accept = useAcknowledgeDealCrmChanges(deal.id);
  const changes = changesQ.data ?? [];

  if (changes.length === 0) return null;

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{t("commissionDeals.crmChanges.title")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("commissionDeals.crmChanges.explain")}
          </p>

          <dl className="mt-3 space-y-1.5">
            {changes.map((change: DealCrmChange) => (
              <div key={change.field} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <dt className="font-medium text-foreground">
                  {t(`commissionDeals.crmChanges.field.${change.field}`)}
                </dt>
                <dd className="text-muted-foreground">
                  {t("commissionDeals.crmChanges.wasNow", {
                    was:
                      readableValue(change.field, change.was) ??
                      t("commissionDeals.crmChanges.empty"),
                    became:
                      readableValue(change.field, change.became) ??
                      t("commissionDeals.crmChanges.empty"),
                  })}
                </dd>
              </div>
            ))}
          </dl>

          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-2 shadow-none"
            disabled={accept.isPending}
            onClick={() =>
              accept.mutate(undefined, {
                onSuccess: () => toast.success(t("commissionDeals.crmChanges.accepted")),
                onError: (error) =>
                  toast.error(t("commissionDeals.crmChanges.acceptFailed"), {
                    description: errorText(error),
                  }),
              })
            }
          >
            {accept.isPending && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
            {accept.isPending
              ? t("commissionDeals.crmChanges.accepting")
              : t("commissionDeals.crmChanges.accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
