import {
  PipelineStagesPanel,
  englishPeriodLabels,
  type PeriodLabels,
} from "../../components/dashboard";
import type { OverviewAdapter } from "../../adapters/overview";
import { useWidgetData } from "./use-widget-data";

export interface StagesWidgetProps {
  adapter: OverviewAdapter;
  sampleAdapter?: OverviewAdapter;
  title: string;
  periodLabels?: PeriodLabels;
  className?: string;
  onShowingSample?: (showing: boolean) => void;
}

const NOTHING = { data: [], loading: false, error: false };

export function StagesWidget({
  adapter,
  sampleAdapter,
  title,
  periodLabels = englishPeriodLabels,
  className,
  onShowingSample,
}: StagesWidgetProps) {
  const widget = useWidgetData({
    storageKey: "stages",
    read: (range) => (adapter.useInvoiceStages ?? (() => NOTHING))(range),
    readSample: (range) => ((sampleAdapter ?? adapter).useInvoiceStages ?? (() => NOTHING))(range),
    isEmpty: (rows) => rows.length === 0,
  });
  onShowingSample?.(widget.showingSample);

  return (
    <PipelineStagesPanel
      dataTour="overview-stages"
      title={title}
      stages={widget.data}
      loading={widget.loading}
      error={widget.error}
      period={widget.period}
      onPeriodChange={widget.setPeriod}
      periodLabels={periodLabels}
      formatDay={adapter.formatDay}
      className={className}
    />
  );
}
