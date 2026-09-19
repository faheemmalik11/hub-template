import { FileText, Landmark } from "lucide-react";

import type { MoneyFigure, OverviewAdapter } from "../../adapters/overview";

export interface PlaceholderOverviewLabels {
  stages: string[];
  suppliers: string[];
  companies: string[];
  channels: string[];
  trendPoints: string[];
  openItems: string[];
  bank: string[];
}

export const englishPlaceholderOverviewLabels: PlaceholderOverviewLabels = {
  stages: ["Inbox", "Needs review", "Approved"],
  suppliers: ["Sample supplier one", "Sample supplier two", "Sample supplier three"],
  companies: ["Sample company north", "Sample company south"],
  channels: ["Email", "Upload"],
  trendPoints: ["Week 1", "Week 2", "Week 3", "Week 4"],
  openItems: ["Due this week", "Overdue"],
  bank: ["Unmatched transactions"],
};

const SAMPLE_MONEY_FIGURE: MoneyFigure = {
  value: 48250,
  count: 24,
  previousValue: 41000,
  loading: false,
};

const STAGE_COUNTS = [12, 5, 31];
const SUPPLIER_VALUES = [18400, 12900, 6300];
const COMPANY_VALUES = [22100, 15500];
const CHANNEL_COUNTS = [84, 44];
const TREND_VALUES = [
  { incoming: 9200, outgoing: 7400 },
  { incoming: 11800, outgoing: 8100 },
  { incoming: 10400, outgoing: 9600 },
  { incoming: 13900, outgoing: 8800 },
];
const OPEN_ITEM_VALUES = ["4", "2"];
const BANK_VALUES = ["9"];

function rankedRows(names: string[], values: number[], formatMoney: (value: number) => string) {
  const highest = Math.max(...values);
  return names.map((name, index) => ({
    key: String(index),
    label: name,
    valueText: formatMoney(values[index] ?? 0),
    sharePct: highest === 0 ? 0 : Math.round(((values[index] ?? 0) / highest) * 100),
  }));
}

function sumOf(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function createPlaceholderOverviewAdapter(
  labels: PlaceholderOverviewLabels = englishPlaceholderOverviewLabels,
  formatMoney: (value: number) => string = (value) => String(value),
): OverviewAdapter {
  return {
    useMoneyFigures(ranges) {
      const data: Record<string, MoneyFigure> = {};
      for (const key of Object.keys(ranges)) {
        data[key] = SAMPLE_MONEY_FIGURE;
      }
      return { data, loading: false };
    },
    useInvoiceStages() {
      return {
        data: labels.stages.map((label, index) => ({
          key: String(index),
          label,
          count: STAGE_COUNTS[index] ?? 0,
          link: { to: "/" },
        })),
        loading: false,
        error: false,
      };
    },
    useTopSuppliers() {
      return {
        data: {
          rows: rankedRows(labels.suppliers, SUPPLIER_VALUES, formatMoney),
          totalText: formatMoney(sumOf(SUPPLIER_VALUES)),
        },
        loading: false,
      };
    },
    useSpendByCompany() {
      return {
        data: {
          rows: rankedRows(labels.companies, COMPANY_VALUES, formatMoney),
          totalText: formatMoney(sumOf(COMPANY_VALUES)),
        },
        loading: false,
      };
    },
    useMoneyTrend() {
      return {
        data: labels.trendPoints.map((label, index) => ({
          label,
          incoming: TREND_VALUES[index]?.incoming ?? 0,
          outgoing: TREND_VALUES[index]?.outgoing ?? 0,
        })),
        loading: false,
      };
    },
    useProcessingSummary() {
      return {
        data: {
          processed: 128,
          recognized: 119,
          needsReview: 7,
          errors: 2,
          channels: labels.channels.map((label, index) => ({
            label,
            count: CHANNEL_COUNTS[index] ?? 0,
          })),
          lastRunLabel: null,
        },
        loading: false,
        error: false,
      };
    },
    useOpenItemsSummary() {
      return {
        data: labels.openItems.map((label, index) => ({
          key: String(index),
          to: "/",
          icon: FileText,
          iconClassName: index === 0 ? "bg-warning" : "bg-danger",
          label,
          value: OPEN_ITEM_VALUES[index] ?? "0",
        })),
        loading: false,
        error: false,
      };
    },
    useBankSummary() {
      return {
        data: labels.bank.map((label, index) => ({
          key: String(index),
          to: "/",
          icon: Landmark,
          iconClassName: "bg-muted-foreground",
          label,
          value: BANK_VALUES[index] ?? "0",
        })),
        loading: false,
        error: false,
      };
    },
    formatMoney,
    formatMoneyCompact: formatMoney,
    formatDay: (iso) => iso,
  };
}
