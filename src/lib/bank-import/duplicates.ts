import type { NormalizedRow } from "./types";

function normalizeText(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Same content key the bank-manual-import function hashes external_id from (see docs). */
function contentKey(row: NormalizedRow): string {
  return [
    row.booking_date,
    row.amount.toFixed(2),
    row.currency ?? "",
    normalizeText(row.payment_reference),
    normalizeText(row.counterparty_iban),
  ].join("|");
}

/**
 * Row indexes that share date+amount+reference+IBAN with another row in the same batch. Not
 * necessarily duplicates — could be two genuinely identical standing-order-style payments — but
 * worth flagging for the user to eyeball, since occurrence-index dedup only works correctly when
 * the full set of identical rows is uploaded together (see docs/BANK_MANUAL_IMPORT.md § Grenzen).
 */
export function findSuspectedDuplicates(rows: NormalizedRow[]): Set<number> {
  const counts = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const key = contentKey(row);
    const list = counts.get(key) ?? [];
    list.push(i);
    counts.set(key, list);
  });

  const suspects = new Set<number>();
  for (const indexes of counts.values()) {
    if (indexes.length > 1) indexes.forEach((i) => suspects.add(i));
  }
  return suspects;
}
