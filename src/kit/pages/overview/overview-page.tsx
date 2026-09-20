import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  englishPeriodLabels,
  previousPeriodRange,
  type MoneyCardSpec,
  type PeriodLabels,
} from "../../components/dashboard";
import type { OverviewAdapter } from "../../adapters/overview";
import { englishTourLabels, useTour } from "../../components/tour";
import { createPlaceholderOverviewAdapter } from "../../lib/tour-placeholders";
import {
  MoneyCardsWidget,
  ProcessingWidget,
  RankedListWidget,
  StagesWidget,
  StatRowsWidget,
  TrendChartWidget,
} from "../../widgets/overview";
import { englishOverviewLabels, type OverviewLabels } from "./labels";

export type OverviewWidget =
  | "moneyCards"
  | "trendChart"
  | "stages"
  | "topSuppliers"
  | "spendByCompany"
  | "processing"
  | "openItems"
  | "bank";

const ALL_WIDGETS: OverviewWidget[] = [
  "moneyCards",
  "trendChart",
  "stages",
  "topSuppliers",
  "spendByCompany",
  "processing",
  "openItems",
  "bank",
];

export interface OverviewLinks {
  processingLog: string;
  openItems: string;
  bank: string;
}

export interface OverviewPageProps {
  adapter: OverviewAdapter;
  links: OverviewLinks;
  placeholderAdapter?: OverviewAdapter;
  moneyCards: MoneyCardSpec[];
  widgets?: OverviewWidget[];
  alertStrip?: ReactNode;
  labels?: OverviewLabels;
  periodLabels?: PeriodLabels;
}

export function OverviewPage({
  adapter,
  links,
  placeholderAdapter,
  moneyCards,
  widgets = ALL_WIDGETS,
  alertStrip,
  labels = englishOverviewLabels,
  periodLabels = englishPeriodLabels,
}: OverviewPageProps) {
  const provided: Record<OverviewWidget, boolean> = {
    moneyCards: adapter.useMoneyFigures !== undefined,
    trendChart: adapter.useMoneyTrend !== undefined,
    stages: adapter.useInvoiceStages !== undefined,
    topSuppliers: adapter.useTopSuppliers !== undefined,
    spendByCompany: adapter.useSpendByCompany !== undefined,
    processing: adapter.useProcessingSummary !== undefined,
    openItems: adapter.useOpenItemsSummary !== undefined,
    bank: adapter.useBankSummary !== undefined,
  };
  const show = (widget: OverviewWidget) => widgets.includes(widget) && provided[widget];

  const fallbackSamples = useMemo(
    () => createPlaceholderOverviewAdapter(undefined, adapter.formatMoney),
    [adapter.formatMoney],
  );
  const samples = placeholderAdapter ?? fallbackSamples;

  const tour = useTour();
  const tourLabels = tour?.labels ?? englishTourLabels;
  const [sampleWidgets, setSampleWidgets] = useState<Record<string, boolean>>({});
  const noteSample = (widget: string) => (showing: boolean) =>
    setSampleWidgets((current) =>
      current[widget] === showing ? current : { ...current, [widget]: showing },
    );
  const showingSampleData = Object.values(sampleWidgets).some(Boolean);

  const shared = { adapter, sampleAdapter: samples, periodLabels };

  return (
    <div>
      {alertStrip}

      {showingSampleData && <SampleDataChip label={tourLabels.sampleData} />}

      {(show("moneyCards") || show("trendChart")) && (
        <div className="grid gap-3 lg:grid-cols-3">
          {show("moneyCards") && (
            <section
              data-tour="overview-money-cards"
              className="min-w-0 rounded-2xl bg-brand-wash p-4 lg:col-span-2"
            >
              <MoneyCardsWidget
                {...shared}
                cards={moneyCards}
                onShowingSample={noteSample("moneyCards")}
              />
            </section>
          )}

          {show("trendChart") && (
            <TrendChartWidget
              {...shared}
              title={labels.trendChart.title}
              incomingLabel={labels.trendChart.incoming}
              outgoingLabel={labels.trendChart.outgoing}
              onShowingSample={noteSample("trendChart")}
            />
          )}
        </div>
      )}

      {(show("stages") || show("topSuppliers")) && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {show("stages") && (
            <div className="min-w-0 lg:col-span-2">
              <StagesWidget
                {...shared}
                title={labels.stagesTitle}
                className="h-full"
                onShowingSample={noteSample("stages")}
              />
            </div>
          )}
          {show("topSuppliers") && (
            <RankedListWidget
              adapter={adapter}
              read={adapter.useTopSuppliers}
              readSample={samples.useTopSuppliers}
              storageKey="suppliers"
              dataTour="overview-top-suppliers"
              title={labels.topSuppliersTitle}
              totalLabel={labels.rankTotal}
              periodLabels={periodLabels}
              onShowingSample={noteSample("topSuppliers")}
            />
          )}
        </div>
      )}

      {(show("processing") || show("spendByCompany") || show("openItems") || show("bank")) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {show("processing") && (
            <ProcessingWidget
              {...shared}
              labels={labels.processing}
              seeAllTo={links.processingLog}
              onShowingSample={noteSample("processing")}
            />
          )}
          {show("spendByCompany") && (
            <RankedListWidget
              adapter={adapter}
              read={adapter.useSpendByCompany}
              readSample={samples.useSpendByCompany}
              storageKey="companies"
              dataTour="overview-spend-by-company"
              title={labels.spendByCompanyTitle}
              totalLabel={labels.rankTotal}
              periodLabels={periodLabels}
              onShowingSample={noteSample("spendByCompany")}
            />
          )}
          {show("openItems") && (
            <StatRowsWidget
              read={adapter.useOpenItemsSummary}
              readSample={samples.useOpenItemsSummary}
              dataTour="overview-open-items"
              title={labels.openItems.title}
              emptyText={labels.openItems.empty}
              footerLink={{ to: links.openItems, label: labels.openItems.seeAll }}
              onShowingSample={noteSample("openItems")}
            />
          )}
          {show("bank") && (
            <StatRowsWidget
              read={adapter.useBankSummary}
              readSample={samples.useBankSummary}
              dataTour="overview-bank"
              title={labels.bank.title}
              footerLink={{ to: links.bank, label: labels.bank.seeAll }}
              onShowingSample={noteSample("bank")}
            />
          )}
        </div>
      )}
    </div>
  );
}

export { previousPeriodRange };

function SampleDataChip({ label }: { label: string }) {
  return (
    <span className="mb-3 inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}
