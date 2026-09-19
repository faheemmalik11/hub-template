import {
  formatNumber,
  type DatevCompanyStatus,
  type DatevHandoverBatch,
  type DatevOutgoingInvoice,
  type DatevReadyInvoice,
  type DatevRoute,
  type Gesellschaft,
} from "./adapter";

/**
 * Turning the screen's four queries into the one list it renders.
 *
 * Pure and separate from the components, so the two decisions that are product decisions rather
 * than layout ones — what a row's action is, and what order the rows come in — are somewhere they
 * can be read and argued with.
 */

/**
 * Whether this company can receive a handover.
 *
 * Three outcomes, not two. The table only ever reports on setup — never the address itself — but
 * "set up and switched off" is a setup state of its own, and the send genuinely refuses it. Folding
 * it into "Eingerichtet" would put a green dot on the one company whose files quietly stay put.
 */
export type SetupState = "missing" | "ready" | "paused";

/** What the row's own button offers. `none` means the overflow menu is the only entry point. */
export type RowAction = "configure" | "send" | "none";

export interface CompanyRow {
  company: Gesellschaft;
  /** The `incoming` route — the only direction wired to a send. */
  route: DatevRoute | undefined;
  /** Every direction's route, for the setup drawer. */
  routes: Record<string, DatevRoute | undefined>;
  setup: SetupState;
  /** Sendable now: paid, not yet handed over, and carrying a file DATEV accepts. */
  ready: DatevReadyInvoice[];
  /** Same rule minus the file — the receipts a send would drop if nobody said so. */
  blocked: DatevReadyInvoice[];
  readySumme: number;
  /** Receipts handed over at some point in the past. */
  sent: number;
  /** Newest SUCCESSFUL batch. A failed attempt is not a handover and must not date this column. */
  lastSent: DatevHandoverBatch | undefined;
  /** True when the most recent attempt of any kind failed — worth a mark, not its own column. */
  lastAttemptFailed: boolean;
  action: RowAction;
}

export function setupState(route: DatevRoute | undefined): SetupState {
  if (!route) return "missing";
  return route.is_enabled ? "ready" : "paused";
}

/**
 * The row's own button.
 *
 * A company with nothing waiting gets NO button rather than a greyed-out one. A disabled control is
 * a promise the screen cannot keep, and repeated down a column of twelve companies it is most of
 * what the column contains — the overflow menu still holds everything that row can do.
 */
export function rowAction(setup: SetupState, ready: number): RowAction {
  if (setup === "missing") return "configure";
  if (ready > 0 && setup === "ready") return "send";
  return "none";
}

const RANG: Record<RowAction, number> = { send: 0, configure: 1, none: 2 };

/**
 * Rows in the order the work wants doing: what can go out now, then what needs setting up, then
 * everything already quiet. Within a rank, by company code, so the order is stable across
 * refreshes — a list that reshuffles itself while being read is its own problem.
 */
export function buildRows(args: {
  companies: Gesellschaft[];
  routes: DatevRoute[];
  status: Record<string, DatevCompanyStatus> | undefined;
  batches: DatevHandoverBatch[];
}): CompanyRow[] {
  const byCompany = new Map<string, DatevRoute[]>();
  for (const r of args.routes) {
    const list = byCompany.get(r.company_id) ?? [];
    list.push(r);
    byCompany.set(r.company_id, list);
  }

  // Newest first out of the query, so the first hit per company is that company's latest.
  const lastSuccess = new Map<string, DatevHandoverBatch>();
  const lastAny = new Map<string, DatevHandoverBatch>();
  for (const b of args.batches) {
    if (!lastAny.has(b.company_id)) lastAny.set(b.company_id, b);
    if (b.status === "success" && !lastSuccess.has(b.company_id)) lastSuccess.set(b.company_id, b);
  }

  const rows = args.companies.map((company) => {
    const list = byCompany.get(company.id) ?? [];
    const routes: Record<string, DatevRoute | undefined> = {};
    for (const r of list) routes[r.direction] = r;
    const route = routes.incoming;
    const setup = setupState(route);
    const s = args.status?.[company.id];
    const ready = s?.ready ?? [];
    const blocked = s?.blocked ?? [];
    return {
      company,
      route,
      routes,
      setup,
      ready,
      blocked,
      readySumme: ready.reduce((sum, i) => sum + (i.amount_gross ?? 0), 0),
      sent: s?.handedOver ?? 0,
      lastSent: lastSuccess.get(company.id),
      lastAttemptFailed: lastAny.get(company.id)?.status === "error",
      action: rowAction(setup, ready.length),
    };
  });

  return rows.sort((a, b) => {
    const d = RANG[a.action] - RANG[b.action];
    return d !== 0 ? d : a.company.code.localeCompare(b.company.code);
  });
}

/** The one line above the table. Everything in it is counted, never configured. */
export function fleetSummary(rows: CompanyRow[]) {
  return {
    companies: rows.length,
    filesReady: rows.reduce((n, r) => n + r.ready.length, 0),
    readySumme: rows.reduce((n, r) => n + r.readySumme, 0),
    alreadySent: rows.reduce((n, r) => n + r.sent, 0),
    needSetup: rows.filter((r) => r.setup === "missing").length,
    /** Companies a page-level send would actually move. */
    sendable: rows.filter((r) => r.action === "send"),
  };
}

export const STATUS_FILTERS = ["alle", "eingerichtet", "open", "bereit", "gesendet"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Search and status, applied together.
 *
 * Search covers the code AND the name: the code is what DATEV routes on and what every other screen
 * prints, but somebody looking a company up here is as likely to know it by name.
 */
export function filterRows(rows: CompanyRow[], q: string, status: StatusFilter): CompanyRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (needle) {
      const haystack = `${r.company.code} ${r.company.name ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    switch (status) {
      case "eingerichtet":
        return r.setup !== "missing";
      case "open":
        return r.setup === "missing";
      case "bereit":
        return r.ready.length > 0;
      case "gesendet":
        return r.sent > 0;
      default:
        return true;
    }
  });
}

/** One company's contribution to a send — what the send drawer is handed. */
export interface SendTarget {
  id: string;
  code: string;
  name: string | null;
  ready: DatevReadyInvoice[];
  blocked: DatevReadyInvoice[];
  /** The company's outgoing invoices. Read only while the send drawer is open. */
  outgoing: DatevOutgoingInvoice[];
}

export function toSendTarget(row: CompanyRow, outgoing: DatevOutgoingInvoice[] = []): SendTarget {
  return {
    id: row.company.id,
    code: row.company.code,
    name: row.company.name,
    ready: row.ready,
    blocked: row.blocked,
    outgoing,
  };
}

/**
 * Bytes as a size somebody reads rather than counts.
 *
 * Through the host's `formatNumber` so the decimal separator follows the app's locale — the send
 * function's own log lines print "4.2 MB" with a full stop because they are logs, but this one sits
 * next to amounts written the German way.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}
