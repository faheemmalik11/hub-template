import type { DatevDirection } from "./adapter";

/**
 * Everything about this screen that is NOT the same in every Hub.
 *
 * Deliberately small. The temptation with a portable feature is to make every decision
 * configurable, which produces four Hubs each running a different screen through one file. The rule
 * here, borrowed from `features/cost-analysis/config.ts`: something earns a place in this type only
 * when a repository genuinely CANNOT work without differing. Layout, wording, colours, the
 * three-state route pill and the blind-write rules are not configurable, on purpose — the last two
 * are confidentiality guarantees, not styling.
 */
export interface DatevHandoverConfig {
  /**
   * Which directions the handover can actually SEND today, as opposed to merely store an address
   * for. This genuinely differs: Immonetz and Stäy send `incoming` only, Eiffler has wired
   * `outgoing` as well (migration `20260817190000_acc_outgoing_datev_handover_columns`).
   *
   * Every direction NOT in this list still gets its address field, its switch and its stored value
   * — it is marked "noch nicht aktiv" instead of hidden. Hiding it would quietly drop configuration
   * somebody deliberately entered, and an address already on file stays on file.
   */
  aktiveRichtungen: readonly DatevDirection[];
  /**
   * Whether this Hub stores files for outgoing invoices at all.
   *
   * Defaults to true. Set false where there is no `outgoing_invoice_files` table (Eiffler): the
   * outgoing block is then not rendered and its query never runs, rather than asking for a table
   * that does not exist and failing the whole drawer. This is not a preference about showing the
   * block — it is a fact about the schema, and the block has nothing to say without it.
   */
  outgoingFiles?: boolean;
  /**
   * Open one incoming invoice, using the Hub's own typed navigate call. The pre-send review lists
   * receipts by supplier and number; a receipt someone does not recognise, or one the preview says
   * will be skipped, is exactly the point at which they need to look at it.
   *
   * Omit in a Hub with no detail route — the rows are then plain text rather than links that go
   * nowhere.
   */
  onOpenBeleg?: (invoiceId: string) => void;
  /** Document title for the route, e.g. "DATEV-Übergabe · Immonetz". */
  documentTitle: string;
}

/** True when a direction is wired to a real send in this Hub. */
export function istRichtungAktiv(config: DatevHandoverConfig, d: DatevDirection): boolean {
  return config.aktiveRichtungen.includes(d);
}
