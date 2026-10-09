import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dealFormOf, calculateDealForm } from "./deal-form";
import {
  useBonusSettings,
  useDealBonuses,
  useDealCommissionPaid,
  useEmployees,
  useSuggestBonuses,
} from "@/data";
import type { BonusType, Deal } from "@/data";
import {
  suggestBonuses,
  type BonusBreakdownLine,
  type BonusRuleSettings,
  type BonusSuggestion,
} from "@/kit/lib/commission/bonuses";
import { errorText, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function cents(euros: number): number {
  return Math.round(euros * 100);
}

export function BonusSuggestionsCard({ deal }: { deal: Deal }) {
  const { t } = useTranslation();
  const settingsQ = useBonusSettings();
  const existingQ = useDealBonuses(deal.id);
  const paidQ = useDealCommissionPaid(deal.id);
  const employeesQ = useEmployees();
  const create = useSuggestBonuses(deal.id);

  if (!settingsQ.data || !existingQ.data || paidQ.data === undefined) return null;
  const settings: BonusRuleSettings = {
    notaryAmountCents: cents(settingsQ.data.notary_amount),
    followUpAmountCents: cents(settingsQ.data.follow_up_amount),
    ownLeadSharePercent: settingsQ.data.own_lead_share_percent,
    companyLeadSharePercent: settingsQ.data.company_lead_share_percent,
    personnelFlatCents: cents(settingsQ.data.personnel_flat_amount),
    companyLeadDeductsCosts: settingsQ.data.company_lead_deducts_costs,
  };
  const commission = calculateDealForm(dealFormOf(deal));
  const suggestions = suggestBonuses(
    {
      notarisedOn: deal.notarised_on,
      ownLead: deal.own_lead,
      fromViewing: deal.from_viewing,
      handledBy: deal.handled_by,
      acquiredBy: deal.acquired_by,
      netCommissionCents: commission.ok
        ? commission.invoices.reduce((sum, invoice) => sum + invoice.totalNetCents, 0)
        : null,
      costsCents: deal.deal_costs.reduce((sum, cost) => sum + cents(cost.amount), 0),
      costsClosed: deal.costs_closed_at !== null,
      allCommissionInvoicesPaid: paidQ.data,
    },
    settings,
  );

  const nameOf = (userId: string | null) =>
    employeesQ.data?.find((employee) => employee.id === userId)?.name ??
    employeesQ.data?.find((employee) => employee.id === userId)?.email ??
    t("commissionDeals.bonuses.nobody");
  const existing = new Map(existingQ.data.map((bonus) => [bonus.bonus_type, bonus]));
  const breakdownText = (lines: BonusBreakdownLine[]) =>
    lines
      .map((line) =>
        t(`commissionDeals.bonuses.line.${line.label}`, {
          amount: formatEUR(line.cents / 100),
          percent: line.percent ?? 0,
        }),
      )
      .join(" · ");

  const createOne = (suggestion: BonusSuggestion) => {
    if (
      suggestion.state !== "ready" ||
      !suggestion.brokerUserId ||
      suggestion.amountCents === null
    ) {
      return;
    }
    create.mutate(
      [
        {
          brokerUserId: suggestion.brokerUserId,
          bonusType: suggestion.type as BonusType,
          earnedOn: suggestion.earnedOn ?? new Date().toISOString().slice(0, 10),
          amount: suggestion.amountCents / 100,
          note: breakdownText(suggestion.breakdown),
        },
      ],
      {
        onSuccess: () => toast.success(t("commissionDeals.bonuses.created")),
        onError: (error) =>
          toast.error(t("commissionDeals.bonuses.failed"), { description: errorText(error) }),
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">
        {t("commissionDeals.bonuses.title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("commissionDeals.bonuses.hint")}</p>
      {suggestions.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{t("commissionDeals.bonuses.none")}</p>
      )}
      <ul className="mt-3 space-y-3">
        {suggestions.map((suggestion) => {
          const done = existing.get(suggestion.type as BonusType);
          return (
            <li key={suggestion.type} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {t(`brokerBonuses.types.${suggestion.type}`)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {nameOf(suggestion.brokerUserId)}
                  </div>
                </div>
                <div className="text-right">
                  {suggestion.amountCents !== null && (
                    <div className="text-sm font-semibold tabular-nums">
                      {formatEUR(suggestion.amountCents / 100)}
                    </div>
                  )}
                  {done ? (
                    <Badge variant="outline">
                      {t("commissionDeals.bonuses.created")} ·{" "}
                      {t(`brokerBonuses.status.${done.status}`)}
                    </Badge>
                  ) : suggestion.state === "ready" ? (
                    <Button
                      size="sm"
                      disabled={create.isPending}
                      onClick={() => createOne(suggestion)}
                    >
                      {t("commissionDeals.bonuses.create")}
                    </Button>
                  ) : suggestion.state === "waiting" ? (
                    <Badge variant="secondary">
                      {t("commissionDeals.bonuses.waiting", {
                        reasons: suggestion.waitingFor
                          .map((reason) => t(`commissionDeals.bonuses.waitingFor.${reason}`))
                          .join(", "),
                      })}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("commissionDeals.bonuses.noRemainder")}</Badge>
                  )}
                </div>
              </div>
              {suggestion.breakdown.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {breakdownText(suggestion.breakdown)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
