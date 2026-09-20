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
  },
  suppliers: {
    all: ["suppliers"] as const,
    one: (id: string) => ["suppliers", id] as const,
  },
  companies: { all: ["companies"] as const },
  properties: { all: ["properties"] as const },
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
  },
} as const;
