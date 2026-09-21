// What a notification points at.
//
// The notification used to name its targets in the RPC signature: an invoice column, then a
// transaction column bolted on beside it. Every further record type meant another parameter,
// another branch in the bell and another branch in the Slack text. Migration 20260911100000
// replaced that with a kind, an id and a path, so this file is the only place the app has to know
// about record types at all.

/** The kinds seeded in `notification_target_kinds`. Adding one is a migration plus a label here. */
export type NotificationTargetKind =
  "invoice" | "transaction" | "supplier" | "customer" | "property" | "page";

export interface NotificationTarget {
  kind: NotificationTargetKind | null;
  id: string | null;
  /** Relative path to open. Supplied at send time, because routes live here and not in SQL. */
  path: string | null;
}

/** The i18n key naming the screen a notification is about, e.g. "Transaktion". */
export function targetLabelKey(kind: NotificationTargetKind | null | undefined): string {
  return kind ? `notifications.ziel.${kind}` : "notifications.ziel.unbekannt";
}

/**
 * Read the target off an event payload.
 *
 * Handles both shapes on purpose. Rows written before 20260911100000 carry `document_id` or
 * `transaction_id` at the top level, and there is no backfill: the history is a log, and rewriting
 * what it said is worse than reading the two shapes here. New rows carry both, so this stays
 * correct whichever it meets.
 */
export function readNotificationTarget(
  payload: Record<string, unknown> | null,
): NotificationTarget {
  const p = payload ?? {};
  const raw = p.target as Record<string, unknown> | undefined;
  if (raw && (raw.kind || raw.path)) {
    return {
      kind: (raw.kind as NotificationTargetKind | undefined) ?? null,
      id: (raw.id as string | undefined) ?? null,
      path: (raw.path as string | undefined) ?? null,
    };
  }
  const transactionId = p.transaction_id as string | undefined;
  if (transactionId) {
    return { kind: "transaction", id: transactionId, path: `/bank-transactions/${transactionId}` };
  }
  const invoiceId = p.document_id as string | undefined;
  if (invoiceId) {
    return { kind: "invoice", id: invoiceId, path: `/incoming-invoices/${invoiceId}` };
  }
  return { kind: null, id: null, path: null };
}

/**
 * The path for a record, for callers that have the record rather than a notification.
 *
 * Kept beside the reader so the two cannot drift: a path written by `notifyTargetPath` has to be
 * one `readNotificationTarget` gives back unchanged.
 */
export function notifyTargetPath(kind: NotificationTargetKind, id: string): string {
  switch (kind) {
    case "invoice":
      return `/incoming-invoices/${id}`;
    case "transaction":
      return `/bank-transactions/${id}`;
    case "supplier":
      return `/suppliers/${id}`;
    case "customer":
      return `/customers/${id}`;
    // Addressed by `code` rather than by id, so the caller passes the code as the id here.
    case "property":
      return `/properties/${id}`;
    case "page":
      return id;
  }
}
