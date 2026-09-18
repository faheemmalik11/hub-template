// pleo-receipts — download Pleo receipt DOCUMENTS into Supabase Storage.
//
// pleo-sync records receipt metadata (id, mime, size). This fetches the actual files, because
// for GoBD the document has to live in our system: a reference to a file on Pleo's servers is
// not evidence and vanishes if the account is closed.
//
// WHY A SEPARATE FUNCTION: an Edge Function has a wall-clock limit; ~2,000 downloads cannot run
// in one invocation. This processes a bounded batch per call and reports how many remain, so it
// can be called repeatedly (or on a schedule) until `remaining` is 0.
//
// WHY IT RE-REQUESTS URLs: Pleo's download links expire after 24 hours. Storing them would give
// a table of dead links, so a fresh URL is requested from the receipts endpoint at download time.
//
// IDEMPOTENT: a file already in invoice_files (matched on source + external_id) is skipped, so
// re-running only picks up what is missing.

import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { fetchReceipts, mapLimit, pleoConfig, type PleoReceipt } from "../_shared/pleo.ts";
import { TABLE } from "../_shared/tables.ts";

// Where a downloaded Pleo receipt is stored, and what goes into document_files.storage_bucket
// for it. Moved with the rest of the originals on 16.09.2026; see
// docs/TABLE_NAMING_MIGRATION.md. Redeploy this function after changing it.
const BUCKET = "documents";
/** Transactions handled per invocation. Keeps a run well inside the wall-clock limit. */
const DEFAULT_BATCH = 25;
/** Parallel downloads. Modest: these are real file transfers, not JSON calls. */
const DOWNLOAD_CONCURRENCY = 4;
/** Skip anything implausible for a receipt — a runaway response must not exhaust memory. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

function authorized(req: Request): boolean {
  const secret = Deno.env.get("SYNC_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization");
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;
  if (secret && req.headers.get("x-sync-secret") === secret) return true;
  return !secret && !serviceKey;
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

function extensionFor(mime: string | null | undefined): string {
  switch ((mime ?? "").toLowerCase()) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/heic":
      return "heic";
    default:
      return "bin";
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  const db = serviceClient();
  const runId = crypto.randomUUID();
  const stats = { transactions: 0, downloaded: 0, skipped: 0, failed: 0, bytes: 0, remaining: 0 };

  const log = async (event: string, level: string, message: string, counts: unknown = {}) => {
    try {
      await db.from(TABLE.bankSyncLogs).insert({ run_id: runId, event, level, message, counts });
    } catch {
      /* logging must never break the run */
    }
  };

  try {
    const url = new URL(req.url);
    const batchSize = Math.min(
      Math.max(Number(url.searchParams.get("batch")) || DEFAULT_BATCH, 1),
      200,
    );
    const cfg = pleoConfig();

    // RPC, not a PostgREST query: this is an anti-join ("receipts with no matching
    // invoice_files row") which PostgREST cannot express. The first version fetched a fixed
    // window of the oldest rows and filtered client-side, so once that window was downloaded it
    // returned nothing and the loop stalled at 197 of ~1,970 files. See migration 0075.
    const { data: todo, error: qErr } = await db.rpc("pending_receipt_downloads", {
      p_limit: batchSize,
    });
    if (qErr) throw qErr;

    // Which individual files are already stored, so a partially-done transaction only fetches
    // the parts it is missing.
    const txIds = (todo ?? []).map((t: { id: string }) => t.id);
    const { data: existing } = await db
      .from(TABLE.documentFiles)
      .select("transaction_id, external_id")
      .in("transaction_id", txIds.length ? txIds : ["00000000-0000-0000-0000-000000000000"]);
    const storedByTx = new Map<string, Set<string>>();
    for (const f of existing ?? []) {
      if (!f.transaction_id) continue;
      if (!storedByTx.has(f.transaction_id)) storedByTx.set(f.transaction_id, new Set());
      if (f.external_id) storedByTx.get(f.transaction_id)!.add(f.external_id);
    }

    stats.transactions = (todo ?? []).length;
    await log("receipts_start", "info", `Downloading receipts for ${todo.length} transactions`, {
      batchSize,
    });

    for (const tx of (todo ?? []) as { id: string; external_id: string; booking_date: string }[]) {
      // Fresh URLs — the ones captured during the sync have expired.
      let receipts: PleoReceipt[] = [];
      try {
        receipts = await fetchReceipts(cfg, tx.external_id as string);
      } catch {
        stats.failed++;
        continue;
      }
      const have = storedByTx.get(tx.id) ?? new Set<string>();
      const missing = receipts.filter((r) => r.id && r.url && !have.has(r.id));

      await mapLimit(missing, DOWNLOAD_CONCURRENCY, async (r) => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT_MS);
        try {
          const res = await fetch(r.url!, { signal: abort.signal });
          if (!res.ok) {
            stats.failed++;
            return;
          }

          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength === 0 || buf.byteLength > MAX_FILE_BYTES) {
            stats.skipped++;
            return;
          }

          const mime = r.mimeType ?? res.headers.get("content-type") ?? "application/octet-stream";
          // Path groups by month so the bucket stays browsable at thousands of files.
          const month = String(tx.booking_date ?? "").slice(0, 7) || "unknown";
          const path = `pleo/${month}/${tx.external_id}/${r.id}.${extensionFor(mime)}`;

          const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, {
            contentType: mime,
            upsert: true, // a retry after a partial failure must not 409
          });
          if (upErr) {
            stats.failed++;
            return;
          }

          // checksum stored for GoBD integrity: proves the file has not changed since capture.
          const { error: insErr } = await db.from(TABLE.documentFiles).insert({
            transaction_id: tx.id,
            external_id: r.id,
            source: "pleo",
            filename: `${r.id}.${extensionFor(mime)}`,
            mime,
            size_bytes: buf.byteLength,
            role: "original",
            storage_bucket: BUCKET,
            storage_path: path,
            checksum_sha256: await sha256Hex(buf),
          });
          // 23505 = already inserted by a concurrent run; not an error.
          if (insErr && insErr.code !== "23505") {
            stats.failed++;
            return;
          }

          stats.downloaded++;
          stats.bytes += buf.byteLength;
        } catch {
          stats.failed++;
        } finally {
          clearTimeout(timer);
        }
      });
    }

    // Remaining FILES, not transactions — a transaction can carry several receipts, so the old
    // transaction-vs-file comparison never reached zero.
    const { data: remaining } = await db.rpc("pending_receipt_count");
    stats.remaining = typeof remaining === "number" ? remaining : 0;

    await log("receipts_done", "info", `Downloaded ${stats.downloaded} receipt files`, stats);
    return jsonResponse({ ok: true, run_id: runId, ...stats });
  } catch (e) {
    const msg = errorMessage(e);
    await log("receipts_error", "error", `Receipt download failed: ${msg}`, stats);
    return jsonResponse({ ok: false, run_id: runId, error: msg, ...stats }, 500);
  }
});
