import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEAL_COST_KINDS } from "@/data";
import type { DealCostKind } from "@/data";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { parseDecimal, type CostForm } from "./deal-form";

const EMPTY_COST: CostForm = { kind: "city_fee", description: "", amount: "", incurredOn: "" };

function sanitizeAmountInput(raw: string): string {
  const digitsAndSeparators = raw.replace(/[^0-9.,]/g, "");
  const separatorIndex = digitsAndSeparators.search(/[.,]/);
  if (separatorIndex === -1) return digitsAndSeparators;
  return (
    digitsAndSeparators.slice(0, separatorIndex + 1) +
    digitsAndSeparators.slice(separatorIndex + 1).replace(/[.,]/g, "")
  );
}

export function DealCostsCard({
  costs,
  onChange,
  disabled,
  costsClosed,
  onJumpToField,
}: {
  costs: CostForm[];
  onChange: (next: CostForm[]) => void;
  disabled: boolean;
  costsClosed?: boolean;
  onJumpToField?: (tab: string, id: string) => void;
}) {
  const { t } = useTranslation();
  const setCost = (index: number, patch: Partial<CostForm>) =>
    onChange(costs.map((cost, i) => (i === index ? { ...cost, ...patch } : cost)));
  const total = costs.reduce((sum, cost) => sum + (parseDecimal(cost.amount) ?? 0), 0);
  const availableKindOptions = (index: number) => {
    const chosenByOthers = new Set(
      costs.flatMap((cost, i) => (i === index || cost.kind === "other" ? [] : [cost.kind])),
    );
    return DEAL_COST_KINDS.filter(
      (kind) => kind === "other" || kind === costs[index]?.kind || !chosenByOthers.has(kind),
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("commissionDeals.costs.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("commissionDeals.costs.disclaimer")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={costsClosed ? "secondary" : "outline"}>
            {t(
              costsClosed ? "commissionDeals.costs.closedBadge" : "commissionDeals.costs.openBadge",
            )}
          </Badge>
          {onJumpToField && (
            <button
              type="button"
              onClick={() => onJumpToField("ownership", "field-costs-closed")}
              className="text-xs font-medium text-brand-dark underline-offset-4 hover:underline"
            >
              {t("commissionDeals.costs.changeStatus")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("commissionDeals.costs.hint")}</p>
        {costs.length > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {t("commissionDeals.costs.total", { total: formatEUR(total) })}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {costs.map((cost, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              value={cost.kind}
              onValueChange={(kind) => setCost(index, { kind: kind as DealCostKind })}
              disabled={disabled}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableKindOptions(index).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(`commissionDeals.costs.kind.${kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="min-w-40 flex-1"
              value={cost.description}
              onChange={(event) => setCost(index, { description: event.target.value })}
              placeholder={t("commissionDeals.costs.description")}
              aria-label={t("commissionDeals.costs.description")}
              disabled={disabled}
            />
            <Input
              className="w-28"
              inputMode="decimal"
              value={cost.amount}
              onChange={(event) =>
                setCost(index, { amount: sanitizeAmountInput(event.target.value) })
              }
              placeholder={t("commissionDeals.costs.amount")}
              aria-label={t("commissionDeals.costs.amount")}
              disabled={disabled}
            />
            <DatePicker
              className="w-40"
              value={cost.incurredOn}
              onChange={(value) => setCost(index, { incurredOn: value })}
              ariaLabel={t("commissionDeals.costs.date")}
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(costs.filter((_, i) => i !== index))}
              aria-label={t("commissionDeals.side.remove")}
              disabled={disabled}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        className="mt-3 shadow-none"
        variant="outline"
        size="sm"
        onClick={() => onChange([...costs, EMPTY_COST])}
        disabled={disabled}
      >
        <Plus className="size-4" /> {t("commissionDeals.costs.add")}
      </Button>
    </div>
  );
}
