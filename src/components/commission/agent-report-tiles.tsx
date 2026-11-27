import { Award, Building2, Handshake, HandCoins, Info, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { CHIP } from "@/components/dashboard/stat-tile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgentCommissionReportRow } from "@/data";
import { formatDate, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function TileInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info aria-label={text} className="size-3.5 shrink-0 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

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

function previousYearRange(cutoff: string): { from: string; to: string } {
  const [cutoffYear, cutoffMonth, cutoffDay] = cutoff.split("-").map(Number);
  const previousYear = cutoffYear - 1;
  const from = `${previousYear}-01-01`;
  // Date(previousYear, 1, 29) rolls over to March 1 when previousYear isn't a leap year.
  const isFeb29OfNonLeapPreviousYear =
    cutoffMonth === 2 && cutoffDay === 29 && new Date(previousYear, 1, 29).getMonth() !== 1;
  const to = isFeb29OfNonLeapPreviousYear
    ? `${previousYear}-02-28`
    : `${previousYear}-${String(cutoffMonth).padStart(2, "0")}-${String(cutoffDay).padStart(2, "0")}`;
  return { from, to };
}

// row=null renders the grand total across every agent instead of one agent's own figures.
export function AgentReportTiles({
  row,
  cutoff,
  showCommission,
  showApprovedBonuses,
}: {
  row: AgentCommissionReportRow | null;
  cutoff: string;
  showCommission: boolean;
  showApprovedBonuses: boolean;
}) {
  const { t } = useTranslation();
  const numbers = row ?? EMPTY_ROW;
  const { from: previousYearStart, to: previousYearEnd } = previousYearRange(cutoff);
  const lastYearHint = (value: string | number) =>
    t("commissionDeals.report.tiles.lastYear", {
      from: formatDate(previousYearStart),
      to: formatDate(previousYearEnd),
      value,
    });

  const tiles: {
    label: string;
    info: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    iconTint: string;
  }[] = [
    {
      label: t("commissionDeals.report.tiles.closings"),
      info: t("commissionDeals.report.tiles.closingsInfo"),
      value: String(numbers.closings_current),
      hint: lastYearHint(numbers.closings_previous),
      icon: Handshake,
      iconTint: CHIP.brand,
    },
    {
      label: t("commissionDeals.report.tiles.volume"),
      info: t("commissionDeals.report.tiles.volumeInfo"),
      value: formatEUR(numbers.volume_current),
      hint: lastYearHint(formatEUR(numbers.volume_previous)),
      icon: Building2,
      iconTint: CHIP.neutral,
    },
    ...(showCommission
      ? [
          {
            label: t("commissionDeals.report.tiles.commission"),
            info: t("commissionDeals.report.tiles.commissionInfo"),
            value: formatEUR(numbers.commission_current),
            hint: lastYearHint(formatEUR(numbers.commission_previous)),
            icon: HandCoins,
            iconTint: CHIP.brand,
          },
        ]
      : []),
    {
      label: t("commissionDeals.report.tiles.bonuses"),
      info: t("commissionDeals.report.tiles.bonusesInfo"),
      value: formatEUR(numbers.bonuses_current),
      hint: lastYearHint(formatEUR(numbers.bonuses_previous)),
      icon: Award,
      iconTint: CHIP.neutral,
    },
    ...(showApprovedBonuses
      ? [
          {
            label: t("commissionDeals.report.tiles.bonusesApproved"),
            info: t("commissionDeals.report.tiles.bonusesApprovedInfo"),
            value: formatEUR(numbers.bonuses_approved_current),
            hint: lastYearHint(formatEUR(numbers.bonuses_approved_previous)),
            icon: ShieldCheck,
            iconTint: CHIP.success,
          },
        ]
      : []),
  ];

  const gridColsClass = showCommission
    ? showApprovedBonuses
      ? "lg:grid-cols-5"
      : "lg:grid-cols-4"
    : showApprovedBonuses
      ? "lg:grid-cols-4"
      : "lg:grid-cols-3";

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${gridColsClass}`}>
      {tiles.map((tile) => (
        <KpiCard
          key={tile.label}
          icon={tile.icon}
          iconTint={tile.iconTint}
          label={tile.label}
          loading={false}
          value={tile.value}
          headerRight={<TileInfo text={tile.info} />}
          delta={
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
              {tile.hint}
            </span>
          }
        />
      ))}
    </div>
  );
}
