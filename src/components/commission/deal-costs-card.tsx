import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function DealCostsCard({
  costs,
  onChange,
  disabled,
}: {
  costs: CostForm[];
  onChange: (next: CostForm[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const setCost = (index: number, patch: Partial<CostForm>) =>
    onChange(costs.map((cost, i) => (i === index ? { ...cost, ...patch } : cost)));
  const total = costs.reduce((sum, cost) => sum + (parseDecimal(cost.amount) ?? 0), 0);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {t("commissionDeals.costs.title")}
        </h2>
        {costs.length > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {t("commissionDeals.costs.total", { total: formatEUR(total) })}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("commissionDeals.costs.hint")}</p>

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
                {DEAL_COST_KINDS.map((kind) => (
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
              onChange={(event) => setCost(index, { amount: event.target.value })}
              placeholder={t("commissionDeals.costs.amount")}
              aria-label={t("commissionDeals.costs.amount")}
              disabled={disabled}
            />
            <Input
              className="w-40"
              type="date"
              value={cost.incurredOn}
              onChange={(event) => setCost(index, { incurredOn: event.target.value })}
              aria-label={t("commissionDeals.costs.date")}
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
        className="mt-3"
        variant="outline"
        size="sm"
        onClick={() => onChange([...costs, EMPTY_COST])}
        disabled={disabled}
      >
        <Plus className="size-4" /> {t("commissionDeals.costs.add")}
      </Button>
    </section>
  );
}
