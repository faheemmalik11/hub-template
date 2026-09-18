/**
 * Whether the extraction called this an outgoing invoice: issued BY one of our own companies
 * rather than to us.
 *
 * No dedicated `direction` column exists yet, so this reads `extracted.richtung`, the same field
 * the pipeline's own relevance check writes. One predicate rather than the string comparison
 * repeated per screen, so the day a column arrives this is the only place that changes.
 *
 * Its own module, not part of ./AusgangFlag: a file that exports both components and helpers
 * loses fast refresh for the components in it.
 */
import type { Beleg } from "@/lib/data/types";

export function istAusgangsrechnung(beleg: Pick<Beleg, "extracted">): boolean {
  return (beleg.extracted?.richtung as string | undefined)?.trim().toLowerCase() === "ausgang";
}
