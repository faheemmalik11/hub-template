export interface OverviewLabels {
  moneyCards: Record<string, { label: string; countLabel?: (count: number) => string }>;
  deltaLabel: (period: string, percent: string) => string;
  trendChart: { title: string; incoming: string; outgoing: string };
  stagesTitle: string;
  topSuppliersTitle: (count: number) => string;
  spendByCompanyTitle: (count: number) => string;
  rankTotal: (sum: string) => string;
  processing: {
    title: string;
    seeAll: string;
    processed: string;
    recognized: string;
    needsReview: string;
    errors: string;
    channelsPrefix: string;
  };
  openItems: { title: string; seeAll: string; empty: string };
  bank: { title: string; seeAll: string };
}

export const englishOverviewLabels: OverviewLabels = {
  moneyCards: {
    incoming: {
      label: "Incoming invoices",
      countLabel: (count) => `${count} ${count === 1 ? "invoice" : "invoices"}`,
    },
    outgoing: {
      label: "Outgoing invoices",
      countLabel: (count) => `${count} ${count === 1 ? "invoice" : "invoices"}`,
    },
    grossProfit: { label: "Gross profit" },
  },
  deltaLabel: (_period, percent) => `${percent}% vs the period before`,
  trendChart: { title: "Invoices over time", incoming: "Incoming", outgoing: "Outgoing" },
  stagesTitle: "Where documents stand",
  topSuppliersTitle: (count) => `Top ${count} suppliers`,
  spendByCompanyTitle: (count) => `Spend by ${count} companies`,
  rankTotal: (sum) => `Total ${sum}`,
  processing: {
    title: "Document processing",
    seeAll: "See all",
    processed: "Processed",
    recognized: "Recognized",
    needsReview: "Needs review",
    errors: "Errors",
    channelsPrefix: "By channel:",
  },
  openItems: {
    title: "Open items",
    seeAll: "See all open items",
    empty: "Nothing is open right now.",
  },
  bank: { title: "Bank", seeAll: "See all transactions" },
};
