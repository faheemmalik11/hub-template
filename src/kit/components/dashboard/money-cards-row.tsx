import { useMemo, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { KpiCard } from "./kpi-card";
import type { OverviewPeriod } from "./periods";
import { PeriodPicker, type PeriodLabels, type PeriodValue } from "./period-picker";
import { cn } from "../../lib/class-names";

export interface MoneyFigure {
  value: number;
  count?: number;
  previousValue?: number;
  loading: boolean;
}

export interface MoneyCardSpec {
  key: string;
  icon: LucideIcon;
  to: string;
  iconTint: string;
  higherIsBetter: boolean;
  label: string;
  countLabel?: (count: number) => string;
  deltaLabel: (period: OverviewPeriod, percent: string) => string;
}

export function MoneyCardsRow({
  cards,
  figures,
  periods,
  onPeriodChange,
  periodLabels,
  formatMoney,
  formatDay,
  className,
}: {
  cards: MoneyCardSpec[];
  figures: Record<string, MoneyFigure>;
  periods: Record<string, PeriodValue>;
  onPeriodChange: (cardKey: string, value: PeriodValue) => void;
  periodLabels?: PeriodLabels;
  formatMoney: (value: number) => string;
  formatDay: (iso: string) => string;
  className?: string;
}) {
  return (
    <div className={cn("grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {cards.map((card) => (
        <MoneyCard
          key={card.key}
          card={card}
          figure={figures[card.key]}
          period={periods[card.key]}
          onPeriodChange={(value) => onPeriodChange(card.key, value)}
          periodLabels={periodLabels}
          formatMoney={formatMoney}
          formatDay={formatDay}
        />
      ))}
    </div>
  );
}

function MoneyCard({
  card,
  figure,
  period,
  onPeriodChange,
  periodLabels,
  formatMoney,
  formatDay,
}: {
  card: MoneyCardSpec;
  figure: MoneyFigure | undefined;
  period: PeriodValue;
  onPeriodChange: (value: PeriodValue) => void;
  periodLabels?: PeriodLabels;
  formatMoney: (value: number) => string;
  formatDay: (iso: string) => string;
}) {
  const value = figure?.value ?? 0;
  const loading = figure?.loading ?? true;

  return (
    <KpiCard
      icon={card.icon}
      iconTint={card.iconTint}
      label={card.label}
      to={card.to}
      loading={loading}
      value={formatMoney(value)}
      delta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {figure?.count !== undefined && card.countLabel && (
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
              {card.countLabel(figure.count)}
            </span>
          )}
          <MoneyDelta
            value={value}
            previousValue={figure?.previousValue}
            higherIsBetter={card.higherIsBetter}
            period={period.period}
            deltaLabel={card.deltaLabel}
          />
        </span>
      }
      headerRight={
        <PeriodPicker
          value={period}
          onChange={onPeriodChange}
          labels={periodLabels}
          formatDay={formatDay}
        />
      }
    />
  );
}

function MoneyDelta({
  value,
  previousValue,
  higherIsBetter,
  period,
  deltaLabel,
}: {
  value: number;
  previousValue?: number;
  higherIsBetter: boolean;
  period: OverviewPeriod;
  deltaLabel: (period: OverviewPeriod, percent: string) => string;
}): ReactNode {
  const percent = useMemo(() => {
    if (previousValue === undefined || previousValue === 0) return null;
    const raw = ((value - previousValue) / Math.abs(previousValue)) * 100;
    return Number.isFinite(raw) ? raw : null;
  }, [value, previousValue]);

  if (percent === null) return null;
  const up = percent >= 0;
  const good = up === higherIsBetter;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[13px] font-medium",
        good ? "text-success" : "text-danger",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {deltaLabel(period, `${up ? "+" : ""}${percent.toFixed(1)}`)}
    </span>
  );
}
