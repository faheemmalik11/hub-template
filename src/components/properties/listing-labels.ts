type Translate = (key: string) => string;

const PROPERTY_TYPES = [
  "HOUSE",
  "APARTMENT",
  "TRADE_SITE",
  "OFFICE",
  "INDUSTRY",
  "STORE",
  "GASTRONOMY",
  "GARAGE",
  "INVESTMENT",
  "SHORT_TERM_ACCOMODATION",
] as const;

const MARKETING_TYPES = ["BUY", "RENT"] as const;

function known<T extends string>(list: readonly T[], value: string | null): value is T {
  return value !== null && (list as readonly string[]).includes(value);
}

export function propertyTypeLabel(t: Translate, value: string | null): string | null {
  if (!value) return null;
  return known(PROPERTY_TYPES, value) ? t(`propertyListings.propertyTypes.${value}`) : value;
}

export function marketingTypeLabel(t: Translate, value: string | null): string | null {
  if (!value) return null;
  return known(MARKETING_TYPES, value) ? t(`propertyListings.marketingTypes.${value}`) : value;
}

export function listingTypeLabel(
  t: Translate,
  propertyType: string | null,
  marketingType: string | null,
): string {
  return (
    [propertyTypeLabel(t, propertyType), marketingTypeLabel(t, marketingType)]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}
