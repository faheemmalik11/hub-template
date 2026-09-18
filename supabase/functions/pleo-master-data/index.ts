// pleo-master-data — mirror Pleo's tag values and chart of accounts into the Hub.
//
// WHY. Every Pleo accounting entry already carries which property the spend belongs to and which
// account it books to, but only as opaque UUIDs: `tags[].tagId` and `accountId`. The entries
// endpoint never sends the names, so the Hub could store the whole payload (and does, in
// bank_transactions.raw_data) and still be unable to show a person what any of it means.
//
// This fills that gap once per run, into pleo_tags and pleo_accounts (migration
// 20260914100000). It is deliberately separate from pleo-sync: spend arrives every hour and
// changes constantly, whereas a chart of accounts and a list of properties change a few times a
// year. Running them together would mean 14 accounts re-fetched 8.760 times a year for nothing.
//
// WHAT IT DOES NOT DO. It never sets `property_id` or `category_id` on those tables. Which Hub
// property a Pleo tag means is a judgement, and a receipt filed against the wrong property is a
// wrong number in the tax adviser's books. The mapping is made by a person, once, and this
// function leaves it alone on every subsequent run.
import {
  fetchAccounts,
  fetchEntry,
  fetchTagGroups,
  fetchTags,
  mapLimit,
  pleoConfig,
  PleoError,
} from "../_shared/pleo.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";

function authorized(req: Request): boolean {
  const secret = Deno.env.get("SYNC_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization");
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;
  if (secret && req.headers.get("x-sync-secret") === secret) return true;
  // Neither configured means `supabase functions serve` locally, same allowance as pleo-sync.
  return !secret && !serviceKey;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  const runId = crypto.randomUUID();
  const db = serviceClient();
  const log = async (event: string, level: "info" | "warn" | "error", message: string) => {
    try {
      await db.from(TABLE.bankSyncLogs).insert({ run_id: runId, event, level, message });
    } catch {
      /* logging must never be the reason this fails */
    }
  };

  // THE TWO HALVES ARE INDEPENDENT. Tags and the chart of accounts are separate resources with
  // separate scopes on the Pleo key, and the first run proved they can differ: tags came back 403
  // "Required permission 'READ' on resource 'tag-group'" while nothing had been learned about
  // accounts at all, because an early throw abandoned the run. A discovery tool that reports one
  // failure and hides the other costs a redeploy per question.
  async function half<T>(
    what: string,
    run: () => Promise<T>,
  ): Promise<{ value: T | null; error: string | null }> {
    try {
      return { value: await run(), error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(`pleo_master_${what}_failed`, "warn", message);
      return { value: null, error: message };
    }
  }

  try {
    const cfg = pleoConfig();
    await log("pleo_master_start", "info", "Pleo master data: tags and chart of accounts");

    // ---- tags -------------------------------------------------------------
    // Every group, not only the one in use today: Stäy has already retired one whole group, and
    // entries from before the switch still point into it.
    const tagsPart = await half("tags", async () => {
      const groups = await fetchTagGroups(cfg);
      const rows: Record<string, unknown>[] = [];
      for (const g of groups) {
        for (const t of await fetchTags(cfg, g.id)) {
          rows.push({
            id: t.id,
            group_id: t.groupId ?? g.id,
            name: t.name ?? null,
            code: t.code ?? null,
            archived: Boolean(t.archived),
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
      // property_id and is_overhead are NOT in the payload, so the upsert cannot touch them: a
      // mapping somebody made survives every future run.
      if (rows.length) {
        const { error } = await db.from(TABLE.pleoTags).upsert(rows, { onConflict: "id" });
        if (error) throw new Error(`pleo_tags upsert: ${error.message}`);
      }
      return { groups, rows };
    });

    // ---- chart of accounts ------------------------------------------------
    const accountsPart = await half("accounts", async () => {
      const accounts = await fetchAccounts(cfg);
      const rows = accounts.map((a) => ({
        id: a.id,
        code: a.code ?? null,
        name: a.name ?? null,
        archived: Boolean(a.archived),
        external_id: a.externalId ?? null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error } = await db.from(TABLE.pleoAccounts).upsert(rows, { onConflict: "id" });
        if (error) throw new Error(`pleo_accounts upsert: ${error.message}`);
      }
      return rows;
    });

    // ---- the categories entries actually reference ------------------------
    // NOT the same population as the chart of accounts above. Over 1.000 rows, the 17 accountIds
    // in use and the 11 accounts that endpoint returns do not overlap at all: Pleo documents
    // accountId as "the account (Category)", and the synced chart of accounts is the ERP side that
    // a bookkeeper maps categories ONTO. So the ids on our transactions have to be named from the
    // entries themselves, one call per distinct category rather than one per transaction.
    const categoriesPart = await half("categories", async () => {
      const { data: seen, error } = await db
        .from(TABLE.bankTransactions)
        .select("pleo_account_id, external_id")
        .eq("source", "pleo")
        .not("pleo_account_id", "is", null)
        .limit(5000);
      if (error) throw new Error(`reading known categories: ${error.message}`);

      // One representative entry per distinct id. Every entry with the same accountId carries the
      // same code, so the first is as good as any.
      const oneEach = new Map<string, string>();
      for (const r of (seen ?? []) as { pleo_account_id: string; external_id: string }[]) {
        if (r.external_id && !oneEach.has(r.pleo_account_id)) {
          oneEach.set(r.pleo_account_id, r.external_id);
        }
      }

      const pairs = [...oneEach.entries()];
      const statuses: Record<string, number> = {};
      let sampleKeys: string[] = [];
      let sampleNote: string | null = null;

      const resolved = await mapLimit(pairs, 4, async ([accountId, entryId]) => {
        const { status, entry, note } = await fetchEntry(cfg, entryId);
        const key = status === null ? "network" : String(status);
        statuses[key] = (statuses[key] ?? 0) + 1;
        if (note && !sampleNote) sampleNote = note;
        // The field list of one real entry, so "no accountCode" can be told apart from "the call
        // never succeeded" without another deploy.
        if (entry && sampleKeys.length === 0) sampleKeys = Object.keys(entry).sort();
        const code = typeof entry?.accountCode === "string" ? entry.accountCode.trim() : "";
        return code ? { id: accountId, code } : null;
      });

      const rows = resolved
        .filter((r): r is { id: string; code: string } => r !== null)
        .map((r) => ({
          id: r.id,
          code: r.code,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      // `name` is deliberately absent from the payload, so a name the chart-of-accounts half
      // already wrote is not blanked by this one.
      if (rows.length) {
        const { error: upErr } = await db
          .from(TABLE.pleoAccounts)
          .upsert(rows, { onConflict: "id" });
        if (upErr) throw new Error(`pleo_accounts (categories) upsert: ${upErr.message}`);
      }
      return { asked: pairs.length, named: rows.length, rows, statuses, sampleKeys, sampleNote };
    });

    const summary = {
      groups: tagsPart.value?.groups.length ?? 0,
      tags: tagsPart.value?.rows.length ?? 0,
      accounts: accountsPart.value?.length ?? 0,
      categories_asked: categoriesPart.value?.asked ?? 0,
      categories_named: categoriesPart.value?.named ?? 0,
    };
    await log(
      "pleo_master_done",
      tagsPart.error || accountsPart.error || categoriesPart.error ? "warn" : "info",
      `Pleo master data: ${summary.groups} tag group(s), ${summary.tags} tag(s), ${summary.accounts} account(s)`,
    );

    // The names come back in the response as well as landing in the tables, so the first run
    // answers "which tag is which property?" without a second query.
    return jsonResponse({
      ok: !tagsPart.error && !accountsPart.error && !categoriesPart.error,
      run_id: runId,
      ...summary,
      tags_error: tagsPart.error,
      accounts_error: accountsPart.error,
      categories_error: categoriesPart.error,
      category_lookup: {
        http_statuses: categoriesPart.value?.statuses ?? {},
        entry_fields: categoriesPart.value?.sampleKeys ?? [],
        note: categoriesPart.value?.sampleNote ?? null,
      },
      category_codes: (categoriesPart.value?.rows ?? []).map((r) => ({ id: r.id, code: r.code })),
      tag_groups: (tagsPart.value?.groups ?? []).map((g) => ({ id: g.id, name: g.name ?? null })),
      tag_names: (tagsPart.value?.rows ?? []).map((t) => ({
        id: t.id,
        group_id: t.group_id,
        name: t.name,
        code: t.code,
        archived: t.archived,
      })),
      account_names: (accountsPart.value ?? []).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await log("pleo_master_failed", "error", message);
    const status = e instanceof PleoError && e.status ? e.status : 500;
    // 401/403 means the key lacks the tags or chart-of-accounts scope, which is a different fix
    // from "the call broke", so it is worth keeping the distinction.
    return jsonResponse({ error: message }, status === 401 || status === 403 ? 403 : 500);
  }
});
