import { DashboardPanel } from "./panel";
import { RankedBars, RankedBarsSkeleton, type RankedBarRow } from "./ranked-bars";
import { PeriodPicker, type PeriodLabels, type PeriodValue } from "./period-picker";

export function RankedListPanel({
  title,
  totalLabel,
  rows,
  loading,
  period,
  onPeriodChange,
  periodLabels,
  formatDay,
  className,
  dataTour,
}: {
  title: string;
  totalLabel?: string;
  rows: RankedBarRow[];
  loading: boolean;
  period: PeriodValue;
  onPeriodChange: (value: PeriodValue) => void;
  periodLabels?: PeriodLabels;
  formatDay: (iso: string) => string;
  className?: string;
  dataTour?: string;
}) {
  if (!loading && rows.length === 0) return null;

  return (
    <DashboardPanel
      title={title}
      titleExtra={totalLabel}
      headerRight={
        <PeriodPicker
          value={period}
          onChange={onPeriodChange}
          labels={periodLabels}
          formatDay={formatDay}
        />
      }
      className={className}
      dataTour={dataTour}
    >
      {loading ? <RankedBarsSkeleton /> : <RankedBars rows={rows} />}
    </DashboardPanel>
  );
}
