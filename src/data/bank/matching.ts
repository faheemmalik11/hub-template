import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TABLE } from "@/config/tables";
import { STALE, actorEmail, insertChangeHistory, sb } from "@/data/client";
import {
  fetchAllRows,
  insertHistory,
  invalidateMatchState,
  invalidateRuleState,
} from "@/data/shared";
import type { DocumentTransactionMatch, OutgoingInvoiceTransactionMatch } from "@/lib/data/types";

// Matches for one beleg, with the embedded bank transaction (for the detail card).
export function useDocumentMatches(documentId: string) {
  return useQuery({
    queryKey: ["beleg_matches", documentId],
    enabled: !!documentId,
    staleTime: STALE,
    queryFn: async (): Promise<DocumentTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.documentTransactionMatches)
        .select(`*, ${TABLE.bankTransactions}(*)`)
        .eq("document_id", documentId)
        .neq("status", "rejected")
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentTransactionMatch[];
    },
  });
}

// Matches for one transaction, with the embedded beleg (candidate list on txn detail).
export function useTransactionMatches(transactionId: string) {
  return useQuery({
    queryKey: ["transaction_matches", transactionId],
    enabled: !!transactionId,
    staleTime: STALE,
    queryFn: async (): Promise<DocumentTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.documentTransactionMatches)
        .select(`*, ${TABLE.documents}(*)`)
        .eq("transaction_id", transactionId)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentTransactionMatch[];
    },
  });
}

// How much of an invoice and of a transaction is already spoken for by CONFIRMED links, so the
// linking screen can pre-fill a split amount and show what is still open on either side.
//
// Goes through the two SQL helpers from migration 0024 rather than summing in the browser, so the
// number the user sees is produced by the same expression the RPC and the paid trigger use.
// Deliberately NOT cached (staleTime 0): it is read to decide a money amount, and a stale
// remainder would pre-fill an over-allocation that the server then rejects.
export function useMatchAllocation(invoiceId: string | null, transactionId: string | null) {
  return useQuery({
    queryKey: ["match_allocation", invoiceId ?? "", transactionId ?? ""],
    enabled: !!invoiceId && !!transactionId,
    staleTime: 0,
    queryFn: async (): Promise<{ invoiceMatched: number; transactionAllocated: number }> => {
      const [inv, txn] = await Promise.all([
        sb.rpc("invoice_matched_sum", { p_invoice: invoiceId }),
        sb.rpc("transaction_allocated_sum", { p_transaction: transactionId }),
      ]);
      if (inv.error) throw inv.error;
      if (txn.error) throw txn.error;
      return {
        invoiceMatched: Number(inv.data ?? 0),
        transactionAllocated: Number(txn.data ?? 0),
      };
    },
  });
}

// Ids of belege that have a confirmed match — used to derive "open items".
// Confirmed allocation totals for BOTH sides, keyed by id.
//
// Replaces the old useConfirmedBelegIds, which returned the mere SET of invoices having any
// confirmed match. That set was used to drop invoices out of Open items, so linking 400 of a 1.000
// invoice made it vanish and the second installment could never be added. Under m:n the question is
// never "is there a match" but "how much is still open", so this returns the sums.
export function useConfirmedAllocations() {
  return useQuery({
    queryKey: ["confirmed_allocations"],
    staleTime: STALE,
    queryFn: async (): Promise<{
      byInvoice: Map<string, number>;
      byTransaction: Map<string, number>;
    }> => {
      // Paged, not a flat select. This is the highest-cardinality table in the app (one row per
      // invoice-to-transaction allocation, m:n) so it crosses the platform's per-request row cap
      // long before invoices or suppliers do — and a truncated response here does not look like an
      // error, it looks like invoices that are suddenly unmatched: they drop out of the Cost
      // Analysis P&L entirely and reappear as open items.
      const rows = await fetchAllRows<{
        document_id: string;
        transaction_id: string;
        amount_matched: number | null;
      }>((from, to, withCount) =>
        sb
          .from(TABLE.documentTransactionMatches)
          .select(
            "document_id, transaction_id, amount_matched",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("status", "confirmed")
          .range(from, to),
      );
      const byInvoice = new Map<string, number>();
      const byTransaction = new Map<string, number>();
      for (const r of rows) {
        const amount = Math.abs(r.amount_matched ?? 0);
        byInvoice.set(r.document_id, (byInvoice.get(r.document_id) ?? 0) + amount);
        byTransaction.set(r.transaction_id, (byTransaction.get(r.transaction_id) ?? 0) + amount);
      }
      return { byInvoice, byTransaction };
    },
  });
}

// Which of our own bank accounts a confirmed match actually paid through — used only by the Cost
// Analysis account/IBAN filter (Briefing Screen 10). Separate from useConfirmedAllocations() (a
// different return shape for a different purpose) rather than folded into it, so its existing
// consumer (offene-posten/index.tsx) is untouched. A single invoice can be paid across several
// accounts (m:n matching, migration 0024), hence account ids as an array, not a single value.
export function useConfirmedMatchAccounts() {
  return useQuery({
    queryKey: ["confirmed_match_accounts"],
    staleTime: STALE,
    queryFn: async (): Promise<Map<string, string[]>> => {
      // Paged for the same reason as useConfirmedAllocations above — same table, same cap.
      const rows = await fetchAllRows<{
        document_id: string;
        bank_transactions: { account_id: string } | null;
      }>((from, to, withCount) =>
        sb
          .from(TABLE.documentTransactionMatches)
          .select(
            `document_id, ${TABLE.bankTransactions}(account_id)`,
            withCount ? { count: "exact" } : undefined,
          )
          .eq("status", "confirmed")
          .range(from, to),
      );
      const byInvoice = new Map<string, string[]>();
      for (const r of rows) {
        const accountId = r.bank_transactions?.account_id;
        if (!accountId) continue;
        const cur = byInvoice.get(r.document_id) ?? [];
        if (!cur.includes(accountId)) cur.push(accountId);
        byInvoice.set(r.document_id, cur);
      }
      return byInvoice;
    },
  });
}

// ---- Outgoing-invoice matching (migration 0045) -- mirrors the incoming-side hooks above for the
// opposite direction (outgoing invoice / revenue <-> incoming credit transaction). ----

export function useOutgoingInvoiceMatches(outgoingInvoiceId: string) {
  return useQuery({
    queryKey: ["outgoing_invoice_matches", outgoingInvoiceId],
    enabled: !!outgoingInvoiceId,
    staleTime: STALE,
    queryFn: async (): Promise<OutgoingInvoiceTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .select(`*, ${TABLE.bankTransactions}(*)`)
        .eq("outgoing_invoice_id", outgoingInvoiceId)
        .neq("status", "rejected")
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OutgoingInvoiceTransactionMatch[];
    },
  });
}

// Matches for one transaction, with the embedded outgoing invoice (candidate list on a credit
// transaction's detail).
export function useOutgoingTransactionMatches(transactionId: string) {
  return useQuery({
    queryKey: ["outgoing_transaction_matches", transactionId],
    enabled: !!transactionId,
    staleTime: STALE,
    queryFn: async (): Promise<OutgoingInvoiceTransactionMatch[]> => {
      const { data, error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .select(`*, ${TABLE.outgoingInvoices}(*, ${TABLE.customers}(*))`)
        .eq("transaction_id", transactionId)
        .order("score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OutgoingInvoiceTransactionMatch[];
    },
  });
}

export function useOutgoingMatchAllocation(
  outgoingInvoiceId: string | null,
  transactionId: string | null,
) {
  return useQuery({
    queryKey: ["outgoing_match_allocation", outgoingInvoiceId ?? "", transactionId ?? ""],
    enabled: !!outgoingInvoiceId && !!transactionId,
    staleTime: 0,
    queryFn: async (): Promise<{ invoiceMatched: number; transactionAllocated: number }> => {
      const [inv, txn] = await Promise.all([
        sb.rpc("outgoing_invoice_matched_sum", { p_outgoing_invoice: outgoingInvoiceId }),
        sb.rpc("outgoing_transaction_allocated_sum", { p_transaction: transactionId }),
      ]);
      if (inv.error) throw inv.error;
      if (txn.error) throw txn.error;
      return {
        invoiceMatched: Number(inv.data ?? 0),
        transactionAllocated: Number(txn.data ?? 0),
      };
    },
  });
}

// Confirmed allocation totals for both sides, keyed by id -- the outgoing-direction mirror of
// useConfirmedAllocations(). Used by Open Items (unmatched outgoing invoices) and Kostenanalyse
// (matched outgoing invoices feeding the Revenue line).
export function useConfirmedOutgoingAllocations() {
  return useQuery({
    queryKey: ["confirmed_outgoing_allocations"],
    staleTime: STALE,
    queryFn: async (): Promise<{
      byInvoice: Map<string, number>;
      byTransaction: Map<string, number>;
      confirmedAtByInvoice: Map<string, string>;
    }> => {
      // Paged for the same reason as useConfirmedAllocations — a truncated response here silently
      // removes revenue from the Cost Analysis instead of failing.
      const rows = await fetchAllRows<{
        outgoing_invoice_id: string;
        transaction_id: string;
        amount_matched: number | null;
        confirmed_at: string | null;
      }>((from, to, withCount) =>
        sb
          .from(TABLE.outgoingInvoiceTransactionMatches)
          .select(
            "outgoing_invoice_id, transaction_id, amount_matched, confirmed_at",
            withCount ? { count: "exact" } : undefined,
          )
          .eq("status", "confirmed")
          .range(from, to),
      );
      const byInvoice = new Map<string, number>();
      const byTransaction = new Map<string, number>();
      const confirmedAtByInvoice = new Map<string, string>();
      for (const r of rows) {
        const amount = Math.abs(r.amount_matched ?? 0);
        byInvoice.set(r.outgoing_invoice_id, (byInvoice.get(r.outgoing_invoice_id) ?? 0) + amount);
        byTransaction.set(r.transaction_id, (byTransaction.get(r.transaction_id) ?? 0) + amount);
        // Latest confirmation date -- used as the "payment date" proxy for payment_date-basis
        // companies on the Kostenanalyse revenue line (no separate paid-at field exists here).
        const existing = confirmedAtByInvoice.get(r.outgoing_invoice_id);
        if (r.confirmed_at && (!existing || r.confirmed_at > existing)) {
          confirmedAtByInvoice.set(r.outgoing_invoice_id, r.confirmed_at);
        }
      }
      return { byInvoice, byTransaction, confirmedAtByInvoice };
    },
  });
}

// Verlaufseintrag on the generic change_history log (table_name/record_id), used for entities that
// have no dedicated *_history table -- outgoing_invoices is one (migration 0039's own header:
// deliberately no history table, since there is no "delete an invoice" action to build locally).

// Confirm a match: mark it bestaetigt, mark the transaction zugeordnet, log to the beleg, and let
// the rule engine learn from it (migration 0030). Learning is best-effort: a confirmation must
// never fail because the learning step had a problem, so its error is swallowed after a console
// warning rather than surfaced to the user or thrown from the mutation.
/**
 * Close the side that keeps a remainder after a link, from wherever the link was made.
 *
 * Both entry points ask the same question in the same dialog, so they have to answer it the same
 * way. It used to live inline in useManualLink only, which meant confirming a suggestion from the
 * transaction detail screen showed the checkbox, took the reason, and then dropped both.
 */
async function closeSidesAfterLink(args: {
  documentId: string;
  transactionId: string;
  closeInvoice?: boolean;
  closeTransaction?: boolean;
  differenceReason?: string;
}) {
  // THE INVOICE SIDE. link_invoice_transaction only closes an invoice that counts as covered, and
  // that is within payment_tolerance (min(3% of gross, 150 EUR)). Writing paid_at is what actually
  // closes a larger shortfall.
  if (args.closeInvoice) {
    const { error: paidError } = await sb
      .from(TABLE.documents)
      .update({
        paid_at: new Date().toISOString(),
        paid_source: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.documentId)
      .is("paid_at", null);
    if (paidError) {
      console.error("closeInvoice failed", paidError);
    } else {
      // Persisted audit text stays German; the event is what the history renders from.
      await insertHistory(
        args.documentId,
        "change",
        `Als vollständig bezahlt markiert, Restbetrag abgeschrieben${
          args.differenceReason ? `. Grund: ${args.differenceReason}` : ""
        }`,
        {
          event: "remainder_written_off",
          ...(args.differenceReason
            ? { grund: args.differenceReason, kommentar: args.differenceReason }
            : {}),
        },
      );
    }
  }

  // After the link, never before: the RPC refuses a transaction with nothing left to allocate, and
  // stamping one that then failed to link would leave a payment marked spent on nothing.
  if (args.closeTransaction) {
    const { error: closeError } = await sb.rpc("set_transaction_fully_used", {
      p_transaction_id: args.transactionId,
      p_note: args.differenceReason ?? null,
    });
    // Not rethrown: the match itself succeeded and is the thing the user asked for. Reporting a
    // failure here would say the link did not happen when it did -- the remainder simply stays
    // open, which is the visible, correctable state.
    if (closeError) console.error("set_transaction_fully_used failed", closeError);
  }
}

export function useConfirmMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      matchId: string;
      documentId: string;
      differenceReason?: string;
      /** Needed only to close the payment side; the match row already knows its transaction. */
      transactionId?: string;
      closeInvoice?: boolean;
      closeTransaction?: boolean;
    }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "confirmed",
          difference_reason: args.differenceReason ?? null,
          confirmed_by: actor,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertHistory(
        args.documentId,
        // Its own type, like 'zuordnung_getrennt', so the Workflow-Verlauf shows it. Plain
        // 'booking' is not an approval type, so a confirmed match only ever appeared there when
        // it happened to cover the invoice in full and the DB trigger added a 'bezahlt' row on top.
        // A partial confirm left the workflow tab silent about a reconciliation that did happen.
        "zuordnung_bestaetigt",
        // Persisted audit text stays German. `event` is what the screen renders from, so the row
        // can be read in either language; the sentence remains the record.
        "Banktransaktion zugeordnet (bestätigt)",
        { event: "match_confirmed" },
      );
      if ((args.closeInvoice || args.closeTransaction) && args.transactionId) {
        await closeSidesAfterLink({
          documentId: args.documentId,
          transactionId: args.transactionId,
          closeInvoice: args.closeInvoice,
          closeTransaction: args.closeTransaction,
          differenceReason: args.differenceReason,
        });
      }
      const { error: learnError } = await sb.rpc("learn_assignment_rule_from_match", {
        p_match: args.matchId,
        p_actor: actor,
      });
      if (learnError) {
        console.warn("learn_assignment_rule_from_match failed (non-fatal):", learnError);
      }
    },
    onSuccess: () => {
      invalidateMatchState(qc);
      invalidateRuleState(qc);
    },
  });
}

// Reject a match: mark it abgelehnt, log to the beleg.
export function useRejectMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { matchId: string; documentId: string; reason?: string }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "rejected",
          rejected_by: actor,
          rejected_at: now,
          reject_reason: args.reason ?? null,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertHistory(args.documentId, "booking", "Transaktions-Zuordnung abgelehnt", {
        event: "match_rejected",
      });
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

export function useLinkInvoiceTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      documentId: string;
      transactionId: string;
      score?: number | null;
      reasons?: Record<string, unknown> | null;
      amount?: number | null;
      differenceReason?: string;
      /**
       * Close the side that keeps a remainder after this allocation.
       *
       * `closeInvoice` needs nothing extra: link_invoice_transaction already withdraws the
       * invoice's other candidates once it counts as covered, and `difference_reason` records why
       * the gap was accepted. `closeTransaction` does need a second call -- the transaction's
       * status is derived from allocated amounts by a trigger, so a remainder is recomputed back
       * to 'open' unless the row itself is stamped (migration 20260910190000).
       */
      closeInvoice?: boolean;
      closeTransaction?: boolean;
    }): Promise<string> => {
      const { data, error } = await sb.rpc("link_invoice_transaction", {
        p_invoice_id: args.documentId,
        p_transaction_id: args.transactionId,
        p_score: args.score ?? null,
        p_reasons: args.reasons ?? null,
        p_amount: args.amount ?? null,
        p_difference_reason: args.differenceReason ?? null,
      });
      if (error) throw error;

      await closeSidesAfterLink({
        documentId: args.documentId,
        transactionId: args.transactionId,
        closeInvoice: args.closeInvoice,
        closeTransaction: args.closeTransaction,
        differenceReason: args.differenceReason,
      });
      return data as string;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/**
 * Close the remainder on one side of a match that is already made.
 *
 * The manual-match dialog can close either side AT THE MOMENT OF LINKING, but a link made any other
 * way leaves no route to it: an invoice uploaded from a transaction is linked by a trigger once
 * extraction reads the amount (migration 20260911190000), and if the two differ the remainder just
 * sits there with no dialog left to reopen.
 *
 * Both sides drop out of the open lists once closed, which is the point. An invoice is open while
 * `paid_at is null`; a transaction is open while `matching_status = 'open'`.
 */
export function useCloseInvoiceRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { documentId: string; reason: string }) => {
      // paid_source 'manual' marks it a human decision, so the bank-match trigger never withdraws
      // it when coverage changes. The `is null` guard keeps an existing paid date intact.
      const { error } = await sb
        .from(TABLE.documents)
        .update({
          paid_at: new Date().toISOString(),
          paid_source: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.documentId)
        .is("paid_at", null);
      if (error) throw error;
      // Persisted audit text stays German.
      // The German sentence stays as the persisted record, the event is what the history renders
      // from, so the row reads in whichever language the reader picked.
      await insertHistory(
        args.documentId,
        "change",
        `Als vollständig bezahlt markiert, Restbetrag abgeschrieben. Grund: ${args.reason}`,
        { event: "remainder_written_off", grund: args.reason, kommentar: args.reason },
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/**
 * Take a write-off back.
 *
 * The payment side has had `clear_transaction_fully_used` since it was built; the invoice side had
 * nothing, so a remainder written off by mistake could only be undone by unlinking the match. The
 * workflow walks back with it: an invoice that is no longer paid cannot stand at 'bezahlt'.
 */
export function useReopenInvoiceRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { documentId: string }) => {
      const { data: doc } = await sb
        .from(TABLE.documents)
        .select("workflow_status")
        .eq("id", args.documentId)
        .maybeSingle();
      const patch: Record<string, unknown> = {
        paid_at: null,
        paid_source: null,
        updated_at: new Date().toISOString(),
      };
      if (doc?.workflow_status === "paid") patch.workflow_status = "in_review";
      const { error } = await sb.from(TABLE.documents).update(patch).eq("id", args.documentId);
      if (error) throw error;
      // Persisted audit text stays German; the event is what the history renders from.
      await insertHistory(
        args.documentId,
        "change",
        "Restabschreibung zurückgenommen, Rechnung wieder offen.",
        { event: "remainder_reopened" },
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/** The payment side. Needs the stamp, because its status is recomputed from allocated amounts. */
export function useCloseTransactionRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { transactionId: string; reason: string }) => {
      const { error } = await sb.rpc("set_transaction_fully_used", {
        p_transaction_id: args.transactionId,
        p_note: args.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/** Undo it. The status goes back to whatever the amounts say, so the remainder reopens. */
export function useReopenTransactionRemainder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await sb.rpc("clear_transaction_fully_used", {
        p_transaction_id: transactionId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Confirm an outgoing match: mark it bestaetigt, mark the transaction zugeordnet via the same DB
// trigger as the incoming side (migration 0045). No rule-learning step -- outgoing invoices have
// no category to learn a rule for.
export function useConfirmOutgoingMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      matchId: string;
      outgoingInvoiceId: string;
      differenceReason?: string;
      /** The payment side only. An outgoing invoice has no paid_at of its own to write off. */
      transactionId?: string;
      closeTransaction?: boolean;
    }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .update({
          status: "confirmed",
          difference_reason: args.differenceReason ?? null,
          confirmed_by: actor,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertChangeHistory(
        "outgoing_invoices",
        args.outgoingInvoiceId,
        "booking",
        "Banktransaktion zugeordnet (bestätigt)",
      );
      if (args.closeTransaction && args.transactionId) {
        await closeSidesAfterLink({
          documentId: args.outgoingInvoiceId,
          transactionId: args.transactionId,
          closeTransaction: true,
          differenceReason: args.differenceReason,
        });
      }
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Reject an outgoing match: mark it abgelehnt, log to the outgoing invoice.
// Undo a CONFIRMED match: the pair goes back to being a SUGGESTION, not a rejection.
//
// "Trennen" used to reuse the reject mutation, which parked the row in 'rejected'. The panel then
// showed it as rejected with no way to link it again, although the dialog promises both sides go
// back to being open -- reported from the live app. 'candidate' is exactly what the matcher writes
// for a proposal, so the row reappears with its score and its Zuordnen button, and
// sync_transaction_matching_status flips the transaction back to 'open' because it counts only
// 'confirmed' rows. The confirmation stamps are cleared with it; the history keeps the record of
// what happened.
export function useUnlinkMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      matchId: string;
      documentId: string;
      reason?: string;
      /**
       * Walk the invoice back out of 'bezahlt' as part of the unlink.
       *
       * Opt-in because the paid switch already does its own walk-back before calling this, and
       * two of them would write two correction rows for one decision. The unlink BUTTONS pass it;
       * callers that have already handled the status do not.
       */
      walkBack?: boolean;
      /** Who the change was made as, when somebody is standing in for another person. */
      actingAls?: Record<string, unknown>;
    }) => {
      const { error } = await sb
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "candidate",
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          reject_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.matchId);
      if (error) throw error;

      const reason = args.reason?.trim();

      // THE INVOICE CANNOT STAY AT 'BEZAHLT' WITH NOTHING BEHIND IT. advance_workflow_on_payment()
      // fires on paid_at null -> non-null and has no reverse, so removing the payment used to leave
      // the invoice standing at Bezahlt in the chain. Same rule and same target as the paid switch.
      let reset = false;
      if (args.walkBack) {
        const { data: doc } = await sb
          .from(TABLE.documents)
          .select("workflow_status, paid_source")
          .eq("id", args.documentId)
          .maybeSingle();
        if (doc?.workflow_status === "paid") {
          const patch: Record<string, unknown> = {
            workflow_status: "in_review",
            updated_at: new Date().toISOString(),
          };
          // IS ANYTHING STILL BEHIND THE PAID MARK? This used to withdraw only 'bank_match', on the
          // grounds that a human who ticked the paid switch said something an unlink should not
          // overrule. Writing off a remainder also stores 'manual' (there is a CHECK constraint on
          // the column, so it cannot have a value of its own), and that decision is ONLY about this
          // allocation: unlink it and the invoice was left paid on nothing, so re-matching it read
          // "Restbetrag abgeschrieben" about a write-off that no longer applied.
          //
          // So the test is what is left, not who wrote it. Another confirmed link still standing
          // means the paid mark keeps its basis and is untouched. 'banksapi_payment' is a payment
          // that actually left the account and stands on its own whatever the matching says.
          const { count: remaining } = await sb
            .from(TABLE.documentTransactionMatches)
            .select("id", { count: "exact", head: true })
            .eq("document_id", args.documentId)
            .eq("status", "confirmed")
            .neq("id", args.matchId);
          if ((remaining ?? 0) === 0 && doc.paid_source !== "banksapi_payment") {
            patch.paid_at = null;
            patch.paid_source = null;
          }
          const { error: wfError } = await sb
            .from(TABLE.documents)
            .update(patch)
            .eq("id", args.documentId);
          if (wfError) throw wfError;
          reset = true;
        }
      }

      // 'zuordnung_getrennt' when the status moved, so this lands in the Workflow-Verlauf (which
      // renders APPROVAL_VERLAUF_TYPES only) under its own name. Not 'correction': that reads as
      // "status manually corrected", and nobody corrected anything -- a payment came off and the
      // status followed it. Plain 'booking' when nothing moved.
      // Persisted audit text stays German (do not translate).
      await insertHistory(
        args.documentId,
        reset ? "zuordnung_getrennt" : "booking",
        reason
          ? `Banktransaktions-Zuordnung getrennt: ${reason}`
          : "Banktransaktions-Zuordnung getrennt",
        {
          event: "match_unlinked",
          ...(reset ? { von: "paid", nach: "in_review" } : {}),
          // Both keys: `kommentar` is what the workflow timeline reads first, `grund` is what the
          // unlink flow has always written and what older rows carry.
          ...(reason ? { grund: reason, kommentar: reason } : {}),
          ...(args.actingAls ?? {}),
        },
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

/** Credit side of useUnlinkMatch (outgoing invoices, migration 0045/0058). */
export function useUnlinkOutgoingMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { matchId: string; outgoingInvoiceId: string; reason?: string }) => {
      const { error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .update({
          status: "candidate",
          confirmed_by: null,
          confirmed_at: null,
          rejected_by: null,
          rejected_at: null,
          reject_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", args.matchId);
      if (error) throw error;
      const reason = args.reason?.trim();
      await insertChangeHistory(
        "outgoing_invoices",
        args.outgoingInvoiceId,
        "booking",
        reason ? `Transaktions-Zuordnung getrennt: ${reason}` : "Transaktions-Zuordnung getrennt",
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

export function useRejectOutgoingMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { matchId: string; outgoingInvoiceId: string; reason?: string }) => {
      const actor = await actorEmail();
      const now = new Date().toISOString();
      const { error } = await sb
        .from(TABLE.outgoingInvoiceTransactionMatches)
        .update({
          status: "rejected",
          rejected_by: actor,
          rejected_at: now,
          reject_reason: args.reason ?? null,
          updated_at: now,
        })
        .eq("id", args.matchId);
      if (error) throw error;
      await insertChangeHistory(
        "outgoing_invoices",
        args.outgoingInvoiceId,
        "booking",
        "Transaktions-Zuordnung abgelehnt",
      );
    },
    onSuccess: () => invalidateMatchState(qc),
  });
}

// Manually link one outgoing invoice to one (credit) transaction -- the outgoing-direction mirror
// of useLinkInvoiceTransaction, going through the same kind of atomic RPC (migration 0045) for the
// same reasons: confirm + withdraw stale suggestions on both sides + release an OPOS whitelist hide,
// all in one transaction. `amount` left undefined takes whatever is still open on both sides.
export function useLinkOutgoingInvoiceTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      outgoingInvoiceId: string;
      transactionId: string;
      score?: number | null;
      reasons?: Record<string, unknown> | null;
      amount?: number | null;
    }): Promise<string> => {
      const { data, error } = await sb.rpc("link_outgoing_invoice_transaction", {
        p_outgoing_invoice_id: args.outgoingInvoiceId,
        p_transaction_id: args.transactionId,
        p_score: args.score ?? null,
        p_reasons: args.reasons ?? null,
        p_amount: args.amount ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    // The RPC already writes the change_history entry, so no insertChangeHistory here.
    onSuccess: () => invalidateMatchState(qc),
  });
}
