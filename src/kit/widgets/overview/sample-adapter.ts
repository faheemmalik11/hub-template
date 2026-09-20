import type { OverviewAdapter, PeriodRange } from "../../adapters/overview";

const money = (value: number) => ({ value, loading: false });

export const sampleFormatters = {
  formatMoney: (value: number) => `${value.toFixed(2)} EUR`,
  formatMoneyCompact: (value: number) => `${Math.round(value / 1000)}k`,
  formatDay: (day: string) => day,
};

export function sampleOverviewAdapter(overrides: Partial<OverviewAdapter> = {}): OverviewAdapter {
  return {
    ...sampleFormatters,
    useMoneyFigures: (ranges: Record<string, PeriodRange>) => ({
      data: Object.fromEntries(
        Object.keys(ranges).map((key, index) => [key, money(1200 + index * 850)]),
      ),
      loading: false,
    }),
    useMoneyTrend: () => ({
      data: [
        { day: "2026-09-01", incoming: 1200, outgoing: 900 },
        { day: "2026-09-08", incoming: 1800, outgoing: 1100 },
        { day: "2026-09-15", incoming: 1500, outgoing: 1750 },
      ],
      loading: false,
    }),
    useInvoiceStages: () => ({
      data: [
        { key: "received", label: "Received", count: 12 },
        { key: "in_review", label: "In review", count: 4 },
        { key: "approved_final", label: "Approved", count: 7 },
      ],
      loading: false,
      error: false,
    }),
    useTopSuppliers: () => ({
      data: {
        rows: [
          { key: "1", label: "Example Supplier GmbH", value: 4820, valueText: "4.820,00 EUR" },
          { key: "2", label: "Another Supplier AG", value: 1290, valueText: "1.290,00 EUR" },
        ],
        totalText: "6.110,00 EUR",
      },
      loading: false,
    }),
    useSpendByCompany: () => ({
      data: {
        rows: [
          { key: "EX1", label: "Example Holding GmbH", value: 6110, valueText: "6.110,00 EUR" },
        ],
        totalText: "6.110,00 EUR",
      },
      loading: false,
    }),
    useProcessingSummary: () => ({
      data: { processed: 24, recognized: 20, needsReview: 3, errors: 1, channels: ["Mailbox"] },
      loading: false,
      error: false,
    }),
    useOpenItemsSummary: () => ({
      data: [
        { key: "open", label: "Open", value: "3" },
        { key: "overdue", label: "Overdue", value: "1" },
      ],
      loading: false,
      error: false,
    }),
    useBankSummary: () => ({
      data: [{ key: "unmatched", label: "Unmatched", value: "5" }],
      loading: false,
      error: false,
    }),
    ...overrides,
  } as OverviewAdapter;
}
