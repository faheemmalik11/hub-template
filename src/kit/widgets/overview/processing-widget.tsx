import {
  ProcessingSummaryPanel,
  englishPeriodLabels,
  type PeriodLabels,
} from "../../components/dashboard";
import type { OverviewAdapter } from "../../adapters/overview";
import { useWidgetData } from "./use-widget-data";

export interface ProcessingWidgetLabels {
  title: string;
  seeAll: string;
  processed: string;
  recognized: string;
  needsReview: string;
  errors: string;
  channelsPrefix: string;
}

export interface ProcessingWidgetProps {
  adapter: OverviewAdapter;
  sampleAdapter?: OverviewAdapter;
  labels: ProcessingWidgetLabels;
  seeAllTo: string;
  periodLabels?: PeriodLabels;
  onShowingSample?: (showing: boolean) => void;
}

const NOTHING = { data: undefined, loading: false, error: false };

export function ProcessingWidget({
  adapter,
  sampleAdapter,
  labels,
  seeAllTo,
  periodLabels = englishPeriodLabels,
  onShowingSample,
}: ProcessingWidgetProps) {
  const widget = useWidgetData({
    storageKey: "processing",
    read: (range) => (adapter.useProcessingSummary ?? (() => NOTHING))(range),
    readSample: (range) =>
      ((sampleAdapter ?? adapter).useProcessingSummary ?? (() => NOTHING))(range),
    isEmpty: (summary) => summary === undefined,
  });
  onShowingSample?.(widget.showingSample);

  return (
    <ProcessingSummaryPanel
      dataTour="overview-processing"
      title={labels.title}
      seeAllLabel={labels.seeAll}
      seeAllTo={seeAllTo}
      summary={widget.data}
      loading={widget.loading}
      error={widget.error}
      labels={{
        processed: labels.processed,
        recognized: labels.recognized,
        needsReview: labels.needsReview,
        errors: labels.errors,
        channelsPrefix: labels.channelsPrefix,
      }}
      period={widget.period}
      onPeriodChange={widget.setPeriod}
      periodLabels={periodLabels}
      formatDay={adapter.formatDay}
    />
  );
}
