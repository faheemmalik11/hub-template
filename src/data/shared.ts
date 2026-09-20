import type { useQueryClient } from "@tanstack/react-query";

import { sb } from "@/data/client";

// The Supabase project's PostgREST API caps a single request's row count (Project Settings > API >
// "Max Rows", commonly 1000) — a query with no .range() doesn't error past that cap, it silently
// TRUNCATES, so an "unpaginated" hook whose real result set grows past it quietly starts returning
// a wrong, short list. (Discovered when Offene Posten's open-transaction count read exactly 1000
// while the same query's own exact `count` — via a properly range()'d request — reported 2039.)
//
// Fetches one page to learn the exact total (Postgres computes it as part of that same request via
// `{ count: "exact" }`), then fires every remaining page in parallel rather than looping
// sequentially — a live-tested ~2000-row table took 10-22s over 3 sequential round trips before
// this change; parallel pages cut that to roughly one round trip's worth of latency. `buildQuery`
// must return a FRESH query builder each call (not a shared/mutated one) since .range() (and
// `withCount`) is applied per page; `withCount` is only ever true for the first call, since one
// exact count is enough — every page reports the same total.
export async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number,
    withCount: boolean,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const first = await buildQuery(0, pageSize - 1, true);
  if (first.error) throw first.error;
  const firstRows = first.data ?? [];
  const total = first.count ?? firstRows.length;
  if (firstRows.length < pageSize || firstRows.length >= total) return firstRows;

  const pending: Promise<{ data: T[] | null; error: unknown }>[] = [];
  for (let from = pageSize; from < total; from += pageSize) {
    pending.push(Promise.resolve(buildQuery(from, from + pageSize - 1, false)));
  }
  const rest = await Promise.all(pending);
  const all = firstRows.slice();
  for (const page of rest) {
    if (page.error) throw page.error;
    all.push(...(page.data ?? []));
  }
  return all;
}

/**
 * A soft delete has to say why.
 *
 * `delete_reason` used to be free text with no requirement at any call site, and the Papierkorb
 * audit measured the result: 6 of 14 trashed records with no usable reason at all, several stored
 * as empty strings, and one where somebody had typed a phone number into the box. A record whose
 * label is thin (a rule, an invoice) and whose reason is blank is one nobody can decide about
 * later — which is the whole job of that screen
 * (docs/audit/papierkorb/trash/ISSUES.md #2).
 *
 * The guarantee itself lives in the database — a BEFORE UPDATE trigger on every trash-eligible
 * table, so it holds for plain SQL too (migration 20260819120000). This is the same rule one step
 * earlier, purely so the person sees a sentence they can act on instead of a raw Postgres error.
 * Same wording as the trigger's, deliberately: two different messages for one rule reads like two
 * different problems.
 */
export function pflichtGrund(grund: string | null | undefined): string {
  const text = (grund ?? "").trim();
  if (!text) {
    throw new Error(
      "Bitte einen Löschgrund angeben — ein Datensatz darf nicht ohne Begründung im Papierkorb landen.",
    );
  }
  return text;
}

export function invalidateMatchState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["beleg_matches"] });
  qc.invalidateQueries({ queryKey: ["transaction_matches"] });
  qc.invalidateQueries({ queryKey: ["bank_transactions"] });
  qc.invalidateQueries({ queryKey: ["bank_transactions_page"] });
  qc.invalidateQueries({ queryKey: ["bank_transaction"] });
  qc.invalidateQueries({ queryKey: ["confirmed_allocations"] });
  // Any confirmed link changes what is still open on both sides (migration 0024).
  qc.invalidateQueries({ queryKey: ["match_allocation"] });
  // A change in coverage can set or withdraw paid_at, so the invoice rows are stale too.
  qc.invalidateQueries({ queryKey: ["beleg"] });
  qc.invalidateQueries({ queryKey: ["belege-liste"] });
  qc.invalidateQueries({ queryKey: ["belege-kpis"] });
  qc.invalidateQueries({ queryKey: ["belege-kanban"] });
  qc.invalidateQueries({ queryKey: ["beleg_verlauf"] });
  // Hiding/releasing a transaction moves it in and out of these counts.
  qc.invalidateQueries({ queryKey: ["no_receipt_count"] });
  qc.invalidateQueries({ queryKey: ["opos_rule_hit_counts"] });
  // Outgoing-direction mirror (migration 0045). A transaction's confirmed allocation can come from
  // EITHER direction, so any match-state change invalidates both sides -- harmless over-refetch,
  // never a missed one.
  qc.invalidateQueries({ queryKey: ["outgoing_invoice_matches"] });
  qc.invalidateQueries({ queryKey: ["outgoing_transaction_matches"] });
  qc.invalidateQueries({ queryKey: ["confirmed_outgoing_allocations"] });
  qc.invalidateQueries({ queryKey: ["outgoing_match_allocation"] });
  qc.invalidateQueries({ queryKey: ["ausgangsrechnungen-liste"] });
  qc.invalidateQueries({ queryKey: ["ausgangsrechnung"] });
  // The reconciliation screen's Tab A reads v_open_items; a new or removed link changes an
  // invoice's paid/open split there immediately, so without this the row kept its old figures
  // until a full page refresh.
  qc.invalidateQueries({ queryKey: ["open_items"] });
}
