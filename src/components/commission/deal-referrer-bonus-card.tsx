import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBonusSettings,
  useCancelReferrerBonus,
  useCreateReferrerCreditNote,
  useCustomer,
  useDealReferrerBonus,
  useMarkReferrerBonusPaid,
  useOutgoingInvoices,
  useReferrerBonusTier,
  useSuggestReferrerBonus,
} from "@/data";
import type { BonusSettings, Deal, DealStage } from "@/data";
import { errorText, formatEUR } from "@/lib/data/format";
import type { OutgoingInvoice } from "@/lib/data/types";
import { useTranslation } from "@/lib/i18n";

function tierAmountOf(settings: BonusSettings, tier: number): number {
  if (tier <= 1) return settings.referrer_tier1_amount;
  if (tier === 2) return settings.referrer_tier2_amount;
  if (tier === 3) return settings.referrer_tier3_amount;
  return settings.referrer_tier4plus_amount;
}

function dealStageReached(deal: Deal, invoices: OutgoingInvoice[], stage: DealStage): boolean {
  if (stage === "notarised") return !!deal.notarised_on;
  if (stage === "invoiced") return deal.status === "invoiced";
  const commissionInvoices = invoices.filter((invoice) => invoice.kind === "commission");
  return (
    commissionInvoices.length > 0 &&
    commissionInvoices.every((invoice) => invoice.status === "paid")
  );
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
  const invoicesQ = useOutgoingInvoices({ dealId: deal.id });
  const createCreditNote = useCreateReferrerCreditNote(deal.id);

  const [amount, setAmount] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  if (!referrerCustomerId) return null;
  if (!settingsQ.data || bonusQ.data === undefined || tierQ.data === undefined) return null;

  const bonus = bonusQ.data;
  const suggestedAmount = tierAmountOf(settingsQ.data, tierQ.data);
  const creditNote = (invoicesQ.data ?? []).find((invoice) => invoice.kind === "referral_credit");
  const payoutStageReached = dealStageReached(
    deal,
    invoicesQ.data ?? [],
    settingsQ.data.referrer_payout_timing,
  );

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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      disabled={markPaid.isPending || !payoutStageReached}
                      onClick={() =>
                        markPaid.mutate(bonus.id, {
                          onSuccess: () =>
                            toast.success(t("commissionDeals.referrerBonus.markedPaid")),
                          onError: (error) =>
                            toast.error(t("commissionDeals.referrerBonus.failed"), {
                              description: errorText(error),
                            }),
                        })
                      }
                    >
                      {t("commissionDeals.referrerBonus.markPaid")}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!payoutStageReached && (
                  <TooltipContent>
                    {t(
                      `commissionDeals.referrerBonus.payoutStageNotReached.${settingsQ.data.referrer_payout_timing}`,
                    )}
                  </TooltipContent>
                )}
              </Tooltip>
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
          {bonus.status === "paid" && !creditNote && (
            <div className="mt-3">
              <Button
                size="sm"
                disabled={createCreditNote.isPending}
                onClick={() =>
                  createCreditNote.mutate(bonus.id, {
                    onSuccess: () =>
                      toast.success(t("commissionDeals.referrerBonus.creditNoteCreated")),
                    onError: (error) =>
                      toast.error(t("commissionDeals.referrerBonus.failed"), {
                        description: errorText(error),
                      }),
                  })
                }
              >
                {t("commissionDeals.referrerBonus.createCreditNote")}
              </Button>
            </div>
          )}
          {bonus.status === "paid" && creditNote && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("commissionDeals.referrerBonus.creditNoteNote")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
