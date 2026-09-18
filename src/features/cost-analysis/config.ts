export type BelegFokus = "ust" | "kategorie";

import type { ReactNode } from "react";

/**
 * Everything about this screen that is NOT the same in every Hub.
 *
 * Deliberately small. The temptation with a portable feature is to make every decision
 * configurable, which produces four Hubs each running a different screen through one file. The rule
 * here: something earns a place in this type only when a repository genuinely CANNOT work without
 * differing — a company grouping that does not exist elsewhere, a route that another Hub does not
 * have. Layout, wording, colours and the accounting are not configurable, on purpose.
 */
export interface CostAnalysisConfig {
  /**
   * Saved multi-company views, offered in the company filter alongside the individual companies.
   * A group is only offered when EVERY one of its codes is actually present in the company list, so
   * a Hub that lists a grouping it does not have shows nothing rather than an option matching
   * nothing. Omit entirely where there are none.
   */
  companyGroups?: { key: string; labelKey: string; codes: string[] }[];
  /**
   * Open one incoming invoice. The Hub's own typed navigate call.
   *
   * `fokus` names the field the reader was sent to fix, so the detail page can scroll to it and
   * mark it. Landing on a long form at the top and being left to find the one field the card was
   * about is the part that made these disclosures feel like dead ends.
   */
  onOpenBeleg: (id: string, fokus?: BelegFokus) => void;
  /**
   * Open the manual bookings screen. Omit in a Hub that has none — the links that lead there are
   * then not rendered rather than navigating to a route that does not exist.
   */
  onOpenManualBooking?: () => void;
  /**
   * One extra filter dimension this Hub has and the others do not.
   *
   * Exists for Eiffler, which filters costs by Mietverhaeltnis (tenancy). Dropping it to keep the
   * config small would have been a functional regression on a live screen, and hard-wiring a
   * tenancy filter into the shared screen would push a concept the other three Hubs have no data
   * for into all of them.
   *
   * `scopeFilter` returns the extra fields to merge into the useBwaScope filter. It is typed
   * loosely on purpose: each Hub's own hook declares its own filter shape, and only the Hub that
   * supplies this knows which field its hook understands.
   */
  zusatzDimension?: {
    /** Search-param key, so the choice survives a reload and travels in a shared link. */
    key: string;
    labelKey: string;
    alleLabelKey: string;
    /**
     * The options to offer. A hook, because they come from a query, and it receives the current
     * filter state because a dimension can depend on another one: Eiffler only offers tenancies
     * once a property is chosen, since a tenancy belongs to a property.
     */
    useOptions: (search: CostAnalysisSearch) => { value: string; label: string }[];
    scopeFilter: (value: string | null) => Record<string, unknown>;
  };

  /** Extra content under the header, e.g. a Hub-specific notice. */
  kopfzeile?: ReactNode;
}

/**
 * The screen's URL state. Filters live in the URL because a narrowed evaluation is something people
 * send to each other; component state alone loses them on reload.
 */
export interface CostAnalysisSearch {
  gesellschaft?: string;
  objekt?: string;
  kategorie?: string;
  konto?: string;
  zeitraum?: string;
  von?: string;
  bis?: string;
  /** The value of `config.zusatzDimension`, when a Hub declares one. */
  zusatz?: string;
  /** "gross" books invoices as billed; anything else is the standard net treatment. */
  basis?: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/** Shared by every Hub's route, so the four cannot drift on what a link carries. */
export function validateCostAnalysisSearch(input: Record<string, unknown>): CostAnalysisSearch {
  return {
    gesellschaft: str(input.gesellschaft),
    objekt: str(input.objekt),
    kategorie: str(input.kategorie),
    konto: str(input.konto),
    zeitraum: str(input.zeitraum),
    von: str(input.von),
    bis: str(input.bis),
    zusatz: str(input.zusatz),
    basis: input.basis === "gross" ? "gross" : undefined,
  };
}
