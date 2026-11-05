import type { DatevDirection } from "./adapter";

// Deliberately small: a prop earns a place here only when a repository genuinely cannot work without differing.
export interface DatevHandoverConfig {
  /** Directions this Hub can actually SEND, not merely store an address for; a direction left out still keeps its field, just marked inactive. */
  activeDirections: readonly DatevDirection[];
  /** Whether this Hub stores files for outgoing invoices; false when there is no `outgoing_invoice_files` table. */
  outgoingFiles?: boolean;
  /** Opens one incoming invoice via the Hub's own navigate call; omit in a Hub with no detail route. */
  onOpenDocument?: (invoiceId: string) => void;
  /** Document title for the route, e.g. "DATEV-Übergabe · Acme". */
  documentTitle: string;
}

/** True when a direction is wired to a real send in this Hub. */
export function isDirectionActive(config: DatevHandoverConfig, d: DatevDirection): boolean {
  return config.activeDirections.includes(d);
}
