import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  DashboardPanel,
  MoneyCardsRow,
  MoneyTrendChart,
  PeriodPicker,
  PipelineStagesPanel,
  ProcessingSummaryPanel,
  RankedListPanel,
  StatRowsPanel,
  englishPeriodLabels,
  overviewPeriodRange,
  previousPeriodRange,
  readStoredPeriod,
  writeStoredPeriod,
  useStoredPeriod,
  type MoneyCardSpec,
  type PeriodLabels,
  type PeriodValue,
} from "../../components/dashboard";
import type { MoneyFigure, OverviewAdapter, PeriodRange } from "../../adapters/overview";
import { englishTourLabels, useTour, useTourPlaceholderData } from "../../components/tour";
import { createPlaceholderOverviewAdapter } from "../../lib/tour-placeholders";
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

const NO_MONEY_FIGURES: { data: Record<string, MoneyFigure>; loading: boolean } = {
  data: {},
  loading: false,
};
const NO_TREND = { data: [], loading: false };
const NO_STAGES = { data: [], loading: false, error: false };
const NO_RANKED = { data: { rows: [], totalText: "" }, loading: false };
const NO_PROCESSING = { data: undefined, loading: false, error: false };
const NO_STAT_ROWS = { data: [], loading: false, error: false };

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
  const providedWidgets: Record<OverviewWidget, boolean> = {
    moneyCards: adapter.useMoneyFigures !== undefined,
    trendChart: adapter.useMoneyTrend !== undefined,
    stages: adapter.useInvoiceStages !== undefined,
    topSuppliers: adapter.useTopSuppliers !== undefined,
    spendByCompany: adapter.useSpendByCompany !== undefined,
    processing: adapter.useProcessingSummary !== undefined,
    openItems: adapter.useOpenItemsSummary !== undefined,
    bank: adapter.useBankSummary !== undefined,
  };
  const show = (widget: OverviewWidget) => widgets.includes(widget) && providedWidgets[widget];

  const [moneyPeriods, setMoneyPeriod] = useMoneyCardPeriods(moneyCards);
  const [trendPeriod, setTrendPeriod] = useStoredPeriod("chart");
  const [stagesPeriod, setStagesPeriod] = useStoredPeriod("stages");
  const [suppliersPeriod, setSuppliersPeriod] = useStoredPeriod("suppliers");
  const [companiesPeriod, setCompaniesPeriod] = useStoredPeriod("companies");
  const [processingPeriod, setProcessingPeriod] = useStoredPeriod("processing");

  const trendRange = useMemo(
    () => overviewPeriodRange(trendPeriod.period, new Date(), trendPeriod),
    [trendPeriod],
  );
  const stagesRange = useMemo(
    () => overviewPeriodRange(stagesPeriod.period, new Date(), stagesPeriod),
    [stagesPeriod],
  );
  const suppliersRange = useMemo(
    () => overviewPeriodRange(suppliersPeriod.period, new Date(), suppliersPeriod),
    [suppliersPeriod],
  );
  const companiesRange = useMemo(
    () => overviewPeriodRange(companiesPeriod.period, new Date(), companiesPeriod),
    [companiesPeriod],
  );
  const processingRange = useMemo(
    () => overviewPeriodRange(processingPeriod.period, new Date(), processingPeriod),
    [processingPeriod],
  );

  const moneyRanges = useMemo(() => {
    const ranges: Record<string, PeriodRange> = {};
    for (const card of moneyCards) {
      const period = moneyPeriods[card.key];
      ranges[card.key] = overviewPeriodRange(period.period, new Date(), period);
    }
    return ranges;
  }, [moneyCards, moneyPeriods]);
  const realMoneyFigures = (adapter.useMoneyFigures ?? (() => NO_MONEY_FIGURES))(moneyRanges);
  const realTrend = (adapter.useMoneyTrend ?? (() => NO_TREND))(trendRange);
  const realStages = (adapter.useInvoiceStages ?? (() => NO_STAGES))(stagesRange);
  const realSuppliers = (adapter.useTopSuppliers ?? (() => NO_RANKED))(suppliersRange);
  const realCompanies = (adapter.useSpendByCompany ?? (() => NO_RANKED))(companiesRange);
  const realProcessing = (adapter.useProcessingSummary ?? (() => NO_PROCESSING))(processingRange);
  const realOpenItems = (adapter.useOpenItemsSummary ?? (() => NO_STAT_ROWS))();
  const realBank = (adapter.useBankSummary ?? (() => NO_STAT_ROWS))();

  const fallbackPlaceholderAdapter = useMemo(
    () => createPlaceholderOverviewAdapter(undefined, adapter.formatMoney),
    [adapter.formatMoney],
  );
  const samples = placeholderAdapter ?? fallbackPlaceholderAdapter;

  const sampleMoneyFigures = (samples.useMoneyFigures ?? (() => NO_MONEY_FIGURES))(moneyRanges);
  const sampleTrend = (samples.useMoneyTrend ?? (() => NO_TREND))(trendRange);
  const sampleStages = (samples.useInvoiceStages ?? (() => NO_STAGES))(stagesRange);
  const sampleSuppliers = (samples.useTopSuppliers ?? (() => NO_RANKED))(suppliersRange);
  const sampleCompanies = (samples.useSpendByCompany ?? (() => NO_RANKED))(companiesRange);
  const sampleProcessing = (samples.useProcessingSummary ?? (() => NO_PROCESSING))(processingRange);
  const sampleOpenItems = (samples.useOpenItemsSummary ?? (() => NO_STAT_ROWS))();
  const sampleBank = (samples.useBankSummary ?? (() => NO_STAT_ROWS))();

  const tour = useTour();
  const tourLabels = tour?.labels ?? englishTourLabels;
  const wantsSampleData = useTourPlaceholderData();

  const moneyIsEmpty = Object.values(realMoneyFigures.data).every(
    (figure) => !figure.loading && figure.value === 0,
  );
  const trendIsEmpty = !realTrend.loading && realTrend.data.length === 0;
  const stagesIsEmpty = !realStages.loading && realStages.data.length === 0;
  const suppliersIsEmpty = !realSuppliers.loading && realSuppliers.data.rows.length === 0;
  const companiesIsEmpty = !realCompanies.loading && realCompanies.data.rows.length === 0;
  const processingIsEmpty = !realProcessing.loading && realProcessing.data === undefined;
  const openItemsIsEmpty = !realOpenItems.loading && realOpenItems.data.length === 0;
  const bankIsEmpty = !realBank.loading && realBank.data.length === 0;

  const showSample = (isEmpty: boolean) => wantsSampleData && isEmpty;
  const showingSampleData =
    showSample(moneyIsEmpty) ||
    showSample(trendIsEmpty) ||
    showSample(stagesIsEmpty) ||
    showSample(suppliersIsEmpty) ||
    showSample(companiesIsEmpty) ||
    showSample(processingIsEmpty) ||
    showSample(openItemsIsEmpty) ||
    showSample(bankIsEmpty);

  const moneyFigures = showSample(moneyIsEmpty) ? sampleMoneyFigures : realMoneyFigures;
  const trend = showSample(trendIsEmpty) ? sampleTrend : realTrend;
  const stages = showSample(stagesIsEmpty) ? sampleStages : realStages;
  const suppliers = showSample(suppliersIsEmpty) ? sampleSuppliers : realSuppliers;
  const companies = showSample(companiesIsEmpty) ? sampleCompanies : realCompanies;
  const processing = showSample(processingIsEmpty) ? sampleProcessing : realProcessing;
  const openItems = showSample(openItemsIsEmpty) ? sampleOpenItems : realOpenItems;
  const bank = showSample(bankIsEmpty) ? sampleBank : realBank;

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
              <MoneyCardsRow
                cards={moneyCards}
                figures={moneyFigures.data}
                periods={moneyPeriods}
                onPeriodChange={setMoneyPeriod}
                periodLabels={periodLabels}
                formatMoney={adapter.formatMoney}
                formatDay={adapter.formatDay}
              />
            </section>
          )}

          {show("trendChart") && (
            <DashboardPanel
              dataTour="overview-trend-chart"
              title={labels.trendChart.title}
              headerRight={
                <PeriodPicker
                  value={trendPeriod}
                  onChange={setTrendPeriod}
                  labels={periodLabels}
                  formatDay={adapter.formatDay}
                />
              }
              className="overflow-hidden"
            >
              <div className="mt-2">
                <MoneyTrendChart
                  data={trend.data}
                  loading={trend.loading}
                  incomingLabel={labels.trendChart.incoming}
                  outgoingLabel={labels.trendChart.outgoing}
                  formatMoney={adapter.formatMoney}
                  formatMoneyCompact={adapter.formatMoneyCompact}
                />
              </div>
            </DashboardPanel>
          )}
        </div>
      )}

      {(show("stages") || show("topSuppliers")) && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {show("stages") && (
            <div className="min-w-0 lg:col-span-2">
              <PipelineStagesPanel
                dataTour="overview-stages"
                title={labels.stagesTitle}
                stages={stages.data}
                loading={stages.loading}
                error={stages.error}
                period={stagesPeriod}
                onPeriodChange={setStagesPeriod}
                periodLabels={periodLabels}
                formatDay={adapter.formatDay}
                className="h-full"
              />
            </div>
          )}
          {show("topSuppliers") && (
            <RankedListPanel
              dataTour="overview-top-suppliers"
              title={labels.topSuppliersTitle(suppliers.data.rows.length)}
              totalLabel={labels.rankTotal(suppliers.data.totalText)}
              rows={suppliers.data.rows}
              loading={suppliers.loading}
              period={suppliersPeriod}
              onPeriodChange={setSuppliersPeriod}
              periodLabels={periodLabels}
              formatDay={adapter.formatDay}
            />
          )}
        </div>
      )}

      {(show("processing") || show("spendByCompany") || show("openItems") || show("bank")) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {show("processing") && (
            <ProcessingSummaryPanel
              dataTour="overview-processing"
              title={labels.processing.title}
              seeAllLabel={labels.processing.seeAll}
              seeAllTo={links.processingLog}
              summary={processing.data}
              loading={processing.loading}
              error={processing.error}
              labels={{
                processed: labels.processing.processed,
                recognized: labels.processing.recognized,
                needsReview: labels.processing.needsReview,
                errors: labels.processing.errors,
                channelsPrefix: labels.processing.channelsPrefix,
              }}
              period={processingPeriod}
              onPeriodChange={setProcessingPeriod}
              periodLabels={periodLabels}
              formatDay={adapter.formatDay}
            />
          )}
          {show("spendByCompany") && (
            <RankedListPanel
              dataTour="overview-spend-by-company"
              title={labels.spendByCompanyTitle(companies.data.rows.length)}
              totalLabel={labels.rankTotal(companies.data.totalText)}
              rows={companies.data.rows}
              loading={companies.loading}
              period={companiesPeriod}
              onPeriodChange={setCompaniesPeriod}
              periodLabels={periodLabels}
              formatDay={adapter.formatDay}
            />
          )}
          {show("openItems") && (
            <StatRowsPanel
              dataTour="overview-open-items"
              title={labels.openItems.title}
              rows={openItems.data}
              loading={openItems.loading}
              emptyText={labels.openItems.empty}
              footerLink={{ to: links.openItems, label: labels.openItems.seeAll }}
            />
          )}
          {show("bank") && (
            <StatRowsPanel
              dataTour="overview-bank"
              title={labels.bank.title}
              rows={bank.data}
              loading={bank.loading}
              footerLink={{ to: links.bank, label: labels.bank.seeAll }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function useMoneyCardPeriods(
  cards: MoneyCardSpec[],
): [Record<string, PeriodValue>, (cardKey: string, value: PeriodValue) => void] {
  const [periods, setPeriods] = useState<Record<string, PeriodValue>>(() => {
    const initial: Record<string, PeriodValue> = {};
    for (const card of cards) initial[card.key] = readStoredPeriod(`card.${card.key}`);
    return initial;
  });
  const setPeriod = (cardKey: string, value: PeriodValue) => {
    setPeriods((current) => ({ ...current, [cardKey]: value }));
    writeStoredPeriod(`card.${cardKey}`, value);
  };
  return [periods, setPeriod];
}

export { previousPeriodRange };

function SampleDataChip({ label }: { label: string }) {
  return (
    <span className="mb-3 inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}
