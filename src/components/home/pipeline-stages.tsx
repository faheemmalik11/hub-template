import { useMemo } from "react";

import { DashboardPanel } from "@/components/dashboard/panel";
import { StageTiles, type StageTile } from "@/components/dashboard/stage-tiles";
import { PeriodPicker, useStoredPeriod } from "@/components/home/period-picker";
import { overviewPeriodRange } from "@/lib/data/format";
import { useBelegeKanbanCounts } from "@/lib/data/queries";
import { useTranslation } from "@/lib/i18n";

/**
 * WHERE THE PILE IS. The document lifecycle as one row of tiles, so the overview answers "what is
 * the state of the whole system" rather than only "how much is there".
 *
 * SIX STEPS, NOT NINE. WORKFLOW_REIHENFOLGE has nine statuses, three of which are approval levels
 * (assistenz, stufe2, vorgesetzter) that differ by who signed rather than by where the document
 * is. They are summed into one "approved" step, because a row with three near-identical labels
 * stops being readable at a glance. The mapping is explicit below so the sum is auditable: every
 * one of the nine lands in exactly one step, so the tiles total the invoice count and cannot
 * silently drop a status.
 */
/**
 * PLAIN TILES, NOT A PAINT CHART. The labels name the steps and the order carries the progression,
 * so colour has no work to do here. Six filled blocks inside a white panel just rebuild the quilt
 * one level down, so these are hairline cells and the beige is left to the hover state.
 */
const TILE = "border border-border";
const TILE_LABEL = "text-muted-foreground";

const STAGES: { key: string; statuses: string[]; tileCls: string; labelCls: string }[] = [
  { key: "eingegangen", statuses: ["eingegangen"], tileCls: TILE, labelCls: TILE_LABEL },
  {
    key: "inPruefung",
    // Rückfrage is a held document, not a separate place in the chain: it is in review with a
    // question outstanding, so it counts where a person would look for it.
    statuses: ["in_pruefung", "rueckfrage"],
    tileCls: TILE,
    labelCls: TILE_LABEL,
  },
  {
    key: "freigegeben",
    statuses: ["freigegeben_assistenz", "freigegeben_stufe2", "freigegeben_vorgesetzter"],
    tileCls: TILE,
    labelCls: TILE_LABEL,
  },
  { key: "bezahlt", statuses: ["bezahlt"], tileCls: TILE, labelCls: TILE_LABEL },
  { key: "datev", statuses: ["uebergeben_datev"], tileCls: TILE, labelCls: TILE_LABEL },
  { key: "abgeschlossen", statuses: ["abgeschlossen"], tileCls: TILE, labelCls: TILE_LABEL },
];

export function PipelineStages() {
  const { t } = useTranslation();
  const [zeitraum, setZeitraum] = useStoredPeriod("stages");
  const range = useMemo(
    () =>
      overviewPeriodRange(zeitraum.period, new Date(), { von: zeitraum.von, bis: zeitraum.bis }),
    [zeitraum],
  );
  const countsQ = useBelegeKanbanCounts({
    von: range.von ?? undefined,
    bis: range.bis ?? undefined,
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
      link: { to: "/eingangsrechnungen", search: { workflow: s.statuses[0] } },
    }));
  }, [countsQ.data, t]);

  if (countsQ.isError) return null;

  const total = stages.reduce((s, x) => s + x.count, 0);
  // Nothing has been ingested for this period. A row of six zeroes says less than not rendering
  // it and lets the panels around it keep the reader's attention.
  if (!countsQ.isLoading && total === 0) return null;

  return (
    <DashboardPanel
      title={t("home.stages.title")}
      headerRight={<PeriodPicker value={zeitraum} onChange={setZeitraum} />}
      className="h-full"
    >
      <StageTiles stages={stages} loading={countsQ.isLoading} />
    </DashboardPanel>
  );
}
