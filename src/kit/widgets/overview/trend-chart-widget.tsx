import {
  DashboardPanel,
  MoneyTrendChart,
  PeriodPicker,
  englishPeriodLabels,
  type PeriodLabels,
} from "../../components/dashboard";
import type { OverviewAdapter } from "../../adapters/overview";
import { useWidgetData } from "./use-widget-data";

export interface TrendChartWidgetProps {
  adapter: OverviewAdapter;
  sampleAdapter?: OverviewAdapter;
  title: string;
  incomingLabel: string;
  outgoingLabel: string;
  periodLabels?: PeriodLabels;
  onShowingSample?: (showing: boolean) => void;
}

const NOTHING = { data: [], loading: false };

export function TrendChartWidget({
  adapter,
  sampleAdapter,
  title,
  incomingLabel,
  outgoingLabel,
  periodLabels = englishPeriodLabels,
  onShowingSample,
}: TrendChartWidgetProps) {
  const widget = useWidgetData({
    storageKey: "chart",
    read: (range) => (adapter.useMoneyTrend ?? (() => NOTHING))(range),
    readSample: (range) => ((sampleAdapter ?? adapter).useMoneyTrend ?? (() => NOTHING))(range),
    isEmpty: (rows) => rows.length === 0,
  });
  onShowingSample?.(widget.showingSample);

  return (
    <DashboardPanel
      dataTour="overview-trend-chart"
      title={title}
      headerRight={
        <PeriodPicker
          value={widget.period}
          onChange={widget.setPeriod}
          labels={periodLabels}
          formatDay={adapter.formatDay}
        />
      }
      className="overflow-hidden"
    >
      <div className="mt-2">
        <MoneyTrendChart
          data={widget.data}
          loading={widget.loading}
          incomingLabel={incomingLabel}
          outgoingLabel={outgoingLabel}
          formatMoney={adapter.formatMoney}
          formatMoneyCompact={adapter.formatMoneyCompact}
        />
      </div>
    </DashboardPanel>
  );
}
