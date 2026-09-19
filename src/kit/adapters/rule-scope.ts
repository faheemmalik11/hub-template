export type DimensionKey = "supplier" | "businessLine" | "property" | "company";

export const DIMENSION_WEIGHT: Record<DimensionKey, number> = {
  supplier: 8,
  businessLine: 4,
  property: 2,
  company: 1,
};

export const PINNED_DIMENSION_WEIGHT = 16;

export const ANY_VALUE = "__any";

export interface ScopeOption {
  id: string;

  label: string;

  code?: string;

  keywords?: string;
}
