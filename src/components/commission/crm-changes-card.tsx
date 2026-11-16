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

function hubValueFor(deal: Deal, field: string): string | null {
  if (field === "sold_on") return deal.notarised_on ? formatDate(deal.notarised_on) : null;
  if (field === "sold_price") {
    return deal.purchase_price === null ? null : formatEUR(deal.purchase_price);
  }
  if (field === "buyer_rate" || field === "seller_rate") {
    const side = field === "buyer_rate" ? "buyer" : "seller";
    const rate = deal.deal_sides.find((dealSide) => dealSide.side === side)?.fee_net_rate;
    return rate === null || rate === undefined ? null : `${rate} %`;
  }
  return null;
}

export function CrmChangesCard({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const changesQ = useDealCrmChanges(deal.id);
  const accept = useAcknowledgeDealCrmChanges(deal.id);
  const changes = changesQ.data ?? [];

  if (changes.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t("commissionDeals.crmChanges.title")}
          </p>
          <p className="text-xs text-muted-foreground">{t("commissionDeals.crmChanges.explain")}</p>

          <dl className="mt-1.5 space-y-1">
            {changes.map((change: DealCrmChange) => {
              const hubValue = hubValueFor(deal, change.field);
              return (
                <div key={change.field} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
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
                  {hubValue !== null && (
                    <dd className="text-xs text-muted-foreground">
                      {t("commissionDeals.crmChanges.yourInvoice", { value: hubValue })}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>

          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 gap-2 px-2 text-xs shadow-none"
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
