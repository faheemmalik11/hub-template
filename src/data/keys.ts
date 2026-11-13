/**
 * Query keys, one factory per domain.
 *
 * Two files spelling the same key differently is the most common bug in a layer like this, and it
 * shows up as a screen that will not refresh after a save rather than as an error.
 */
export const queryKeys = {
  documents: {
    all: ["documents"] as const,
    list: (filters: unknown) => ["documents", "list", filters] as const,
    one: (id: string) => ["documents", id] as const,
    history: (id: string) => ["documents", id, "history"] as const,
    links: (id: string) => ["documents", id, "links"] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    one: (id: string) => ["suppliers", id] as const,
  },
  companies: { all: ["companies"] as const },
  properties: { all: ["properties"] as const },
  propertyListings: { all: ["property-listings"] as const },
  propertyCrmData: (code: string) => ["property-crm-data", code] as const,
  brokerBonuses: {
    all: ["broker-bonuses"] as const,
    settings: ["broker-bonuses", "settings"] as const,
    forDeal: (dealId: string) => ["broker-bonuses", "deal", dealId] as const,
  },
  dealDonations: {
    settings: ["deal-donations", "settings"] as const,
    forDeal: (dealId: string) => ["deal-donations", "deal", dealId] as const,
  },
  dealReferrerBonuses: {
    forDeal: (dealId: string) => ["deal-referrer-bonuses", "deal", dealId] as const,
    tier: (customerId: string, earnedOn: string) =>
      ["deal-referrer-bonuses", "tier", customerId, earnedOn] as const,
  },
  deals: {
    all: ["deals"] as const,
    one: (id: string) => ["deals", id] as const,
    list: (params: unknown) => ["deals", "list", params] as const,
    agentReport: (cutoff: string) => ["deals", "agent-report", cutoff] as const,
    crmChanges: (id: string) => ["deals", id, "crm-changes"] as const,
  },
  categories: { all: ["categories"] as const },
  bank: {
    accounts: ["bank", "accounts"] as const,
    transactions: (filters: unknown) => ["bank", "transactions", filters] as const,
    matchingCounts: ["bank", "matching-counts"] as const,
  },
  team: {
    members: ["team", "members"] as const,
    roles: ["team", "roles"] as const,
    permissions: ["team", "permissions"] as const,
  },
  settings: {
    features: ["settings", "features"] as const,
    scheduledJobs: ["settings", "scheduled-jobs"] as const,
    invoiceSettings: ["settings", "invoice-settings"] as const,
    invoiceKindLabels: ["settings", "invoice-kind-labels"] as const,
  },
} as const;
