import { StatRowsPanel } from "../../components/dashboard";
import type { OverviewAdapter } from "../../adapters/overview";
import { useStaticWidgetData } from "./use-widget-data";

type StatRowsRead = NonNullable<OverviewAdapter["useOpenItemsSummary"]>;

export interface StatRowsWidgetProps {
  read: StatRowsRead | undefined;
  readSample: StatRowsRead | undefined;
  dataTour: string;
  title: string;
  emptyText?: string;
  footerLink: { to: string; label: string };
  onShowingSample?: (showing: boolean) => void;
}

const NOTHING = { data: [], loading: false, error: false };

export function StatRowsWidget({
  read,
  readSample,
  dataTour,
  title,
  emptyText,
  footerLink,
  onShowingSample,
}: StatRowsWidgetProps) {
  const widget = useStaticWidgetData({
    read: () => (read ?? (() => NOTHING))(),
    readSample: () => (readSample ?? read ?? (() => NOTHING))(),
    isEmpty: (rows) => rows.length === 0,
  });
  onShowingSample?.(widget.showingSample);

  return (
    <StatRowsPanel
      dataTour={dataTour}
      title={title}
      rows={widget.data}
      loading={widget.loading}
      emptyText={emptyText}
      footerLink={footerLink}
    />
  );
}
