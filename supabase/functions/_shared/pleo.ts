// Pleo API client — reads accounting entries (employee card spend) for one company.
//
// AUTH: HTTP Basic with the API key as the USERNAME and an empty password. Not a bearer token.
//   curl --user "plp_xxx:" https://external.pleo.io/...
//
// ENDPOINT: POST /v1/accounting-entries:search — a POST that reads. Filters go in the JSON body,
// pagination in the query string.
//
// PAGINATION: cursor-based. Pass `after=<endCursor>`; stop when `pagination.hasNextPage` is false.
// `limit` is capped at 100 by the API (default 20).
//
// AMOUNTS: `transactionValue.minors` is an INTEGER in minor units (cents). Positive = money spent.
// See toDecimal()/signedAmount() for the conversion and the sign rule.

const DEFAULT_BASE_URL = "https://external.pleo.io";
const PAGE_LIMIT = 100; // API maximum
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
// Hard stop on pagination. At 100/page this is 500k entries — far beyond any real company, so
// hitting it means the cursor is not advancing (an API change or a bug), not a big data set.
// Without it a non-advancing cursor loops until the function is killed, with no diagnostic.
const MAX_PAGES = 5_000;

export interface PleoMoney {
  currency: string;
  minors: number;
}

export interface PleoEntry {
  id: string;
  companyId?: string;
  employeeId?: string;
  teamId?: string;
  status?: string;
  family?: string;
  subFamily?: string;
  exportStatus?: string;
  reviewStatus?: string;
  transactionValue?: PleoMoney;
  totalBillValue?: PleoMoney;
  performedAt?: string;
  settledAt?: string;
  bookkeepingDate?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  accountId?: string;
  accountCode?: string;
  taxCodeId?: string;
  note?: string;
  merchant?: { name?: string; merchantCategoryCode?: string } | null;
  receiptIds?: string[];
  tags?: unknown[];
  [k: string]: unknown;
}

export interface PleoConfig {
  apiKey: string;
  companyId: string;
  baseUrl: string;
}

export class PleoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PleoError";
  }
}

/** Reads config from the function env. Throws a clear error rather than failing later mid-sync. */
export function pleoConfig(): PleoConfig {
  const apiKey = Deno.env.get("PLEO_API_KEY")?.trim();
  const companyId = Deno.env.get("PLEO_COMPANY_ID")?.trim();
  const baseUrl = (Deno.env.get("PLEO_BASE_URL")?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");

  const missing = [!apiKey && "PLEO_API_KEY", !companyId && "PLEO_COMPANY_ID"].filter(Boolean);
  if (missing.length) {
    throw new PleoError(`Missing Pleo config: ${missing.join(", ")}`);
  }
  return { apiKey: apiKey!, companyId: companyId!, baseUrl };
}

/** minors (integer cents) -> decimal. Guards against a non-integer or absent value. */
export function toDecimal(money: PleoMoney | undefined | null): number | null {
  if (!money || typeof money.minors !== "number" || !Number.isFinite(money.minors)) return null;
  return money.minors / 100;
}

/**
 * Convert a Pleo amount to the sign convention of `bank_transactions`.
 *
 * bank_transactions.direction is a GENERATED column: `amount < 0 -> ausgehend`. Pleo is the other
 * way round — a card purchase is a POSITIVE `transactionValue.minors`. Copying the value verbatim
 * would book every payment as incoming money and silently corrupt OPOS, BWA and cost analysis, so
 * the sign is inverted here exactly once, in one place.
 *
 * A refund arrives as negative minors and therefore becomes positive (eingehend), which is right.
 */
export function signedAmount(entry: PleoEntry): number | null {
  const value = toDecimal(entry.transactionValue) ?? toDecimal(entry.totalBillValue);
  if (value === null) return null;
  return -value;
}

function authHeader(apiKey: string): string {
  // API key as username, empty password.
  return "Basic " + btoa(`${apiKey}:`);
}

async function requestPage(
  cfg: PleoConfig,
  body: Record<string, unknown>,
  cursor: string | null,
): Promise<{ data: PleoEntry[]; endCursor: string | null; hasNextPage: boolean; total?: number }> {
  const url = new URL(`${cfg.baseUrl}/v1/accounting-entries:search`);
  url.searchParams.set("company_id", cfg.companyId);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  // Stable ordering. Without it a cursor can revisit or skip rows when entries are updated
  // mid-sync, because the server's default order is not guaranteed.
  url.searchParams.set("sorting_keys", "id");
  url.searchParams.set("sorting_order", "ASC");
  if (cursor) url.searchParams.set("after", cursor);

  let lastError: PleoError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Every attempt gets its own AbortController: a controller that has already fired stays
    // aborted, so reusing one would make retries fail instantly.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader(cfg.apiKey),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      // 401/403 are configuration problems, not blips. Retrying wastes time and can trip
      // account lockouts, so fail immediately and loudly.
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => "");
        throw new PleoError(
          `Pleo auth failed (${res.status}). Check PLEO_API_KEY and that it has accounting scopes. ${text.slice(0, 200)}`,
          res.status,
          false,
        );
      }

      // 429 / 5xx are transient. 503 is explicitly documented as retry-safe.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2 ** attempt * 500, 8_000);
        lastError = new PleoError(`Pleo ${res.status} on attempt ${attempt}`, res.status, true);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new PleoError(
          `Pleo request failed (${res.status}): ${text.slice(0, 300)}`,
          res.status,
          false,
        );
      }

      const json = await res.json().catch(() => {
        throw new PleoError("Pleo returned a non-JSON body", res.status, false);
      });

      const data: PleoEntry[] = Array.isArray(json?.data) ? json.data : [];
      const page = json?.pagination ?? {};
      return {
        data,
        endCursor: page.endCursor ?? null,
        hasNextPage: Boolean(page.hasNextPage),
        total: typeof page.total === "number" ? page.total : undefined,
      };
    } catch (e) {
      // Network-level failures (abort/timeout/DNS) are retryable; anything already classified
      // as non-retryable propagates untouched.
      if (e instanceof PleoError && !e.retryable) throw e;
      lastError =
        e instanceof PleoError
          ? e
          : new PleoError(
              `Pleo request error: ${e instanceof Error ? e.message : String(e)}`,
              undefined,
              true,
            );
      if (attempt >= MAX_RETRIES) throw lastError;
      await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 500, 8_000)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new PleoError("Pleo request failed after retries", undefined, true);
}

export interface FetchOptions {
  /** ISO date (inclusive). Only entries performed on/after this are returned. */
  performedAtStart?: string | null;
  /** Include soft-deleted entries so deletions in Pleo can be reflected locally. */
  includeDeleted?: boolean;
  /** Safety cap on total entries pulled in one run; null = no cap. */
  maxEntries?: number | null;
}

/**
 * Fetch all accounting entries, following the cursor. Yields page by page so the caller can write
 * incrementally — a failure on page 40 then keeps the first 39 pages instead of losing everything.
 */
export async function* fetchEntries(
  cfg: PleoConfig,
  opts: FetchOptions = {},
): AsyncGenerator<{ entries: PleoEntry[]; page: number; total?: number }> {
  const body: Record<string, unknown> = {
    includeDeleted: opts.includeDeleted ?? true,
  };
  if (opts.performedAtStart) body.performedAtStart = opts.performedAtStart;

  let cursor: string | null = null;
  let page = 0;
  let seen = 0;
  const seenCursors = new Set<string>();

  while (page < MAX_PAGES) {
    const res = await requestPage(cfg, body, cursor);
    page++;

    if (res.data.length > 0) {
      yield { entries: res.data, page, total: res.total };
      seen += res.data.length;
    }

    if (!res.hasNextPage || !res.endCursor) break;
    if (opts.maxEntries && seen >= opts.maxEntries) break;

    // A cursor that repeats means the server is not advancing. Without this the loop would run
    // to MAX_PAGES re-importing the same page.
    if (seenCursors.has(res.endCursor)) {
      throw new PleoError(
        `Pleo pagination stalled: cursor ${res.endCursor.slice(0, 24)}… repeated at page ${page}`,
      );
    }
    seenCursors.add(res.endCursor);
    cursor = res.endCursor;
  }

  if (page >= MAX_PAGES) {
    throw new PleoError(
      `Pleo pagination exceeded ${MAX_PAGES} pages — aborting to avoid an endless loop`,
    );
  }
}

/** One person with a Pleo account, from GET /v2/employees. */
export interface PleoEmployee {
  id: string;
  companyId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  /** The employee's id in the customer's own ERP, when one was set. */
  code?: string;
  jobTitle?: string;
  phone?: string;
  [k: string]: unknown;
}

/**
 * Everyone with a Pleo account at this company.
 *
 * WHY THIS EXISTS ALONGSIDE THE ENTRIES. The spend side is already mirrored into
 * bank_transactions, so nothing about money needs a live call, and fetching it live would only
 * produce a second answer to a question the database already answers. What the mirror cannot
 * contain is a person who has a card and has never used it: with no entries there is nothing to
 * derive them from. This endpoint is the only way to see them.
 *
 * WHAT IT DOES NOT RETURN: cards. Pleo's public API has no cards endpoint at all -- the documented
 * families are accounting entries, export, tags, tax codes, webhooks, employees and the app
 * marketplace -- so "which cards exist" cannot be asked. An employee row is the closest thing, and
 * it carries no card number, no status and no limit.
 *
 * SCOPE: the docs list `users:read`. Whether the key in use carries it can only be established by
 * calling, so a 403 here means the key is good for accounting entries and not for this.
 *
 * Paged defensively even though a company's headcount fits one page: a loop that assumes the whole
 * list arrived is the kind of thing that silently truncates once somebody hires.
 */
export async function fetchEmployees(cfg: PleoConfig): Promise<PleoEmployee[]> {
  const out: PleoEmployee[] = [];
  let offset = 0;

  for (let page = 0; page < 50; page++) {
    const url = new URL(`${cfg.baseUrl}/v2/employees`);
    url.searchParams.set("companyId", cfg.companyId);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (offset) url.searchParams.set("offset", String(offset));

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PleoError(
        `Pleo employees failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
        res.status,
        res.status >= 500,
      );
    }

    // The response shape is not contractually fixed for us: some Pleo list endpoints answer with a
    // bare array, others wrap it. Both are accepted rather than assuming one and breaking on the
    // other the first time it is called for real.
    const body = (await res.json()) as unknown;
    const rows = Array.isArray(body)
      ? (body as PleoEmployee[])
      : (((body as { data?: unknown; employees?: unknown }).data ??
          (body as { employees?: unknown }).employees ??
          []) as PleoEmployee[]);

    out.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
    offset += rows.length;
  }
  return out;
}

export interface PleoReceipt {
  id: string;
  accountingEntryId?: string;
  createdAt?: string;
  source?: string;
  fileType?: string;
  mimeType?: string;
  sizeInBytes?: number;
  /** Presigned download URL — EXPIRES AFTER 24 HOURS, so it is metadata, not a durable link. */
  url?: string;
  ocrDocumentId?: string;
}

/**
 * Receipts attached to one accounting entry.
 *
 * GET /v1/accounting-entries/{id}/receipts
 *
 * The search endpoint returns only `receiptIds` (and sometimes not even those), so the file
 * metadata — mimeType, size, and the download URL — has to be read here. Call it ONLY for
 * entries that report receipts, otherwise a full sync costs one extra request per transaction.
 *
 * Never throws: receipts are supplementary. A failure here must not abort a transaction import,
 * so the caller gets an empty array and the sync carries on.
 */
export async function fetchReceipts(cfg: PleoConfig, entryId: string): Promise<PleoReceipt[]> {
  const url = new URL(
    `${cfg.baseUrl}/v1/accounting-entries/${encodeURIComponent(entryId)}/receipts`,
  );
  url.searchParams.set("limit", "100");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader(cfg.apiKey),
        Accept: "application/json",
      },
      signal: abort.signal,
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return Array.isArray(json?.data) ? (json.data as PleoReceipt[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A tag group: one DIMENSION somebody classifies spend along.
 *
 * Pleo's own words for what a tag is: "cost centres that are helpful in associating each expense
 * with a cost object". For Stäy that dimension is the property, which is why H2 and H4 are the
 * same data seen from two ends (docs/COST_CENTRES.md).
 */
export interface PleoTagGroup {
  id: string;
  name?: string;
  code?: string;
  archived?: boolean;
  [k: string]: unknown;
}

/** One value within a group: for Stäy, one property. */
export interface PleoTag {
  id: string;
  groupId?: string;
  name?: string;
  /** The value's id in the customer's own ERP, when one was set. */
  code?: string;
  archived?: boolean;
  [k: string]: unknown;
}

/** One line of the chart of accounts. `accountId` on an entry points here. */
export interface PleoAccount {
  id: string;
  code?: string;
  name?: string;
  archived?: boolean;
  companyId?: string;
  externalId?: string;
  [k: string]: unknown;
}

/** Both list endpoints answer either bare or wrapped, same as /v2/employees. */
function listBody<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const wrapped = body as { data?: unknown; items?: unknown };
  const rows = wrapped?.data ?? wrapped?.items;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function getJson(cfg: PleoConfig, url: URL, what: string): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PleoError(
      `Pleo ${what} failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
      res.status >= 500,
    );
  }
  return await res.json();
}

/**
 * The dimensions this company tags spend along.
 *
 * GET /v0/tag-groups
 *
 * v0, not v1: the tags family is still on the older prefix while accounting entries are on /v1.
 */
export async function fetchTagGroups(cfg: PleoConfig): Promise<PleoTagGroup[]> {
  const url = new URL(`${cfg.baseUrl}/v0/tag-groups`);
  // SNAKE_CASE HERE. Pleo is not consistent across its endpoint families: /v2/employees takes
  // `companyId`, the v0 tags family takes `company_id` and answers a camelCase one with
  // 400 "Either company_id or organization_id must be provided".
  url.searchParams.set("company_id", cfg.companyId);
  return listBody<PleoTagGroup>(await getJson(cfg, url, "tag groups"));
}

/**
 * The values inside one dimension.
 *
 * GET /v0/tag-groups/{groupId}/tags?include_archived=true
 *
 * ARCHIVED ONES INCLUDED ON PURPOSE. An entry from 2022 still carries the tag it was given, and
 * Stäy has already retired one whole group (entries moved from 9b750613 to d1a07cb2). Fetching
 * only the live values would leave every historical entry pointing at a name we cannot print.
 */
export async function fetchTags(cfg: PleoConfig, groupId: string): Promise<PleoTag[]> {
  const url = new URL(`${cfg.baseUrl}/v0/tag-groups/${encodeURIComponent(groupId)}/tags`);
  url.searchParams.set("company_id", cfg.companyId);
  url.searchParams.set("include_archived", "true");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  const rows = listBody<PleoTag>(await getJson(cfg, url, `tags of group ${groupId}`));
  return rows.map((t) => ({ ...t, groupId: t.groupId ?? groupId }));
}

/**
 * The chart of accounts, which is what `accountId` on an entry refers to.
 *
 * POST /v1/chart-of-accounts:search — a POST that reads, same shape as the entries search.
 * The two exclude flags are required by the API; both false means "give me all of them".
 */
export async function fetchAccounts(cfg: PleoConfig): Promise<PleoAccount[]> {
  const out: PleoAccount[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 50; page++) {
    const url = new URL(`${cfg.baseUrl}/v1/chart-of-accounts:search`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("after", cursor);

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader(cfg.apiKey),
          Accept: "application/json",
          "Content-Type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({
          companyId: cfg.companyId,
          excludeIfAssignedToCategory: false,
          excludeIfAssignedToContraAccount: false,
        }),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PleoError(
        `Pleo chart of accounts failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
        res.status,
        res.status >= 500,
      );
    }

    const body = (await res.json()) as {
      data?: PleoAccount[];
      pagination?: { endCursor?: string | null; hasNextPage?: boolean };
    };
    out.push(...(body.data ?? []));
    if (!body.pagination?.hasNextPage || !body.pagination.endCursor) break;
    cursor = body.pagination.endCursor;
  }
  return out;
}

/**
 * One accounting entry, in full.
 *
 * GET /v1/accounting-entries/{id}
 *
 * WHY THIS EXISTS WHEN THE SEARCH ALREADY RETURNS ENTRIES. The search omits `accountCode`: over a
 * 1.000-row sample of what it gave us, not one row carried it, while the single-entry schema
 * documents it. That code is the DATEV number (4650 Bewirtungskosten, 4530 Kfz-Betriebskosten),
 * which is the thing a tax adviser actually reads, so one call per distinct category is worth it.
 *
 * Never throws: this is a naming nicety, and a failure here must not take a run down.
 */
export async function fetchEntry(
  cfg: PleoConfig,
  entryId: string,
): Promise<{ status: number | null; entry: PleoEntry | null; note: string | null }> {
  const url = new URL(`${cfg.baseUrl}/v1/accounting-entries/${encodeURIComponent(entryId)}`);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader(cfg.apiKey), Accept: "application/json" },
      signal: abort.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // The STATUS comes back, not just null. A first attempt swallowed every failure and reported
      // "0 of 19 named", which is the same answer for "refused", "not found" and "no such field".
      return { status: res.status, entry: null, note: text.slice(0, 200) || null };
    }
    const body = (await res.json()) as PleoEntry | { data?: PleoEntry };
    const entry = (body as { data?: PleoEntry }).data ?? (body as PleoEntry) ?? null;
    return { status: res.status, entry, note: null };
  } catch (e) {
    return { status: null, entry: null, note: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with a concurrency cap — a full sync must not open 2,000 sockets at once. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
