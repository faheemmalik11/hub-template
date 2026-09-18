import { DUE_FILTER_VALUES, toDueFilter, WORKFLOW_REIHENFOLGE } from "@/lib/data/format";
import type { BelegSortKey } from "@/lib/data/types";

/**
 * URL search-param schema for the incoming-invoices list (`/eingangsrechnungen`).
 *
 * It lives here rather than in the route file because the invoice detail route
 * (`/eingangsrechnungen/$nr`) carries the same params through, so its back link can drop the user
 * back on the list they came from instead of an unfiltered one. See `carryListSearch` /
 * `pickListSearch`.
 */

export const ALLE = "__alle";
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const SORT_KEYS: BelegSortKey[] = [
  "steller",
  "gesellschaft",
  "objekt",
  "betrag",
  "beleg_datum",
  "faellig",
  "eingegangen_am",
  "status",
  "pruefung",
];
export const STATUS_VALUES = ["erkannt", "zu_pruefen"] as const;
export const ZAHLUNG_VALUES = ["bezahlt", "offen"] as const;
export const PAYMENT_TYPE_VALUES = ["direct_debit", "transfer"] as const;
export const DATEV_VALUES = ["uebergeben", "offen"] as const;
// The full approval chain plus its one terminal side path that still shows up in the everyday
// list (rejecting a receipt doesn't archive or soft-delete it). 'nicht_relevant' is deliberately
// excluded — those rows are unconditionally hidden from this list server-side (applyBelegeFilter),
// so offering it here would be a filter option that always returns zero rows.
export const WORKFLOW_FILTER_VALUES = [...WORKFLOW_REIHENFOLGE, "abgelehnt"] as const;

export { DUE_FILTER_VALUES };

// URL search-param schema. ALL fields optional so links to /eingangsrechnungen elsewhere
// need no search prop; validateSearch fills defaults, and the component normalizes to
// concrete values (NormalizedSearch) so a bare URL = first unfiltered page.
export type BelegeSearch = {
  q?: string;
  view?: "liste" | "kanban";
  page?: number;
  pageSize?: PageSize;
  sort?: BelegSortKey;
  dir?: "asc" | "desc";
  gesellschaft?: string;
  objekt?: string;
  status?: string;
  belegart?: string;
  zahlung?: string;
  paymentType?: string;
  datev?: string;
  bankMatch?: string;
  ampel?: string;
  workflow?: string;
  faellig?: string;
  archiv?: "nur";
  zeitraum?: string;
  von?: string;
  bis?: string;
};

export type NormalizedSearch = Required<
  Pick<BelegeSearch, "q" | "view" | "page" | "pageSize" | "sort" | "dir" | "zeitraum">
> &
  Pick<
    BelegeSearch,
    | "gesellschaft"
    | "objekt"
    | "status"
    | "belegart"
    | "zahlung"
    | "paymentType"
    | "datev"
    | "bankMatch"
    | "ampel"
    | "workflow"
    | "faellig"
    | "archiv"
    | "von"
    | "bis"
  >;

export function normalize(s: BelegeSearch): NormalizedSearch {
  return {
    q: s.q ?? "",
    view: s.view ?? "liste",
    page: s.page ?? 1,
    pageSize: s.pageSize ?? 50,
    sort: s.sort ?? "eingegangen_am",
    dir: s.dir ?? "desc",
    zeitraum: s.zeitraum ?? ALLE,
    gesellschaft: s.gesellschaft,
    objekt: s.objekt,
    status: s.status,
    belegart: s.belegart,
    zahlung: s.zahlung,
    paymentType: s.paymentType,
    datev: s.datev,
    bankMatch: s.bankMatch,
    ampel: s.ampel,
    workflow: s.workflow,
    faellig: s.faellig,
    archiv: s.archiv,
    von: s.von,
    bis: s.bis,
  };
}

export function validateSearch(input: Record<string, unknown>): BelegeSearch {
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
  const posInt = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : d;
  };
  const size = posInt(input.pageSize, 50);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : 50;
  const status = str(input.status);
  const zahlung = input.zahlung;
  const paymentType = str(input.paymentType);
  const datev = input.datev;
  const bankMatch = str(input.bankMatch);
  const ampel = str(input.ampel);
  const workflow = str(input.workflow);
  return {
    q: str(input.q) ?? "",
    view: input.view === "kanban" ? "kanban" : "liste",
    page: posInt(input.page, 1),
    pageSize,
    sort: SORT_KEYS.includes(input.sort as BelegSortKey)
      ? (input.sort as BelegSortKey)
      : "eingegangen_am",
    dir: input.dir === "asc" ? "asc" : "desc",
    gesellschaft: str(input.gesellschaft),
    objekt: str(input.objekt),
    status: status === "erkannt" || status === "zu_pruefen" ? status : undefined,
    belegart: str(input.belegart),
    zahlung: zahlung === "bezahlt" || zahlung === "offen" ? zahlung : undefined,
    paymentType: (PAYMENT_TYPE_VALUES as readonly string[]).includes(paymentType ?? "")
      ? paymentType
      : undefined,
    datev: datev === "uebergeben" || datev === "offen" ? datev : undefined,
    bankMatch:
      bankMatch === "vorschlag" || bankMatch === "zugeordnet" || bankMatch === "offen"
        ? bankMatch
        : undefined,
    // Recognition traffic light. Only the three pipeline values are accepted, so a hand-edited URL
    // cannot silently produce a filter that matches nothing.
    ampel:
      ampel === "gruen" || ampel === "gelb" || ampel === "rot" || ampel === "auffaellig"
        ? ampel
        : undefined,
    // Approval-chain stage. Only real workflow_status values are accepted, same reasoning as ampel
    // above — a hand-edited URL can't produce a filter that silently matches nothing.
    workflow: (WORKFLOW_FILTER_VALUES as readonly string[]).includes(workflow ?? "")
      ? workflow
      : undefined,
    faellig: toDueFilter(input.faellig),
    archiv: input.archiv === "nur" ? "nur" : undefined,
    zeitraum: str(input.zeitraum) ?? ALLE,
    von: str(input.von),
    bis: str(input.bis),
  };
}

// The value each always-present param falls back to. Kept next to `normalize` so the two cannot
// drift: `carryListSearch` drops exactly these, which is what keeps a detail URL clean when the
// list was unfiltered.
const LIST_DEFAULTS: Record<string, unknown> = {
  q: "",
  view: "liste",
  page: 1,
  pageSize: 50,
  sort: "eingegangen_am",
  dir: "desc",
  zeitraum: ALLE,
};

/**
 * The list state worth handing to the detail route, so its back link can restore it. Params still
 * holding their default are dropped, so opening an invoice from an unfiltered list gives a clean
 * `/eingangsrechnungen/<id>` URL instead of one carrying seven no-op params.
 */
export function carryListSearch(s: BelegeSearch): BelegeSearch {
  const carried: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined || value === LIST_DEFAULTS[key]) continue;
    carried[key] = value;
  }
  return carried as BelegeSearch;
}

/**
 * Reads the carried list state back off a route that is not the list itself (the detail route).
 * Validating here as well means a hand-edited or stale link cannot push a bogus filter onto the
 * list, and the result is already stripped of defaults so it can go straight into a `<Link>`.
 */
export function pickListSearch(input: Record<string, unknown>): BelegeSearch {
  return carryListSearch(validateSearch(input));
}
