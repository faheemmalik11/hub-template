import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, FileOutput, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { CHIP } from "@/components/dashboard/stat-tile";
import type { OverviewPeriod } from "@/components/dashboard/periods";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import {
  formatEUR,
  inDateRange,
  overviewPeriodRange,
  previousPeriodRange,
} from "@/lib/data/format";
import { useOutgoingInvoices, useOverviewInvoices } from "@/data";
import { COSTANALYSIS_SCOPE_ALL, useCostAnalysisScope } from "@/lib/data/use-bwa-scope";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The three figures, each on its OWN period. The invoice cards carry their count under the sum,
 * so "how much" and "how many" live on one card instead of two.
 *
 * A card owns its range rather than inheriting one from the page, so "incoming volume this month"
 * can sit beside "gross profit this year" without either being wrong. React Query keys on the
 * range, so cards left on the same period share a single request: four cards on the default cost
 * one fetch, not four.
 *
 * THE DELTA IS NOT SEMANTIC COLOUR. Up is green only where up is genuinely better, which is why
 * `higherIsBetter` is per card: incoming volume up 40% painted green would congratulate the reader
 * on spending more. And no delta renders when the previous period is zero, because a percentage
 * against nothing is either infinite or meaningless and "+100%" reads as a real trend.
 */
type CardKey = "eingang" | "ausgang" | "grossProfit";

const CARDS: {
  key: CardKey;
  icon: LucideIcon;
  to: string;
  iconTint: string;
  higherIsBetter: boolean;
}[] = [
  {
    key: "eingang",
    icon: FileText,
    to: "/incoming-invoices",
    iconTint: CHIP.brand,
    // Costs rising is not good news.
    higherIsBetter: false,
  },
  {
    key: "ausgang",
    icon: FileOutput,
    to: "/outgoing-invoices",
    iconTint: CHIP.neutral,
    higherIsBetter: true,
  },
  {
    key: "grossProfit",
    icon: BarChart3,
    to: "/reports",
    iconTint: CHIP.brand,
    higherIsBetter: true,
  },
];

export function MoneyCards() {
  return (
    <div className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {CARDS.map((c) => (
        <MoneyCard key={c.key} config={c} />
      ))}
    </div>
  );
}

function MoneyCard({ config }: { config: (typeof CARDS)[number] }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useStoredPeriod(`card.${config.key}`);
  const range = useMemo(
    () =>
      overviewPeriodRange(period.period, new Date(), {
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
    [period],
  );
  const before = useMemo(() => previousPeriodRange(range), [range]);

  const invoicesQ = useOverviewInvoices(range.fromDate, range.toDate);
  const invoicesBeforeQ = useOverviewInvoices(before.fromDate, before.toDate);
  const outgoingQ = useOutgoingInvoices();
  const costAnalysis = useCostAnalysisScope(
    useMemo(
      () => ({ ...COSTANALYSIS_SCOPE_ALL, fromDate: range.fromDate, toDate: range.toDate }),
      [range],
    ),
  );
  // Second scope for the period before, so gross profit can show the same trend as the invoice
  // cards. It shares the invoice cards' query cache, so this is not four more round trips.
  const costAnalysisBefore = useCostAnalysisScope(
    useMemo(
      () => ({ ...COSTANALYSIS_SCOPE_ALL, fromDate: before.fromDate, toDate: before.toDate }),
      [before],
    ),
  );

  // Issued only, for the count AND the sum: a draft was never sent and a voided one was cancelled,
  // so neither is money anybody owes.
  const outgoingRows = (fromDate?: string | null, toDate?: string | null) =>
    (outgoingQ.data ?? []).filter(
      (r) =>
        inDateRange(r.invoice_date, { fromDate: fromDate ?? null, toDate: toDate ?? null }) &&
        r.status !== "draft" &&
        r.status !== "voided",
    );
  const outgoingTotal = (fromDate?: string | null, toDate?: string | null) =>
    outgoingRows(fromDate, toDate).reduce((s, r) => s + (r.amount_gross ?? 0), 0);

  const rows = invoicesQ.data ?? [];
  const rowsBefore = invoicesBeforeQ.data ?? [];
  const value =
    config.key === "eingang"
      ? rows.reduce((s, r) => s + (r.amount_gross ?? 0), 0)
      : config.key === "ausgang"
        ? outgoingTotal(range.fromDate, range.toDate)
        : (costAnalysis.rowByKey.get("gross_profit")?.amount ?? 0);

  // The sum answers "how much", the count answers "how many": both belong to the same card.
  const count =
    config.key === "eingang"
      ? rows.length
      : config.key === "ausgang"
        ? outgoingRows(range.fromDate, range.toDate).length
        : undefined;

  const previous =
    !before.fromDate || !before.toDate
      ? undefined
      : config.key === "eingang"
        ? rowsBefore.reduce((s, r) => s + (r.amount_gross ?? 0), 0)
        : config.key === "ausgang"
          ? outgoingTotal(before.fromDate, before.toDate)
          : (costAnalysisBefore.rowByKey.get("gross_profit")?.amount ?? undefined);

  const loading =
    config.key === "ausgang"
      ? outgoingQ.isLoading
      : config.key === "grossProfit"
        ? costAnalysis.isLoading
        : invoicesQ.isLoading;

  return (
    <KpiCard
      icon={config.icon}
      iconTint={config.iconTint}
      label={t(`home.money.${config.key}`)}
      to={config.to}
      loading={loading}
      value={formatEUR(value)}
      delta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {count !== undefined && (
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
              {t("home.money.count", { n: count })}
            </span>
          )}
          <Delta
            value={value}
            previous={previous}
            higherIsBetter={config.higherIsBetter}
            period={period.period}
          />
        </span>
      }
      headerRight={<PeriodPicker value={period} onChange={setPeriod} />}
    />
  );
}

function Delta({
  value,
  previous,
  higherIsBetter,
  period,
}: {
  value: number;
  previous?: number;
  higherIsBetter: boolean;
  period: OverviewPeriod;
}) {
  const { t } = useTranslation();
  if (previous === undefined || previous === 0) return null;
  const pct = ((value - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(pct)) return null;
  const up = pct >= 0;
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
      {t(`home.money.deltaBy.${period}`, { pct: `${up ? "+" : ""}${pct.toFixed(1)}` })}
    </span>
  );
}
