import type { LucideIcon } from "lucide-react";

import type { OverviewPeriod, PeriodRange } from "../components/dashboard/periods";
import type { RankedBarRow } from "../components/dashboard/ranked-bars";
import type { StageTile } from "../components/dashboard/stage-tiles";
import type { MoneyTrendPoint } from "../components/dashboard/money-trend-chart";
import type { ProcessingSummary } from "../components/dashboard/processing-summary-panel";
import type { StatRowConfig } from "../components/dashboard/stat-rows-panel";

export type { OverviewPeriod, PeriodRange };

export interface MoneyFigure {
  value: number;
  count?: number;
  previousValue?: number;
  loading: boolean;
}

export interface OverviewAdapter {
  useMoneyFigures?(ranges: Record<string, PeriodRange>): {
    data: Record<string, MoneyFigure>;
    loading: boolean;
  };
  useInvoiceStages?(range: PeriodRange): {
    data: StageTile[];
    loading: boolean;
    error: boolean;
  };
  useTopSuppliers?(range: PeriodRange): {
    data: { rows: RankedBarRow[]; totalText: string };
    loading: boolean;
  };
  useSpendByCompany?(range: PeriodRange): {
    data: { rows: RankedBarRow[]; totalText: string };
    loading: boolean;
  };
  useMoneyTrend?(range: PeriodRange): { data: MoneyTrendPoint[]; loading: boolean };
  useProcessingSummary?(range: PeriodRange): {
    data: ProcessingSummary | undefined;
    loading: boolean;
    error: boolean;
  };
  useOpenItemsSummary?(): { data: StatRowConfig[]; loading: boolean; error: boolean };
  useBankSummary?(): { data: StatRowConfig[]; loading: boolean; error: boolean };
  formatMoney(value: number): string;
  formatMoneyCompact(value: number): string;
  formatDay(iso: string): string;
}

export interface MoneyCardConfig {
  key: string;
  icon: LucideIcon;
  to: string;
  iconTint: string;
  higherIsBetter: boolean;
}
