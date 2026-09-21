import { DUE_FILTER_VALUES, toDueFilter, WORKFLOW_ORDER } from "@/lib/data/format";
import type { DocumentSortKey } from "@/lib/data/types";

/**
 * URL search-param schema for the incoming-invoices list (`/incoming-invoices`).
 *
 * It lives here rather than in the route file because the invoice detail route
 * (`/incoming-invoices/$nr`) carries the same params through, so its back link can drop the user
 * back on the list they came from instead of an unfiltered one. See `carryListSearch` /
 * `pickListSearch`.
 */

export const ALL = "__alle";
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const SORT_KEYS: DocumentSortKey[] = [
  "issuer",
  "company",
  "property",
  "amount",
  "document_date",
  "due",
  "received_at",
  "status",
  "check",
];
export const STATUS_VALUES = ["recognised", "needs_review"] as const;
export const PAYMENT_VALUES = ["paid", "open"] as const;
export const PAYMENT_TYPE_VALUES = ["direct_debit", "transfer"] as const;
export const DATEV_VALUES = ["uebergeben", "open"] as const;
// The full approval chain plus its one terminal side path that still shows up in the everyday
// list (rejecting a receipt doesn't archive or soft-delete it). 'not_relevant' is deliberately
// excluded — those rows are unconditionally hidden from this list server-side (applyBelegeFilter),
// so offering it here would be a filter option that always returns zero rows.
export const WORKFLOW_FILTER_VALUES = [...WORKFLOW_ORDER, "rejected"] as const;

export { DUE_FILTER_VALUES };

// URL search-param schema. ALL fields optional so links to /eingangsrechnungen elsewhere
// need no search prop; validateSearch fills defaults, and the component normalizes to
// concrete values (NormalizedSearch) so a bare URL = first unfiltered page.
export type DocumentsSearch = {
  q?: string;
  view?: "liste" | "kanban";
  page?: number;
  pageSize?: PageSize;
  sort?: DocumentSortKey;
  dir?: "asc" | "desc";
  company?: string;
  property?: string;
  status?: string;
  documentType?: string;
  payment?: string;
  paymentType?: string;
  datev?: string;
  bankMatch?: string;
  trafficLight?: string;
  workflow?: string;
  due?: string;
  archive?: "only";
  period?: string;
  fromDate?: string;
  toDate?: string;
};

export type NormalizedSearch = Required<
  Pick<DocumentsSearch, "q" | "view" | "page" | "pageSize" | "sort" | "dir" | "period">
> &
  Pick<
    DocumentsSearch,
    | "company"
    | "property"
    | "status"
    | "documentType"
    | "payment"
    | "paymentType"
    | "datev"
    | "bankMatch"
    | "trafficLight"
    | "workflow"
    | "due"
    | "archive"
    | "fromDate"
    | "toDate"
  >;

export function normalize(s: DocumentsSearch): NormalizedSearch {
  return {
    q: s.q ?? "",
    view: s.view ?? "liste",
    page: s.page ?? 1,
    pageSize: s.pageSize ?? 50,
    sort: s.sort ?? "received_at",
    dir: s.dir ?? "desc",
    period: s.period ?? ALL,
    company: s.company,
    property: s.property,
    status: s.status,
    documentType: s.documentType,
    payment: s.payment,
    paymentType: s.paymentType,
    datev: s.datev,
    bankMatch: s.bankMatch,
    trafficLight: s.trafficLight,
    workflow: s.workflow,
    due: s.due,
    archive: s.archive,
    fromDate: s.fromDate,
    toDate: s.toDate,
  };
}

export function validateSearch(input: Record<string, unknown>): DocumentsSearch {
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
  const posInt = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : d;
  };
  const size = posInt(input.pageSize, 50);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : 50;
  const status = str(input.status);
  const payment = input.payment;
  const paymentType = str(input.paymentType);
  const datev = input.datev;
  const bankMatch = str(input.bankMatch);
  const trafficLight = str(input.trafficLight);
  const workflow = str(input.workflow);
  return {
    q: str(input.q) ?? "",
    view: input.view === "kanban" ? "kanban" : "liste",
    page: posInt(input.page, 1),
    pageSize,
    sort: SORT_KEYS.includes(input.sort as DocumentSortKey)
      ? (input.sort as DocumentSortKey)
      : "received_at",
    dir: input.dir === "asc" ? "asc" : "desc",
    company: str(input.company),
    property: str(input.property),
    status: status === "recognised" || status === "needs_review" ? status : undefined,
    documentType: str(input.documentType),
    payment: payment === "paid" || payment === "open" ? payment : undefined,
    paymentType: (PAYMENT_TYPE_VALUES as readonly string[]).includes(paymentType ?? "")
      ? paymentType
      : undefined,
    datev: datev === "uebergeben" || datev === "open" ? datev : undefined,
    bankMatch:
      bankMatch === "suggestion" || bankMatch === "matched" || bankMatch === "open"
        ? bankMatch
        : undefined,
    // Recognition traffic light. Only the three pipeline values are accepted, so a hand-edited URL
    // cannot silently produce a filter that matches nothing.
    trafficLight:
      trafficLight === "green" ||
      trafficLight === "yellow" ||
      trafficLight === "red" ||
      trafficLight === "auffaellig"
        ? trafficLight
        : undefined,
    // Approval-chain stage. Only real workflow_status values are accepted, same reasoning as ampel
    // above — a hand-edited URL can't produce a filter that silently matches nothing.
    workflow: (WORKFLOW_FILTER_VALUES as readonly string[]).includes(workflow ?? "")
      ? workflow
      : undefined,
    due: toDueFilter(input.due),
    archive: input.archive === "only" ? "only" : undefined,
    period: str(input.period) ?? ALL,
    fromDate: str(input.fromDate),
    toDate: str(input.toDate),
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
  sort: "received_at",
  dir: "desc",
  period: ALL,
};

/**
 * The list state worth handing to the detail route, so its back link can restore it. Params still
 * holding their default are dropped, so opening an invoice from an unfiltered list gives a clean
 * `/incoming-invoices/<id>` URL instead of one carrying seven no-op params.
 */
export function carryListSearch(s: DocumentsSearch): DocumentsSearch {
  const carried: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined || value === LIST_DEFAULTS[key]) continue;
    carried[key] = value;
  }
  return carried as DocumentsSearch;
}

/**
 * Reads the carried list state back off a route that is not the list itself (the detail route).
 * Validating here as well means a hand-edited or stale link cannot push a bogus filter onto the
 * list, and the result is already stripped of defaults so it can go straight into a `<Link>`.
 */
export function pickListSearch(input: Record<string, unknown>): DocumentsSearch {
  return carryListSearch(validateSearch(input));
}
