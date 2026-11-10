import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBonusSettings,
  useCancelReferrerBonus,
  useCustomer,
  useDealReferrerBonus,
  useMarkReferrerBonusPaid,
  useReferrerBonusTier,
  useSuggestReferrerBonus,
} from "@/data";
import type { BonusSettings, Deal } from "@/data";
import { errorText, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function tierAmountOf(settings: BonusSettings, tier: number): number {
  if (tier <= 1) return settings.referrer_tier1_amount;
  if (tier === 2) return settings.referrer_tier2_amount;
  if (tier === 3) return settings.referrer_tier3_amount;
  return settings.referrer_tier4plus_amount;
}

export function DealReferrerBonusCard({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const referrerCustomerId = deal.referrer_customer_id;
  const earnedOn = deal.notarised_on ?? new Date().toISOString().slice(0, 10);
  const settingsQ = useBonusSettings();
  const referrerQ = useCustomer(referrerCustomerId ?? "");
  const bonusQ = useDealReferrerBonus(deal.id);
  const tierQ = useReferrerBonusTier(referrerCustomerId, earnedOn);
  const suggest = useSuggestReferrerBonus(deal.id);
  const markPaid = useMarkReferrerBonusPaid(deal.id);
  const cancel = useCancelReferrerBonus(deal.id);

  const [amount, setAmount] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  if (!referrerCustomerId) return null;
  if (!settingsQ.data || bonusQ.data === undefined || tierQ.data === undefined) return null;

  const bonus = bonusQ.data;
  const suggestedAmount = tierAmountOf(settingsQ.data, tierQ.data);

  const create = () => {
    const parsedAmount = Number((amount || String(suggestedAmount)).replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    suggest.mutate(
      { referrerCustomerId, tier: tierQ.data, amount: parsedAmount, earnedOn },
      {
        onSuccess: () => toast.success(t("commissionDeals.referrerBonus.created")),
        onError: (error) =>
          toast.error(t("commissionDeals.referrerBonus.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">
        {t("commissionDeals.referrerBonus.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("commissionDeals.referrerBonus.hint", { name: referrerQ.data?.name ?? "…" })}
      </p>

      {!bonus ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("commissionDeals.referrerBonus.tierNote", {
              tier: tierQ.data,
              amount: formatEUR(suggestedAmount),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-32"
              inputMode="decimal"
              value={amount || String(suggestedAmount)}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={t("commissionDeals.referrerBonus.amount")}
              aria-label={t("commissionDeals.referrerBonus.amount")}
            />
            <Button size="sm" disabled={suggest.isPending} onClick={create}>
              {t("commissionDeals.referrerBonus.create")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{referrerQ.data?.name}</div>
              <div className="text-xs text-muted-foreground">
                {t("commissionDeals.referrerBonus.tierLabel", { tier: bonus.tier })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">{formatEUR(bonus.amount)}</div>
              <Badge variant={bonus.status === "paid" ? "outline" : "secondary"}>
                {t(`commissionDeals.referrerBonus.status.${bonus.status}`)}
              </Badge>
            </div>
          </div>
          {bonus.status === "suggested" && !cancelling && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={markPaid.isPending}
                onClick={() =>
                  markPaid.mutate(bonus.id, {
                    onSuccess: () => toast.success(t("commissionDeals.referrerBonus.markedPaid")),
                    onError: (error) =>
                      toast.error(t("commissionDeals.referrerBonus.failed"), {
                        description: errorText(error),
                      }),
                  })
                }
              >
                {t("commissionDeals.referrerBonus.markPaid")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>
                {t("commissionDeals.referrerBonus.cancel")}
              </Button>
            </div>
          )}
          {bonus.status === "suggested" && cancelling && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                className="min-w-48 flex-1"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={t("commissionDeals.referrerBonus.cancelReason")}
                aria-label={t("commissionDeals.referrerBonus.cancelReason")}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(
                    { id: bonus.id, reason: cancelReason.trim() || null },
                    {
                      onSuccess: () => setCancelling(false),
                      onError: (error) =>
                        toast.error(t("commissionDeals.referrerBonus.failed"), {
                          description: errorText(error),
                        }),
                    },
                  )
                }
              >
                {t("commissionDeals.referrerBonus.confirmCancel")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                {t("commissionDeals.referrerBonus.keepCancel")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
