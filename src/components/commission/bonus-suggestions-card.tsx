import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dealFormOf, calculateDealForm } from "./deal-form";
import type { DealAnchor, DealTab } from "./deal-tabs";
import { FixLink } from "./fix-link";
import { UnsavedDealChangesNote } from "./unsaved-deal-changes-note";
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
import type { BonusWaitingFor } from "@/kit/lib/commission/bonuses";

function cents(euros: number): number {
  return Math.round(euros * 100);
}

const ANCHOR_FOR_WAITING_REASON: Partial<Record<BonusWaitingFor, DealAnchor>> = {
  broker: { tab: "ownership", id: "field-handled-by" },
  costs_closed: { tab: "ownership", id: "field-costs-closed" },
};

export function BonusSuggestionsCard({
  deal,
  unsavedChanges,
  onJumpToField,
}: {
  deal: Deal;
  unsavedChanges: boolean;
  onJumpToField?: (tab: DealTab, id: string) => void;
}) {
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
      invoicesCreated: deal.status === "invoiced",
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

  // A suggestion reaching "ready" never creates its broker_bonuses row by itself -- someone still
  // has to press Create. Deliberate: management keeps approving every bonus suggestion by hand,
  // not a missing automation.
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
      {unsavedChanges && <UnsavedDealChangesNote />}
      <ul className="mt-3 space-y-3">
        {suggestions.map((suggestion) => {
          const done = existing.get(suggestion.type as BonusType);
          return (
            <li key={suggestion.type} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
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
                    <div>
                      <Button
                        size="sm"
                        disabled={create.isPending || unsavedChanges}
                        onClick={() => createOne(suggestion)}
                      >
                        {t("commissionDeals.bonuses.create")}
                      </Button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("commissionDeals.bonuses.createHint")}
                      </p>
                    </div>
                  ) : suggestion.state === "waiting" ? (
                    <Badge variant="secondary">{t("commissionDeals.bonuses.notReady")}</Badge>
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
              {suggestion.state === "waiting" && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-foreground">
                    {t("commissionDeals.bonuses.waitingForTitle")}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {suggestion.waitingFor.map((reason) => {
                      const anchor = ANCHOR_FOR_WAITING_REASON[reason];
                      return (
                        <li
                          key={reason}
                          className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"
                        >
                          <span>• {t(`commissionDeals.bonuses.waitingFor.${reason}`)}</span>
                          {anchor && onJumpToField && (
                            <FixLink onClick={() => onJumpToField(anchor.tab, anchor.id)} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
