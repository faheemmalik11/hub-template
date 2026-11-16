import { Award, Building2, Handshake, HandCoins, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { CHIP } from "@/components/dashboard/stat-tile";
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

  const tiles: {
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    iconTint: string;
  }[] = [
    {
      label: t("commissionDeals.report.tiles.closings"),
      value: String(numbers.closings_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: numbers.closings_previous,
      }),
      icon: Handshake,
      iconTint: CHIP.brand,
    },
    {
      label: t("commissionDeals.report.tiles.volume"),
      value: formatEUR(numbers.volume_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: formatEUR(numbers.volume_previous),
      }),
      icon: Building2,
      iconTint: CHIP.neutral,
    },
    {
      label: t("commissionDeals.report.tiles.commission"),
      value: formatEUR(numbers.commission_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: formatEUR(numbers.commission_previous),
      }),
      icon: HandCoins,
      iconTint: CHIP.brand,
    },
    {
      label: t("commissionDeals.report.tiles.bonuses"),
      value: formatEUR(numbers.bonuses_current),
      hint: t("commissionDeals.report.tiles.lastYear", {
        year: prevYear,
        value: formatEUR(numbers.bonuses_previous),
      }),
      icon: Award,
      iconTint: CHIP.neutral,
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
            icon: ShieldCheck,
            iconTint: CHIP.success,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 ${showApprovedBonuses ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
    >
      {tiles.map((tile) => (
        <KpiCard
          key={tile.label}
          icon={tile.icon}
          iconTint={tile.iconTint}
          label={tile.label}
          loading={false}
          value={tile.value}
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
