import {
  RankedListPanel,
  englishPeriodLabels,
  type PeriodLabels,
} from "../../components/dashboard";
import type { OverviewAdapter } from "../../adapters/overview";
import { useWidgetData } from "./use-widget-data";

type RankedRead = NonNullable<OverviewAdapter["useTopSuppliers"]>;

export interface RankedListWidgetProps {
  adapter: OverviewAdapter;
  read: RankedRead | undefined;
  readSample: RankedRead | undefined;
  storageKey: string;
  dataTour: string;
  title: (count: number) => string;
  totalLabel: (total: string) => string;
  periodLabels?: PeriodLabels;
  onShowingSample?: (showing: boolean) => void;
}

const NOTHING = { data: { rows: [], totalText: "" }, loading: false };

export function RankedListWidget({
  adapter,
  read,
  readSample,
  storageKey,
  dataTour,
  title,
  totalLabel,
  periodLabels = englishPeriodLabels,
  onShowingSample,
}: RankedListWidgetProps) {
  const widget = useWidgetData({
    storageKey,
    read: (range) => (read ?? (() => NOTHING))(range),
    readSample: (range) => (readSample ?? read ?? (() => NOTHING))(range),
    isEmpty: (value) => value.rows.length === 0,
  });
  onShowingSample?.(widget.showingSample);

  return (
    <RankedListPanel
      dataTour={dataTour}
      title={title(widget.data.rows.length)}
      totalLabel={totalLabel(widget.data.totalText)}
      rows={widget.data.rows}
      loading={widget.loading}
      period={widget.period}
      onPeriodChange={widget.setPeriod}
      periodLabels={periodLabels}
      formatDay={adapter.formatDay}
    />
  );
}
