// pleo-sync — import Pleo accounting entries (employee card spend) into bank_transactions.
//
// bank_transactions is the single source of truth for every transaction, discriminated by
// `source` (banksapi | pleo | manual). Nothing downstream — matching, OPOS, reporting,
// auto-categorisation — branches on provider, so Pleo rows work everywhere for free.
//
// IDEMPOTENT: upserts on (source, external_id). Re-running never duplicates, and an entry edited
// in Pleo (a receipt attached, a cost centre set) is updated in place.
//
// INCREMENTAL: by default it re-reads a lookback window rather than only "since last sync". Pleo
// entries mutate after they appear — settlement, review status, receipts — so a strict watermark
// would freeze stale rows. Pass ?full=1 for a complete history reload.
//
// AUTH / DEPLOYMENT: this function has NO entry in supabase/config.toml, so the Edge gateway
// enforces verify_jwt = true (the default) — same posture as bank-sync. Consequences:
//   * the gateway rejects any call without a valid JWT BEFORE this code runs, so x-sync-secret
//     alone is never enough (see the note in migration 0035);
//   * the check below is therefore a SECOND gate: a valid *user* JWT gets past the gateway, but
//     only the service-role key or the shared secret gets past this.
// Call it with:  Authorization: Bearer <service_role_key>   (plus x-sync-secret if configured).

import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  fetchEmployees,
  fetchEntries,
  type PleoConfig,
  fetchReceipts,
  mapLimit,
  pleoConfig,
  PleoError,
  signedAmount,
  type PleoEntry,
  type PleoReceipt,
} from "../_shared/pleo.ts";
import { TABLE } from "../_shared/tables.ts";

/** Days of history re-read on a normal run. Covers late settlement and post-hoc edits. */
const DEFAULT_LOOKBACK_DAYS = 90;
/** Rows per upsert. Small enough to stay well inside statement limits, large enough to be quick. */
const BATCH_SIZE = 500;
/** Parallel receipt lookups. Enough to be quick, low enough not to hammer Pleo or exhaust sockets. */
const RECEIPT_CONCURRENCY = 8;

function authorized(req: Request): boolean {
  const secret = Deno.env.get("SYNC_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization");

  // Service-role key is always sufficient — that is what pg_cron and any server-side caller send.
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;

  // Shared secret, when one is configured.
  if (secret && req.headers.get("x-sync-secret") === secret) return true;

  // With neither configured we are running locally (`supabase functions serve`), where the
  // gateway does not enforce verify_jwt. Matching bank-sync, allow it rather than making the
  // function untestable — production always has SUPABASE_SERVICE_ROLE_KEY injected.
  return !secret && !serviceKey;
}

// Supabase returns PostgrestError as a PLAIN OBJECT ({message, details, hint, code}), not an
// Error instance — `e instanceof Error` misses it and the message renders as "[object Object]",
// which is exactly the case worth diagnosing. Same handling as bank-sync.
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; hint?: string; code?: string };
    if (p.message || p.code) {
      return [p.message, p.details, p.hint, p.code && `[${p.code}]`].filter(Boolean).join(" | ");
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e ?? "unknown error");
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString();
}

/** Date-only, or null. Pleo sends full timestamps; bank_transactions stores dates. */
function toDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** employeeId -> the person, built once per run from /v2/employees. */
type EmployeeIndex = Map<string, { name: string | null; email: string | null }>;

/**
 * Who spent the money.
 *
 * TWO SOURCES, IN ORDER. Pleo sometimes inlines an `employee` object on the entry and sometimes
 * sends only `employeeId`, and this read the inlined object alone -- so 137 real card purchases
 * (ALDI, REWE, BAUHAUS) landed with nobody's name on them while Pleo knew perfectly well whose
 * they were. The employee list resolves the rest; it costs one request per run for the whole
 * company, and the ids in question resolved to just 8 people.
 *
 * A genuinely empty result is still correct for some entries: a WALLET/LOAD is the company topping
 * up its own wallet and a PLEO_INVOICE is Pleo billing us, neither of which anybody "spent".
 */
function spenderOf(
  entry: PleoEntry,
  employees: EmployeeIndex,
): { name: string | null; email: string | null } {
  const e = entry.employee as
    { first_name?: string; last_name?: string; email?: string } | undefined;
  const name = trimOrNull(`${e?.first_name ?? ""} ${e?.last_name ?? ""}`);
  const email = trimOrNull(e?.email)?.toLowerCase() ?? null;
  if (name || email) return { name, email };

  const byId = trimOrNull(entry.employeeId) ? employees.get(entry.employeeId as string) : undefined;
  return { name: byId?.name ?? null, email: byId?.email ?? null };
}

/** One request for the whole company; failure is not fatal -- the sync is about transactions. */
async function employeeIndex(cfg: PleoConfig): Promise<EmployeeIndex> {
  const index: EmployeeIndex = new Map();
  const people = await fetchEmployees(cfg);
  for (const p of people) {
    if (!p.id) continue;
    index.set(p.id, {
      name: trimOrNull(`${p.firstName ?? ""} ${p.lastName ?? ""}`),
      email: trimOrNull(p.email)?.toLowerCase() ?? null,
    });
  }
  return index;
}

interface MappedRow {
  source: "pleo";
  external_id: string;
  amount: number;
  currency: string | null;
  booking_date: string | null;
  value_date: string | null;
  booking_text: string | null;
  payment_reference: string | null;
  counterparty_holder: string | null;
  spender_name: string | null;
  spender_email: string | null;
  pleo_tag_id: string | null;
  pleo_account_id: string | null;
  is_sandbox: boolean;
  transaction_type: string;
  transaction_type_source: string;
  raw_data: Record<string, unknown>;
}

/**
 * Map one Pleo entry onto a bank_transactions row. Returns null for entries that cannot be
 * represented — skipped and counted rather than written as a corrupt row.
 *
 * Only PROVIDER-OWNED fields are set. `direction` is generated from the sign of `amount`, and
 * `matching_status` plus every user-set column are omitted so re-syncs cannot overwrite them.
 */
function mapEntry(
  entry: PleoEntry,
  receipts: PleoReceipt[],
  employees: EmployeeIndex,
): { row: MappedRow | null; skip?: string } {
  const id = trimOrNull(entry.id);
  if (!id) return { row: null, skip: "missing id" };

  const amount = signedAmount(entry);
  if (amount === null) return { row: null, skip: "no transactionValue/totalBillValue" };

  const merchant = trimOrNull(entry.merchant?.name);
  const spender = spenderOf(entry, employees);
  const currency =
    trimOrNull(entry.transactionValue?.currency) ?? trimOrNull(entry.totalBillValue?.currency);

  // bookkeepingDate is the accounting date and the right bucket for reporting; settledAt and
  // performedAt are fallbacks for entries not yet booked.
  const bookingDate =
    toDate(entry.bookkeepingDate) ?? toDate(entry.settledAt) ?? toDate(entry.performedAt);
  const valueDate = toDate(entry.settledAt) ?? toDate(entry.performedAt);

  return {
    row: {
      source: "pleo",
      external_id: id,
      amount,
      currency,
      booking_date: bookingDate,
      value_date: valueDate,
      booking_text: merchant,
      payment_reference: trimOrNull(entry.note),
      counterparty_holder: merchant,
      spender_name: spender.name,
      spender_email: spender.email,
      // WHAT PLEO SAYS THIS SPEND IS. Both are Pleo's own ids, so they belong to the provider and
      // may be rewritten every run. What they MEAN here is a mapping a person owns, kept on
      // pleo_tags/pleo_accounts, which this never touches (migration 20260914100000).
      //
      // The first tag, not an aggregate: one per entry in this data, and picking arbitrarily from
      // several would file the spend under a property nobody chose.
      pleo_tag_id: trimOrNull((entry.tags as { tagId?: string }[] | undefined)?.[0]?.tagId ?? null),
      pleo_account_id: trimOrNull(entry.accountId),
      // matching_status is DELIBERATELY ABSENT. An upsert writes every column it is given, so
      // including it would reset a transaction a user had already matched ('zugeordnet') back to
      // 'offen' on the next sync -- silently destroying matching work on every run. The column
      // defaults to 'offen' on INSERT and is left untouched on UPDATE. The same reasoning applies
      // to every other locally-owned column (category_id, no_receipt_reason, company_id, ...):
      // this function must only ever write fields Pleo owns.
      is_sandbox: false,
      // Every Pleo entry is card spend, whether card purchase or out-of-pocket reimbursement.
      transaction_type: "kreditkarte",
      transaction_type_source: "auto",
      // Keep the entire payload. Employee, cost centre, tags, receipt ids, export/review status
      // have no dedicated columns and would otherwise be lost.
      raw_data: {
        ...entry,
        pleo_employee_id: entry.employeeId ?? null,
        pleo_company_id: entry.companyId ?? null,
        pleo_receipt_ids: entry.receiptIds ?? [],
        // Receipt METADATA, fetched separately: the search endpoint returns ids at best.
        // `url` is a presigned link that expires after 24h, so it is a hint for a later
        // download, never a durable reference. Omitted entirely when the lookup found
        // nothing, so the merge in upsert_external_transactions cannot erase metadata
        // captured by an earlier run.
        ...(receipts.length
          ? {
              receipts: receipts.map((r) => ({
                id: r.id,
                mime_type: r.mimeType ?? null,
                file_type: r.fileType ?? null,
                size_bytes: r.sizeInBytes ?? null,
                source: r.source ?? null,
                ocr_document_id: r.ocrDocumentId ?? null,
                fetched_url_expires: r.url ? true : false,
              })),
              receipt_count: receipts.length,
            }
          : {}),
        amount_minor: entry.transactionValue?.minors ?? null,
        synced_at: new Date().toISOString(),
      },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  const runId = crypto.randomUUID();
  const db = serviceClient();

  const log = async (
    event: string,
    level: "info" | "warn" | "error",
    message: string,
    counts: Record<string, unknown> = {},
  ) => {
    // Logging must never be the reason a sync fails.
    try {
      await db.from(TABLE.bankSyncLogs).insert({ run_id: runId, event, level, message, counts });
    } catch {
      /* ignore */
    }
  };

  const stats = {
    fetched: 0,
    written: 0,
    skipped: 0,
    pages: 0,
    deleted: 0,
    duplicates: 0,
    receipts: 0,
    /** Rows that already existed without a name and got one from the employee list. */
    spendersRepaired: 0,
  };

  try {
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "1";
    // A negative or absurd ?days would silently produce a future start date and fetch nothing,
    // which looks like "Pleo returned no data" rather than a bad request.
    const daysParam = Number(url.searchParams.get("days"));
    const lookbackDays =
      Number.isFinite(daysParam) && daysParam > 0
        ? Math.min(daysParam, 3650)
        : DEFAULT_LOOKBACK_DAYS;

    const cfg = pleoConfig(); // throws with a precise message if env is incomplete
    const performedAtStart = full ? null : isoDaysAgo(lookbackDays);

    const { data: pleoAccount } = await db
      .from(TABLE.bankAccounts)
      .select("id")
      .eq("metadata->>source", "pleo")
      .maybeSingle();
    const pleoAccountId: string | null = pleoAccount?.id ?? null;
    if (!pleoAccountId) {
      await log(
        "account_missing",
        "warn",
        "No Pleo bank account row — transactions stay unassigned",
      );
    }

    await log("start", "info", full ? "Full Pleo reload" : `Pleo sync, last ${lookbackDays} days`, {
      company_id: cfg.companyId,
      base_url: cfg.baseUrl,
    });

    // One request for the whole company, before the pages. Not fatal if it fails: an entry that
    // inlines its employee still gets a name, and the backfill below simply finds nothing to do.
    let employees: EmployeeIndex = new Map();
    try {
      employees = await employeeIndex(cfg);
      await log("employees", "info", `Employee index: ${employees.size} people`);
    } catch (e) {
      await log("employees_failed", "warn", `Employee list unavailable: ${errorMessage(e)}`);
    }

    for await (const page of fetchEntries(cfg, { performedAtStart, includeDeleted: true })) {
      stats.pages = page.page;
      stats.fetched += page.entries.length;

      // Fetch receipt metadata only for entries that report receipts — otherwise a full sync
      // costs one extra request per transaction for nothing.
      const needReceipts = page.entries.filter(
        (e) => !e.deletedAt && Array.isArray(e.receiptIds) && e.receiptIds.length > 0,
      );
      const receiptsById = new Map<string, PleoReceipt[]>();
      if (needReceipts.length) {
        const fetched = await mapLimit(needReceipts, RECEIPT_CONCURRENCY, (e) =>
          fetchReceipts(cfg, e.id),
        );
        needReceipts.forEach((e, i) => receiptsById.set(e.id, fetched[i] ?? []));
        stats.receipts += fetched.reduce((n, r) => n + r.length, 0);
      }

      const rows: MappedRow[] = [];
      for (const entry of page.entries) {
        // Deleted in Pleo: do not import. Existing rows are left untouched rather than removed,
        // because a transaction already matched to an invoice must not vanish from the audit
        // trail — flag it for review instead.
        if (entry.deletedAt) {
          stats.deleted++;
          continue;
        }
        const { row, skip } = mapEntry(entry, receiptsById.get(entry.id) ?? [], employees);
        if (!row) {
          stats.skipped++;
          await log("skip", "warn", `Entry skipped: ${skip}`, { pleo_id: entry.id ?? null });
          continue;
        }
        rows.push(row);
      }

      // Postgres rejects an ON CONFLICT statement that touches the same row twice
      // ("cannot affect row a second time"), which aborts the WHOLE batch. Pleo can return the
      // same entry twice within a page after an edit, so collapse duplicates first, keeping the
      // last occurrence.
      const byId = new Map<string, MappedRow>();
      for (const r of rows) byId.set(r.external_id, r);
      const deduped = [...byId.values()];
      stats.duplicates += rows.length - deduped.length;

      // Write per page, in batches. A later failure keeps everything already imported.
      for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE);
        // RPC, not .upsert(): a PostgREST upsert REPLACES raw_data, which silently destroyed
        // receipt metadata captured by the original backfill (Pleo's search response does not
        // return mime_type/size_bytes/storage_ref). upsert_external_transactions merges raw_data
        // and leaves user-owned columns alone. See migration 0073.
        const { error } = await db.rpc("upsert_external_transactions", {
          p_rows: batch,
          p_account_id: pleoAccountId,
        });
        if (error) {
          await log(
            "write_error",
            "error",
            `Upsert failed on page ${page.page}: ${error.message}`,
            {
              batch_size: batch.length,
              written_so_far: stats.written,
            },
          );
          throw new Error(`bank_transactions upsert failed: ${error.message}`);
        }
        stats.written += batch.length;
      }
    }

    // HISTORY, NOT JUST NEW ROWS. A scheduled run only re-reads the lookback window, so the rows
    // that landed without a name before this fix would have stayed anonymous forever unless
    // somebody remembered to trigger ?full=1. They carry `raw_data->>employeeId` already, so the
    // name is one map lookup away and no Pleo call is needed to repair them.
    //
    // Narrow by construction: only rows that HAVE an employeeId and are still missing the name, so
    // once the backlog is drained this finds nothing and costs a single indexed-ish scan per run.
    if (employees.size > 0) {
      const { data: anonym, error: anonymError } = await db
        .from(TABLE.bankTransactions)
        .select("id, raw_data->>employeeId")
        .eq("source", "pleo")
        .is("spender_name", null)
        .not("raw_data->>employeeId", "is", null)
        .limit(2000);
      if (anonymError) {
        await log("backfill_failed", "warn", `Spender backfill skipped: ${anonymError.message}`);
      } else {
        for (const row of (anonym ?? []) as { id: string; employeeId: string | null }[]) {
          const person = row.employeeId ? employees.get(row.employeeId) : undefined;
          if (!person || (!person.name && !person.email)) continue;
          const { error: upError } = await db
            .from(TABLE.bankTransactions)
            .update({ spender_name: person.name, spender_email: person.email })
            .eq("id", row.id);
          if (upError) {
            await log("backfill_failed", "warn", `Row ${row.id}: ${upError.message}`);
            break;
          }
          stats.spendersRepaired++;
        }
        if (stats.spendersRepaired > 0) {
          await log(
            "backfill",
            "info",
            `Named ${stats.spendersRepaired} transactions from the employee list`,
          );
        }
      }
    }

    await log("done", "info", `Pleo sync finished: ${stats.written} transactions`, stats);
    return jsonResponse({ ok: true, run_id: runId, ...stats });
  } catch (e) {
    const msg = errorMessage(e);
    const status = e instanceof PleoError && e.status === 401 ? 401 : 500;
    await log("error", "error", `Pleo sync failed: ${msg}`, stats);
    // Partial progress is reported, not hidden — the caller can see how far it got.
    return jsonResponse({ ok: false, run_id: runId, error: msg, ...stats }, status);
  }
});
