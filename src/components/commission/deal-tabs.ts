export const DEAL_TABS = ["dealDetails", "ownership", "calculation", "invoices"] as const;

export type DealTab = (typeof DEAL_TABS)[number];

export interface DealAnchor {
  tab: DealTab;
  id: string;
}
