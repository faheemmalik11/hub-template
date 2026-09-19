import { DashboardPanel } from "./panel";
import { StageTiles, type StageTile } from "./stage-tiles";
import { PeriodPicker, type PeriodLabels, type PeriodValue } from "./period-picker";

export function PipelineStagesPanel({
  title,
  stages,
  loading,
  error,
  period,
  onPeriodChange,
  periodLabels,
  formatDay,
  className,
  dataTour,
}: {
  title: string;
  stages: StageTile[];
  loading: boolean;
  error?: boolean;
  period: PeriodValue;
  onPeriodChange: (value: PeriodValue) => void;
  periodLabels?: PeriodLabels;
  formatDay: (iso: string) => string;
  className?: string;
  dataTour?: string;
}) {
  if (error) return null;
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  if (!loading && total === 0) return null;

  return (
    <DashboardPanel
      title={title}
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
      <StageTiles stages={stages} loading={loading} />
    </DashboardPanel>
  );
}
