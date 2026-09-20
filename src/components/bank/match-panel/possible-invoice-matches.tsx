import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useTranslation } from "@/lib/i18n";
import { usePaymentRight } from "@/lib/payment-right";
import { useLinkInvoiceTransaction, useLinkOutgoingInvoiceTransaction } from "@/data";
import { fehlerText, formatEUR } from "@/lib/data/format";
import {
  MatchCard,
  MatchCardAction,
  MatchCardMeta,
} from "@/components/bank/match-panel/match-card";
import {
  LinkConfirmDialog,
  type LinkConfirmPair,
} from "@/components/bank/match-panel/link-confirm-dialog";
import type { ScoredInvoiceMatch } from "@/components/bank/match-panel/use-possible-invoice-matches";
import type { MatchReasons } from "@/lib/data/types";

/**
 * Invoice-side mirror of `PossibleMatches`: pure rendering of an already-scored shortlist (see
 * `usePossibleInvoiceMatches`). These are NOT rows from `invoice_transaction_matches` /
 * `outgoing_invoice_transaction_matches` -- nothing was ever confirmed or auto-proposed here -- so
 * confirming one goes through the same link RPC ManualSearch uses for a manually-found pair,
 * carrying the freshly computed score/reasons along for the record. `type` picks which direction's
 * mutation applies per candidate (a transaction's shortlist can only ever be one direction, but
 * kept explicit rather than assumed).
 */
export function PossibleInvoiceMatches({
  matches,
  transactionId,
  transactionLabel,
  transactionAmount,
  transactionDate,
  onLinked,
}: {
  matches: ScoredInvoiceMatch[];
  transactionId: string;
  transactionLabel: string;
  transactionAmount: number | null;
  transactionDate: string | null;
  onLinked: () => void;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: keinZahlrecht } = usePaymentRight();
  const linkIncoming = useLinkInvoiceTransaction();
  const linkOutgoing = useLinkOutgoingInvoiceTransaction();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmParam, setConfirmParam] = useState<string | undefined>(undefined);
  const pair = useMemo((): PendingPair | null => {
    const hit = confirmParam ? matches.find((c) => c.id === confirmParam) : undefined;
    if (!hit) return null;
    return {
      candidate: hit,
      confirm: {
        side: hit.type,
        invoiceId: hit.id,
        invoiceLabel: hit.label,
        invoiceNr: hit.nr,
        invoiceGross: hit.amount,
        transactionId,
        transactionLabel,
        transactionAmount,
        transactionDate,
      },
    };
  }, [confirmParam, matches, transactionId, transactionLabel, transactionAmount, transactionDate]);
  const linking = linkIncoming.isPending || linkOutgoing.isPending;

  function link(candidate: ScoredInvoiceMatch, score: number, reasons: MatchReasons) {
    setPendingId(candidate.id);
    const onSettled = {
      onSuccess: () => {
        toast.success(t("matchPanel.linked"));
        onLinked();
      },
      onError: (e: unknown) => toast.error(t("matchPanel.linkFailed", { error: fehlerText(e) })),
      onSettled: () => {
        setPendingId(null);
        setConfirmParam(undefined);
      },
    };
    if (candidate.type === "outgoing") {
      linkOutgoing.mutate(
        { outgoingInvoiceId: candidate.id, transactionId, score, reasons },
        onSettled,
      );
    } else {
      linkIncoming.mutate({ belegId: candidate.id, transactionId, score, reasons }, onSettled);
    }
  }

  return (
    <ul className="space-y-3">
      {matches.map((candidate) => (
        <li key={candidate.id}>
          <MatchCard
            title={
              <span className="truncate text-sm font-medium text-foreground">
                {candidate.label}
              </span>
            }
            meta={
              <MatchCardMeta amount={formatEUR(candidate.amount)} detail={candidate.nr ?? "—"} />
            }
            reasons={candidate.reasons}
            score={candidate.score}
            actions={
              <MatchCardAction
                label={t("bank.matches.bestaetigenBeleg")}
                pendingLabel={t("matchPanel.linking")}
                pending={pendingId === candidate.id}
                disabled={linking || !mayPay}
                title={keinZahlrecht}
                onClick={() => setConfirmParam(candidate.id)}
              />
            }
          />
        </li>
      ))}
      <LinkConfirmDialog
        pair={pair?.confirm ?? null}
        pending={linking}
        onCancel={() => setConfirmParam(undefined)}
        onConfirm={() => pair && link(pair.candidate, pair.candidate.score, pair.candidate.reasons)}
      />
    </ul>
  );
}

type PendingPair = { candidate: ScoredInvoiceMatch; confirm: LinkConfirmPair };
