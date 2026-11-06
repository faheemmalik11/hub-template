import { useMemo } from "react";

import { DashboardPanel } from "@/components/dashboard/panel";
import { StageTiles, type StageTile } from "@/components/dashboard/stage-tiles";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import { overviewPeriodRange } from "@/lib/data/format";
import { useDocumentsKanbanCounts } from "@/data";
import { useTranslation } from "@/lib/i18n";

// Nine workflow_status values summed into six tiles; the mapping below is explicit so the sum stays auditable.
const TILE = "border border-border";
const TILE_LABEL = "text-muted-foreground";

const STAGES: { key: string; statuses: string[]; tileCls: string; labelCls: string }[] = [
  { key: "received", statuses: ["received"], tileCls: TILE, labelCls: TILE_LABEL },
  {
    key: "inReview",
    statuses: ["in_review", "query"],
    tileCls: TILE,
    labelCls: TILE_LABEL,
  },
  {
    key: "approved",
    statuses: ["approved_first", "approved_final"],
    tileCls: TILE,
    labelCls: TILE_LABEL,
  },
  { key: "paid", statuses: ["paid"], tileCls: TILE, labelCls: TILE_LABEL },
  { key: "datev", statuses: ["handed_over"], tileCls: TILE, labelCls: TILE_LABEL },
  { key: "closed", statuses: ["closed"], tileCls: TILE, labelCls: TILE_LABEL },
];

export function PipelineStages() {
  const { t } = useTranslation();
  const [period, setPeriod] = useStoredPeriod("stages");
  const range = useMemo(
    () =>
      overviewPeriodRange(period.period, new Date(), {
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
    [period],
  );
  const countsQ = useDocumentsKanbanCounts({
    fromDate: range.fromDate ?? undefined,
    toDate: range.toDate ?? undefined,
  });

  const stages = useMemo<StageTile[]>(() => {
    const counts = countsQ.data ?? {};
    return STAGES.map((s) => ({
      key: s.key,
      label: t(`home.stages.${s.key}`),
      count: s.statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
      tileCls: s.tileCls,
      labelCls: s.labelCls,
      // The list takes a single workflow value, so a merged step links to the status a person
      // would look in first.
      link: { to: "/incoming-invoices", search: { workflow: s.statuses[0] } },
    }));
  }, [countsQ.data, t]);

  if (countsQ.isError) return null;

  return (
    <DashboardPanel
      title={t("home.stages.title")}
      headerRight={<PeriodPicker value={period} onChange={setPeriod} />}
      className="h-full"
    >
      <StageTiles stages={stages} loading={countsQ.isLoading} />
    </DashboardPanel>
  );
}
