// ingest — the single entry point for pulling transactions from every scheduled source.
//
// WHY ONE FUNCTION: transactions arrive from three places (banksapi, pleo, manual upload) and the
// scheduled ones were drifting apart — bank-sync had an hourly cron while pleo-sync had none, so
// Pleo only ran when somebody remembered. There was no single answer to "did ingestion run, and
// did it work?". One cron, one run_id, one log line per run.
//
// USAGE
//   POST /ingest                  every scheduled source (what the cron calls)
//   POST /ingest?source=pleo      one source — what a "Sync Pleo" button calls
//   POST /ingest?source=banksapi  one source — what a "Sync bank" button calls
//   POST /ingest?receipts=1       also pull Pleo receipt FILES afterwards
//
// WHY IT ORCHESTRATES RATHER THAN INLINES: each source runs as its own function invocation, so it
// gets its own wall-clock budget. Inlining them would mean a slow BANKSapi could starve Pleo and
// take the whole run down with it. It also keeps pleo-sync / bank-sync independently callable,
// which matters when debugging one source in isolation.
//
// MANUAL UPLOAD IS NOT HERE: it is user-triggered (someone uploads XML/CSV/Excel), not scheduled.

import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

/** Scheduled sources. `manual` is deliberately absent — nothing to poll. */
const SOURCES = {
  banksapi: { fn: "bank-sync", label: "BANKSapi (bank accounts + company cards)" },
  pleo: { fn: "pleo-sync", label: "Pleo (employee cards)" },
} as const;
type SourceKey = keyof typeof SOURCES;

/** Per source. Generous, but bounded: one stuck source must not hold the whole run open. */
const SOURCE_TIMEOUT_MS = 240_000;

function authorized(req: Request): boolean {
  const secret = Deno.env.get("SYNC_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization");
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;
  if (secret && req.headers.get("x-sync-secret") === secret) return true;
  return !secret && !serviceKey; // local `functions serve`
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; hint?: string; code?: string };
    if (p.message || p.code) {
      return [p.message, p.details, p.hint, p.code && `[${p.code}]`].filter(Boolean).join(" | ");
    }
  }
  return String(e ?? "unknown error");
}

interface SourceResult {
  source: SourceKey | "receipts";
  ok: boolean;
  status: number | null;
  ms: number;
  detail: unknown;
}

/** Invoke one source function. Never throws: a failing source is a result, not a crash. */
async function runSource(
  name: SourceKey | "receipts",
  fn: string,
  query: string,
): Promise<SourceResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const started = Date.now();

  if (!url || !serviceKey) {
    return {
      source: name,
      ok: false,
      status: null,
      ms: 0,
      detail: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in the function env",
    };
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/functions/v1/${fn}${query}`, {
      method: "POST",
      headers: {
        // Service role satisfies both the gateway's verify_jwt and each function's own gate.
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(Deno.env.get("SYNC_SECRET") ? { "x-sync-secret": Deno.env.get("SYNC_SECRET")! } : {}),
      },
      body: "{}",
      signal: abort.signal,
    });
    const text = await res.text();
    let detail: unknown = text.slice(0, 800);
    try {
      detail = JSON.parse(text);
    } catch {
      /* keep the raw text — a non-JSON body is usually the interesting case */
    }
    return { source: name, ok: res.ok, status: res.status, ms: Date.now() - started, detail };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      source: name,
      ok: false,
      status: null,
      ms: Date.now() - started,
      detail: aborted ? `timed out after ${SOURCE_TIMEOUT_MS / 1000}s` : errorMessage(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  const runId = crypto.randomUUID();
  const db = serviceClient();
  const log = async (event: string, level: string, message: string, counts: unknown = {}) => {
    try {
      await db.from(TABLE.bankSyncLogs).insert({ run_id: runId, event, level, message, counts });
    } catch {
      /* logging must never break ingestion */
    }
  };

  const url = new URL(req.url);
  const requested = (url.searchParams.get("source") ?? "all").toLowerCase();
  const withReceipts = url.searchParams.get("receipts") === "1";

  if (requested !== "all" && !(requested in SOURCES)) {
    return jsonResponse(
      {
        error: `unknown source "${requested}". Use one of: ${Object.keys(SOURCES).join(", ")}, or omit for all.`,
      },
      400,
    );
  }

  const keys = (requested === "all" ? Object.keys(SOURCES) : [requested]) as SourceKey[];
  await log("ingest_start", "info", `Ingest: ${keys.join(", ")}`, {
    run_id: runId,
    receipts: withReceipts,
  });

  // Sequential on purpose. Both sources write to bank_transactions and the matching engine reads
  // it; running them concurrently would interleave a half-imported set with matching over it.
  const results: SourceResult[] = [];
  for (const key of keys) {
    results.push(await runSource(key, SOURCES[key].fn, ""));
  }

  // Receipt FILES are a follow-on job, not a source: they need the transactions to exist first.
  // Opt-in because it is long-running — the caller decides, the cron normally does not.
  if (withReceipts && keys.includes("pleo")) {
    results.push(await runSource("receipts", "pleo-receipts", "?batch=50"));
  }

  const failed = results.filter((r) => !r.ok);

  // One row per source, so the sync log shows what each provider did rather than a single opaque
  // entry. The detail object goes in the message, not in counts.
  for (const r of results) {
    await log(
      `ingest_${r.source}`,
      r.ok ? "info" : "error",
      `${r.source}: ${r.ok ? "ok" : "failed"} (HTTP ${r.status ?? "—"}) ${
        typeof r.detail === "string"
          ? r.detail.slice(0, 200)
          : JSON.stringify(r.detail).slice(0, 200)
      }`,
      { seconds: Math.round(r.ms / 1000) },
    );
  }

  // counts must be FLAT NUMBERS: the sync-log panel renders `${value} ${label}` per key, so an
  // array or object here comes out as "[object Object]" — which is exactly what it did.
  await log(
    "ingest_done",
    failed.length ? "warn" : "info",
    failed.length
      ? `Ingest finished with ${failed.length} of ${results.length} source(s) failing`
      : `Ingest finished: ${results.length} source(s) ok`,
    {
      sources_ok: results.length - failed.length,
      sources_failed: failed.length,
      seconds: Math.round(results.reduce((n, r) => n + r.ms, 0) / 1000),
    },
  );

  // 200 even when a source failed: the run itself completed, and the per-source detail is in the
  // body. A 500 here would make the cron look broken when only one provider was down.
  return jsonResponse({
    ok: failed.length === 0,
    run_id: runId,
    sources: results.map((r) => ({
      source: r.source,
      ok: r.ok,
      status: r.status,
      ms: r.ms,
      detail: r.detail,
    })),
  });
});
