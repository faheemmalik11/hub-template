// bank-sync — import accounts + transactions via the BANKSapi wrapper, then run
// deterministic matching against open belege. Idempotent. Writes bank_sync_logs
// (counts + ids only — no sensitive content). Read-only toward the bank: it never
// initiates a payment. Trigger: pg_cron (scheduled) or manual invoke from the cockpit.
import { getBanksapi, isSandboxConnection } from "../_shared/adapters/banksapi/client.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { accountRow, connectionRow, transactionRow } from "../_shared/adapters/banksapi/mappers.ts";
import { runMatching, type MatchDocument, type MatchTransaction } from "../_shared/matching.ts";
import { classifyTransactionType, type TransactionType } from "../_shared/transaction-type.ts";
import { TABLE } from "../_shared/tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

function authorized(req: Request): boolean {
  const secret = Deno.env.get("SYNC_SECRET");
  if (!secret) return true; // dev / mock: no gate configured
  return req.headers.get("x-sync-secret") === secret || !!req.headers.get("Authorization");
}

// Supabase returns PostgrestError as a PLAIN OBJECT ({message, details, hint, code}), not
// an Error instance, so `e instanceof Error` misses it and the cause reads as "unknown".
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

const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

async function fetchAllRows<T>(
  // deno-lint-ignore no-explicit-any
  page: (from: number, to: number) => any,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    if (batch.length === 0) return rows;
    rows.push(...batch);
    from += batch.length;
  }
  throw new Error("bank-sync: pagination did not advance");
}

// Subtract days from a YYYY-MM-DD (or ISO) date, returning YYYY-MM-DD. Used for the
// incremental-fetch overlap window.
function minusDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate.length <= 10 ? `${isoDate}T00:00:00Z` : isoDate);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorized(req)) return jsonResponse({ error: "unauthorized" }, 401);

  const runId = crypto.randomUUID();
  let db: Db;
  try {
    db = serviceClient();
  } catch (e) {
    // Outside the main try below, so a missing env var would otherwise escape as a bare
    // 500 with no diagnostic body.
    const message = errorMessage(e);
    console.error("bank-sync: client init failed:", message);
    return jsonResponse({ error: message, run_id: runId }, 500);
  }
  const log = (
    event: string,
    counts: Record<string, number> = {},
    level = "info",
    message = "",
    connectionId: string | null = null,
  ) =>
    db.from(TABLE.bankSyncLogs).insert({
      run_id: runId,
      connection_id: connectionId,
      event,
      level,
      message,
      counts,
    });

  try {
    await log("sync_started");
    const api = getBanksapi();
    const accesses = await api.getBankAccesses();

    let accountsTotal = 0;
    let txnNew = 0;
    let txnTotal = 0;
    let accountsLinked = 0;

    const normIban = (v: string | null | undefined) =>
      (v ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    const { data: allRows, error: allRowsError } = await db
      .from(TABLE.bankAccounts)
      .select(
        "id, connection_id, iban, provider_account_ref, account_name, name_is_custom, " +
          "bank_name, is_sandbox, deleted_at, excluded_at, is_active, created_at",
      );
    if (allRowsError) throw allRowsError;

    interface AccountState {
      id: string;
      connection_id: string | null;
      iban: string | null;
      provider_account_ref: string | null;
      account_name: string | null;
      name_is_custom: boolean | null;
      bank_name: string | null;
      is_sandbox: boolean;
      deleted_at: string | null;
      excluded_at: string | null;
      is_active: boolean | null;
      created_at: string;
    }
    const accountRows = (allRows ?? []) as AccountState[];

    const excludedIbans = new Set<string>();
    const excludedProducts = new Set<string>();
    for (const r of accountRows) {
      if (!r.excluded_at) continue;
      const k = normIban(r.iban);
      if (k) excludedIbans.add(k);
      if (r.provider_account_ref) excludedProducts.add(r.provider_account_ref);
    }
    const isExcluded = (produktId: string, iban: string | null | undefined) => {
      const k = normIban(iban);
      return excludedProducts.has(produktId) || (!!k && excludedIbans.has(k));
    };

    // Accounts switched OFF in the Hub (is_active = false, migration 20260902160000). Weaker than
    // excluded_at on purpose: the row is still upserted and its balance still refreshes, because
    // the bank keeps delivering it and pretending otherwise would be a lie. What stops is the
    // fetching of NEW movements. Everything already imported stays exactly where it is, which is
    // the whole difference from "Konto entfernen".
    //
    // This function must never WRITE is_active. accountRow() does not, and must not start: an
    // hourly job that resets a person's choice is the trap name_is_custom exists to document.
    const inactiveAccountIds = new Set<string>(
      accountRows.filter((r) => r.is_active === false).map((r) => r.id),
    );

    // A human-chosen account name must survive the sync. The bank labels six of these accounts
    // "Sichteinlagen" and five "Sonstige Darlehen", so a rename in the Hub is the only thing that
    // tells them apart — and accountRow() used to overwrite it every hour.
    const nameIsCustomById = new Map<string, boolean>(
      accountRows.map((r) => [r.id, r.name_is_custom === true]),
    );

    const bankNameById = new Map<string, string | null>(
      accountRows.map((r) => [r.id, r.bank_name]),
    );
    const bankNamePatch = (id: string, a: { kreditinstitut: string }) =>
      (bankNameById.get(id) ?? "").trim() ? {} : { bank_name: a.kreditinstitut || null };

    const realRows = accountRows.filter(
      (r) => r.is_sandbox === false && r.deleted_at === null && r.excluded_at === null,
    );

    // There is no database constraint behind IBAN or product-id uniqueness on bank_accounts —
    // these maps are the only duplicate protection, built from a full read of the table above.
    // Rank candidates per IBAN: a live real row beats a live sandbox row, which beats a
    // soft-deleted one.
    type IbanRow = { id: string; productId: string | null; deleted: boolean; rank: number };
    const rowByIban = new Map<string, IbanRow>();
    for (const r of accountRows) {
      const k = normIban(r.iban);
      if (!k || r.excluded_at) continue;
      const deleted = r.deleted_at !== null;
      const rank = deleted ? 2 : r.is_sandbox === false ? 0 : 1;
      const current = rowByIban.get(k);
      if (!current || rank < current.rank) {
        rowByIban.set(k, { id: r.id, productId: r.provider_account_ref ?? null, deleted, rank });
      }
    }

    // Products without an IBAN (credit cards) get no protection from rowByIban. A BANKSapi
    // produktId identifies the same product across accesses (for a card it is the PAN), so key
    // the reuse on it. Oldest row wins, so repeated syncs keep collapsing onto the same one.
    const rowByProductId = new Map<string, { id: string; connectionId: string | null }>();
    for (const r of [...accountRows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (r.excluded_at || r.deleted_at || !r.provider_account_ref || normIban(r.iban)) continue;
      if (!rowByProductId.has(r.provider_account_ref)) {
        rowByProductId.set(r.provider_account_ref, { id: r.id, connectionId: r.connection_id });
      }
    }

    // The row a new product for this (connection_id, provider_account_ref) pair would match —
    // looked up in advance so the write below knows whether to update or insert.
    const rowByConnProduct = new Map<string, string>();
    for (const r of accountRows) {
      if (!r.connection_id || !r.provider_account_ref) continue;
      rowByConnProduct.set(`${r.connection_id}|${r.provider_account_ref}`, r.id);
    }

    // One IBAN can carry SEVERAL products (a Bausparvertrag is often reported under the
    // Girokonto's IBAN), so this is iban -> candidates, not iban -> single row.
    const realByIban = new Map<string, { id: string; productId: string | null }[]>();
    for (const r of realRows) {
      const k = normIban(r.iban);
      if (!k) continue;
      const list = realByIban.get(k) ?? [];
      list.push({ id: r.id, productId: r.provider_account_ref ?? null });
      realByIban.set(k, list);
    }

    // A row may be claimed by at most one product per run.
    const claimedRealIds = new Set<string>();
    const pickRealAccount = (iban: string | null | undefined, produktId: string) => {
      const list = realByIban.get(normIban(iban)) ?? [];
      // Prefer the row already tied to this product (idempotent re-sync); otherwise take a
      // seeded row that is not yet tied to any product. Never steal another product's row.
      return (
        list.find((r) => r.productId === produktId && !claimedRealIds.has(r.id)) ??
        list.find((r) => r.productId === null && !claimedRealIds.has(r.id))
      );
    };

    for (const access of accesses) {
      const { data: existing } = await db
        .from(TABLE.bankConnections)
        .select("id, is_sandbox")
        .eq("provider_access_ref", access.accessId)
        .maybeSingle();

      let connectionId: string;
      let connectionIsSandbox: boolean;
      if (existing?.id) {
        connectionId = existing.id;
        // is_sandbox is fixed at connect time (bank-connect) and never re-derived here —
        // that per-sync re-derivation from a separate BANKSAPI_ENV flag was the bug: it kept
        // overwriting mock-mode connections/accounts back to is_sandbox=false.
        connectionIsSandbox = existing.is_sandbox;
        await db.from(TABLE.bankConnections).update(connectionRow(access)).eq("id", connectionId);
      } else {
        // BANKSapi reported an access we have no bank-connect row for. Classify it the same
        // way bank-connect does.
        connectionIsSandbox = isSandboxConnection(api.mode);
        const { data: inserted, error } = await db
          .from(TABLE.bankConnections)
          .insert({ ...connectionRow(access), is_sandbox: connectionIsSandbox })
          .select("id")
          .single();
        if (error) throw error;
        connectionId = inserted.id;
      }

      // Upsert accounts.
      const accountIdByProduct = new Map<string, string>();
      let skippedExcluded = 0;
      let skippedInactive = 0;
      for (const a of access.bankprodukte) {
        // Excluded → touch nothing at all. Leaving it out of accountIdByProduct also keeps the
        // transaction loop below off it, which is the point: an excluded account must not have
        // its movements pulled into the database in the first place.
        if (isExcluded(a.produktId, a.iban)) {
          skippedExcluded++;
          continue;
        }
        const realMatch = a.iban ? pickRealAccount(a.iban, a.produktId) : undefined;
        const realId = realMatch?.id;
        if (realId) {
          claimedRealIds.add(realId);
          // Link the feed to the seeded account. Attach connection + product + balance, but
          // PRESERVE the seeded company_id / provider_id / account_name / is_active / is_sandbox.
          const { error } = await db
            .from(TABLE.bankAccounts)
            .update({
              connection_id: connectionId,
              provider_account_ref: a.produktId,
              bic: a.bic || null,
              balance: a.saldo ?? null,
              balance_date: a.saldoDatum || null,
              currency: a.waehrung || "EUR",
              is_own_account: a.eigenesKonto ?? true,
              ...bankNamePatch(realId, a),
              updated_at: new Date().toISOString(),
            })
            .eq("id", realId);
          if (error) throw error;
          accountIdByProduct.set(a.produktId, realId);
          accountsLinked++;
        } else if (a.iban && rowByIban.has(normIban(a.iban))) {
          // Only one row is kept per IBAN in this map. The row may belong to an older
          // connection, or to a second product on the same IBAN such as a Bausparvertrag or
          // credit card. Reuse the row either way, and leave provider_account_ref alone —
          // movements from both products land on this account and still dedupe on provider_hash.
          const shared = rowByIban.get(normIban(a.iban))!;
          accountIdByProduct.set(a.produktId, shared.id);
          const { error } = await db
            .from(TABLE.bankAccounts)
            .update({
              bic: a.bic || null,
              balance: a.saldo ?? null,
              balance_date: a.saldoDatum || null,
              currency: a.waehrung || "EUR",
              is_own_account: a.eigenesKonto ?? true,
              ...(shared.deleted ? { deleted_at: null, connection_id: connectionId } : {}),
              ...bankNamePatch(shared.id, a),
              updated_at: new Date().toISOString(),
            })
            .eq("id", shared.id);
          if (error) {
            throw new Error(
              `${errorMessage(error)} || reuse-branch: produkt=${a.produktId} ` +
                `rowId=${shared.id} deleted=${shared.deleted} rank=${shared.rank}`,
            );
          }
          if (shared.deleted) {
            await log(
              "account_revived",
              {},
              "info",
              `Konto ${a.iban} war gelöscht und wurde reaktiviert, weil die Bank es weiterhin liefert`,
              connectionId,
            );
          }
        } else if (
          !normIban(a.iban) &&
          rowByProductId.get(a.produktId) &&
          rowByProductId.get(a.produktId)!.connectionId !== connectionId
        ) {
          // Same IBAN-less product (a card), already imported under a DIFFERENT access. Reuse
          // that row instead of inserting a second one. connection_id and provider_account_ref
          // are deliberately left alone — moving the row to this connection would just re-open
          // the duplicate from the other side on the next run. Movements from both accesses land
          // on this one account and still dedupe on provider_hash.
          const shared = rowByProductId.get(a.produktId)!;
          accountIdByProduct.set(a.produktId, shared.id);
          const { error } = await db
            .from(TABLE.bankAccounts)
            .update({
              bic: a.bic || null,
              balance: a.saldo ?? null,
              balance_date: a.saldoDatum || null,
              currency: a.waehrung || "EUR",
              is_own_account: a.eigenesKonto ?? true,
              ...bankNamePatch(shared.id, a),
              updated_at: new Date().toISOString(),
            })
            .eq("id", shared.id);
          if (error) {
            throw new Error(
              `${errorMessage(error)} || product-reuse-branch: produkt=${a.produktId} ` +
                `rowId=${shared.id}`,
            );
          }
        } else {
          // No seeded match. No database constraint backs (connection_id, provider_account_ref)
          // uniqueness, so this writes by explicit lookup against rowByConnProduct instead of a
          // DB-level upsert: update the row if one already exists for this pair, insert if not.
          const row = accountRow(connectionId, a, connectionIsSandbox);
          const existingId = rowByConnProduct.get(`${connectionId}|${a.produktId}`);
          if (existingId && nameIsCustomById.get(existingId)) {
            delete (row as { account_name?: string | null }).account_name;
          }

          let accId: string;
          if (existingId) {
            const { error } = await db.from(TABLE.bankAccounts).update(row).eq("id", existingId);
            if (error) {
              throw new Error(
                `${errorMessage(error)} || update-branch: produkt=${a.produktId} rowId=${existingId}`,
              );
            }
            accId = existingId;
          } else {
            const { data: acc, error } = await db
              .from(TABLE.bankAccounts)
              .insert(row)
              .select("id")
              .single();
            if (error) {
              throw new Error(
                `${errorMessage(error)} || insert-branch: produkt=${a.produktId} ` +
                  `hasIban=${!!a.iban} inMap=${rowByIban.has(normIban(a.iban))} ` +
                  `mapSize=${rowByIban.size} rowsFetched=${(allRows ?? []).length}`,
              );
            }
            accId = acc.id;
          }
          accountIdByProduct.set(a.produktId, accId);

          const k = normIban(a.iban);
          if (k && !rowByIban.has(k)) {
            rowByIban.set(k, {
              id: accId,
              productId: a.produktId,
              deleted: false,
              rank: connectionIsSandbox ? 1 : 0,
            });
          }
          if (!k && !rowByProductId.has(a.produktId)) {
            rowByProductId.set(a.produktId, { id: accId, connectionId });
          }
          if (!existingId) {
            rowByConnProduct.set(`${connectionId}|${a.produktId}`, accId);
          }
        }
        accountsTotal++;
      }
      if (skippedExcluded > 0) {
        await log(
          "accounts_excluded_skipped",
          { accounts: skippedExcluded },
          "info",
          `${skippedExcluded} Konto/Konten übersprungen — im Hub entfernt (nicht importieren)`,
          connectionId,
        );
      }
      await log(
        "accounts_fetched",
        { accounts: access.bankprodukte.length },
        "info",
        "",
        connectionId,
      );

      for (const a of access.bankprodukte) {
        const accountId = accountIdByProduct.get(a.produktId);
        if (!accountId) continue;
        if (inactiveAccountIds.has(accountId)) {
          skippedInactive++;
          continue;
        }
        if (!a.hasTransactions) continue;
        const { data: lastTxn } = await db
          .from(TABLE.bankTransactions)
          .select("booking_date")
          .eq("account_id", accountId)
          .not("booking_date", "is", null)
          .order("booking_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const from = lastTxn?.booking_date ? minusDaysIso(lastTxn.booking_date, 7) : null;
        const txns = await api.getTransactions(access.accessId, a.produktId, { from });
        txnTotal += txns.length;

        // Collapse within-batch duplicates: BANKSapi returns some movements twice
        // (identical `hash`, differing only by identifier.bookingRef).
        const batchSeen = new Set<string>();
        const rows: ReturnType<typeof transactionRow>[] = [];
        for (const t of txns) {
          if (batchSeen.has(t.hash)) continue;
          batchSeen.add(t.hash);
          rows.push(transactionRow(accountId, connectionId, t, connectionIsSandbox, a.produktTyp));
        }
        if (rows.length > 0) {
          const { data: inserted, error } = await db
            .from(TABLE.bankTransactions)
            .upsert(rows, { onConflict: "provider_hash", ignoreDuplicates: true })
            .select("id");
          if (error) throw error;
          txnNew += (inserted ?? []).length;
        }
      }
      if (skippedInactive > 0) {
        // Said out loud, because a silently missing account is exactly what this switch could be
        // mistaken for. "Deaktiviert" and "entfernt" are different states and the log names both.
        await log(
          "accounts_inactive_skipped",
          { accounts: skippedInactive },
          "info",
          `${skippedInactive} Konto/Konten übersprungen — im Hub deaktiviert (keine neuen Umsätze)`,
          connectionId,
        );
      }
      await log(
        "transactions_fetched",
        { transactions_new: txnNew, transactions_total: txnTotal },
        "info",
        api.dateFilterRejected()
          ? "BANKSapi hat den Datumsfilter abgelehnt — es wurde der komplette Standardzeitraum geladen"
          : "",
        connectionId,
      );

      await db
        .from(TABLE.bankConnections)
        .update({ last_sync_at: new Date().toISOString(), last_sync_status: "ok" })
        .eq("id", connectionId);
    }

    // ---- Classify movements that still have no transaction_type ----
    // Rows imported before migration 0023 added the column have transaction_type NULL. Doing
    // this here instead of in the migration keeps ONE classifier (TypeScript) as the single
    // source of truth, rather than a second copy in SQL that would silently drift from it.
    // A human correction is never overwritten, and the query enforces that rather than trusting
    // it: 'manuell' rows are excluded outright, so even a human who deliberately UNSET a type
    // (leaving it null) keeps that decision. To re-run after the rules change:
    //   update bank_transactions set transaction_type = null where transaction_type_source = 'auto';
    let txnClassified = 0;
    const { data: unclassified, error: unclassifiedError } = await db
      .from(TABLE.bankTransactions)
      .select("id, account_id, booking_text, payment_reference, amount")
      .is("transaction_type", null)
      .neq("transaction_type_source", "manuell")
      .limit(5000);
    if (unclassifiedError) throw unclassifiedError;

    if ((unclassified ?? []).length > 0) {
      const { data: productRows, error: productError } = await db
        .from(TABLE.bankAccounts)
        .select("id, product_type");
      if (productError) throw productError;
      const productTypeById = new Map<string, string | null>(
        ((productRows ?? []) as { id: string; product_type: string | null }[]).map((r) => [
          r.id,
          r.product_type,
        ]),
      );

      // Group by resulting type so this costs one UPDATE per type instead of one per row.
      // Several hundred round trips would otherwise put the whole sync near its time limit.
      const idsByType = new Map<TransactionType, string[]>();
      for (const row of (unclassified ?? []) as {
        id: string;
        account_id: string;
        booking_text: string | null;
        payment_reference: string | null;
        amount: number | null;
      }[]) {
        const type = classifyTransactionType({
          bookingText: row.booking_text,
          paymentReference: row.payment_reference,
          amount: row.amount,
          productType: productTypeById.get(row.account_id) ?? null,
        });
        const list = idsByType.get(type) ?? [];
        list.push(row.id);
        idsByType.set(type, list);
      }

      for (const [type, ids] of idsByType) {
        // Chunked: a very long id list would blow past the URL length limit PostgREST allows.
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          // transaction_type_source is deliberately NOT written: the rows selected above are
          // already 'auto', and writing it would be the one way this loop could clobber a
          // human's provenance.
          const { error } = await db
            .from(TABLE.bankTransactions)
            .update({ transaction_type: type })
            .in("id", chunk);
          if (error) throw error;
          txnClassified += chunk.length;
        }
      }
      await log("transactions_classified", { transactions_classified: txnClassified });
    }

    // ---- Matching: open invoices × unmatched debit transactions ----
    const { data: matchSettingsRow } = await db
      .from(TABLE.matchingSettings)
      .select("amount_tolerance, candidate_threshold, auto_match_threshold")
      .maybeSingle();

    const amountTolerance = Number(matchSettingsRow?.amount_tolerance ?? 0.01);
    const candidateThreshold = Number(matchSettingsRow?.candidate_threshold ?? 0.6);
    const autoThreshold = Number(matchSettingsRow?.auto_match_threshold ?? 0.9);

    const belegeRows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      db
        .from(TABLE.vOpenItems)
        .select(
          `id, amount_gross, document_date, due_date, invoice_number, customer_number, issuer, ${TABLE.suppliers}(iban)`,
        )
        .eq("is_open", true)
        .order("id")
        .range(from, to),
    );

    const txnRows = await fetchAllRows<MatchTransaction>((from, to) =>
      db
        .from(TABLE.bankTransactions)
        .select(
          "id, amount, booking_date, payment_reference, counterparty_iban, counterparty_holder",
        )
        .eq("matching_status", "offen")
        .lt("amount", 0)
        .order("id")
        .range(from, to),
    );

    const belege: MatchDocument[] = (belegeRows ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      amount_gross: (b.amount_gross as number | null) ?? null,
      document_date: (b.document_date as string | null) ?? null,
      due_date: (b.due_date as string | null) ?? null,
      invoice_number: (b.invoice_number as string | null) ?? null,
      customer_number: (b.customer_number as string | null) ?? null,
      issuer: (b.issuer as string | null) ?? null,
      supplier_iban:
        ((b.suppliers as { iban?: string | null } | null)?.iban as string | null) ?? null,
    }));
    const transactions: MatchTransaction[] = txnRows;

    const candidates = runMatching(
      belege,
      transactions,
      "incoming",
      amountTolerance,
      candidateThreshold,
      autoThreshold,
    );
    let matchesAuto = 0;
    let matchesCandidate = 0;
    for (const c of candidates) {
      // ignoreDuplicates: never overwrite an existing (possibly human) decision.
      const { error } = await db.from(TABLE.documentTransactionMatches).upsert(
        {
          document_id: c.document_id,
          transaction_id: c.transaction_id,
          status: c.status,
          score: c.score,
          match_reasons: c.match_reasons,
          // Suggested share for this pair (migration 0024). Capped at the invoice amount so a
          // collective payment proposes a partial sum rather than its full value against each
          // receipt. Confirmation re-derives it against what is still open.
          amount_matched: c.amount_matched,
          matched_by: "system",
        },
        { onConflict: "document_id,transaction_id", ignoreDuplicates: true },
      );
      if (error) throw error;
      if (c.status === "auto") matchesAuto++;
      else matchesCandidate++;
    }
    await log("match_run", { matches_auto: matchesAuto, matches_candidate: matchesCandidate });

    // ---- Matching: open outgoing invoices (revenue) × unmatched credit transactions ----
    // Mirrors the pass above, in the opposite direction. customers carries no IBAN (unlike
    // suppliers), so the outgoing invoices below always map supplier_iban: null -- the iban
    // signal in scoreMatch() simply never fires for this direction. See migration 0045.
    const outgoingRows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      db
        .from(TABLE.outgoingInvoices)
        .select(
          `id, amount_gross, invoice_date, due_date, invoice_number, ${TABLE.customers}(name, customer_number)`,
        )
        .eq("status", "open")
        .order("id")
        .range(from, to),
    );

    const creditRows = await fetchAllRows<MatchTransaction>((from, to) =>
      db
        .from(TABLE.bankTransactions)
        .select(
          "id, amount, booking_date, payment_reference, counterparty_iban, counterparty_holder",
        )
        .eq("matching_status", "offen")
        .gt("amount", 0)
        .order("id")
        .range(from, to),
    );

    const outgoingBelege: MatchDocument[] = (outgoingRows ?? []).map((o: Record<string, unknown>) => ({
      id: o.id as string,
      amount_gross: (o.amount_gross as number | null) ?? null,
      document_date: (o.invoice_date as string | null) ?? null,
      due_date: (o.due_date as string | null) ?? null,
      invoice_number: (o.invoice_number as string | null) ?? null,
      customer_number:
        ((o.customers as { customer_number?: string | null } | null)?.customer_number as
          string | null) ?? null,
      issuer: ((o.customers as { name?: string | null } | null)?.name as string | null) ?? null,
      supplier_iban: null,
    }));
    const creditTransactions: MatchTransaction[] = creditRows;

    const outgoingCandidates = runMatching(
      outgoingBelege,
      creditTransactions,
      "outgoing",
      amountTolerance,
      candidateThreshold,
      autoThreshold,
    );
    let outgoingMatchesAuto = 0;
    let outgoingMatchesCandidate = 0;
    for (const c of outgoingCandidates) {
      const { error } = await db.from(TABLE.outgoingInvoiceTransactionMatches).upsert(
        {
          outgoing_invoice_id: c.document_id,
          transaction_id: c.transaction_id,
          status: c.status,
          score: c.score,
          match_reasons: c.match_reasons,
          amount_matched: c.amount_matched,
          matched_by: "system",
        },
        { onConflict: "outgoing_invoice_id,transaction_id", ignoreDuplicates: true },
      );
      if (error) throw error;
      if (c.status === "auto") outgoingMatchesAuto++;
      else outgoingMatchesCandidate++;
    }
    await log("outgoing_match_run", {
      matches_auto: outgoingMatchesAuto,
      matches_candidate: outgoingMatchesCandidate,
    });

    const summary = {
      run_id: runId,
      mode: api.mode,
      accounts: accountsTotal,
      accounts_linked: accountsLinked,
      transactions_new: txnNew,
      transactions_total: txnTotal,
      transactions_classified: txnClassified,
      matches_auto: matchesAuto,
      matches_candidate: matchesCandidate,
      outgoing_matches_auto: outgoingMatchesAuto,
      outgoing_matches_candidate: outgoingMatchesCandidate,
    };
    await log("sync_finished", {
      accounts: accountsTotal,
      accounts_linked: accountsLinked,
      transactions_new: txnNew,
      transactions_total: txnTotal,
      transactions_classified: txnClassified,
      matches_auto: matchesAuto,
      matches_candidate: matchesCandidate,
      outgoing_matches_auto: outgoingMatchesAuto,
      outgoing_matches_candidate: outgoingMatchesCandidate,
    });
    return jsonResponse(summary);
  } catch (e) {
    const message = errorMessage(e);
    console.error("bank-sync failed:", message);
    // NOTE: the Supabase query builder is thenable but has NO .catch method. Calling
    // .catch() here threw inside the error handler, so every real failure surfaced as an
    // opaque EDGE_FUNCTION_ERROR instead of this JSON body. Use a plain try/catch.
    try {
      await log("error", {}, "error", message);
    } catch (logError) {
      console.error("bank-sync: could not write error log:", logError);
    }
    return jsonResponse({ error: message, run_id: runId }, 500);
  }
});
