import type { AgentCommissionReportRow } from "@/data";
import { formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const EMPTY_ROW: Pick<
  AgentCommissionReportRow,
  | "closings_current"
  | "closings_previous"
  | "volume_current"
  | "volume_previous"
  | "commission_current"
  | "commission_previous"
  | "bonuses_current"
  | "bonuses_previous"
  | "bonuses_approved_current"
  | "bonuses_approved_previous"
> = {
  closings_current: 0,
  closings_previous: 0,
  volume_current: 0,
  volume_previous: 0,
  commission_current: 0,
  commission_previous: 0,
  bonuses_current: 0,
  bonuses_previous: 0,
  bonuses_approved_current: 0,
  bonuses_approved_previous: 0,
};

// row=null renders the grand total across every agent instead of one agent's own figures.
export function AgentReportTiles({
  row,
  year,
  showApprovedBonuses,
}: {
  row: AgentCommissionReportRow | null;
  year: number;
  showApprovedBonuses: boolean;
}) {
  const { t } = useTranslation();
  const numbers = row ?? EMPTY_ROW;
  const prevYear = year - 1;

  const tiles = [
    {
      label: t("commissionDeals.report.tiles.closings"),
      value: String(numbers.closings_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: numbers.closings_previous,
      }),
    },
    {
      label: t("commissionDeals.report.tiles.volume"),
      value: formatEUR(numbers.volume_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: formatEUR(numbers.volume_previous),
      }),
    },
    {
      label: t("commissionDeals.report.tiles.commission"),
      value: formatEUR(numbers.commission_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: formatEUR(numbers.commission_previous),
      }),
    },
    {
      label: t("commissionDeals.report.tiles.bonuses"),
      value: formatEUR(numbers.bonuses_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: formatEUR(numbers.bonuses_previous),
      }),
    },
    ...(showApprovedBonuses
      ? [
          {
            label: t("commissionDeals.report.tiles.bonusesApproved"),
            value: formatEUR(numbers.bonuses_approved_current),
            hint: t("commissionDeals.report.tiles.lastYear", {
              year: prevYear,
              value: formatEUR(numbers.bonuses_approved_previous),
            }),
          },
        ]
      : []),
  ];

  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 ${showApprovedBonuses ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
    >
      {tiles.map((tile) => (
        <div key={tile.label} className="h-full rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{tile.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{tile.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}
