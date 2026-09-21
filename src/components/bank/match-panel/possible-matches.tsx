import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useTranslation } from "@/lib/i18n";
import { usePaymentRight } from "@/lib/payment-right";
import { useLinkInvoiceTransaction, useLinkOutgoingInvoiceTransaction } from "@/data";
import { errorText, formatDate, formatSignedEUR } from "@/lib/data/format";
import {
  MatchCard,
  MatchCardAction,
  MatchCardMeta,
} from "@/components/bank/match-panel/match-card";
import {
  LinkConfirmDialog,
  type LinkConfirmPair,
} from "@/components/bank/match-panel/link-confirm-dialog";
import type { ScoredMatch } from "@/components/bank/match-panel/use-possible-matches";
import type { MatchReasons } from "@/lib/data/types";

/**
 * Pure rendering of an already-scored shortlist (see `usePossibleMatches`). Confirming one of
 * these goes through the same useLinkInvoiceTransaction/useLinkOutgoingInvoiceTransaction RPC path
 * ManualSearch uses for a manually-found pair -- these are NOT rows from
 * `invoice_transaction_matches`, nothing was ever confirmed or auto-proposed here -- carrying the
 * freshly computed score/reasons along for the record.
 */
export function PossibleMatches({
  matches,
  invoiceId,
  invoiceType,
  invoiceLabel,
  invoiceNr,
  invoiceGross,
  onLinked,
}: {
  matches: ScoredMatch[];
  invoiceId: string;
  invoiceType: "incoming" | "outgoing";
  invoiceLabel: string;
  invoiceNr: string | null;
  invoiceGross: number | null;
  onLinked: () => void;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: noPaymentRight } = usePaymentRight();
  const linkIncoming = useLinkInvoiceTransaction();
  const linkOutgoing = useLinkOutgoingInvoiceTransaction();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmParam, setConfirmParam] = useState<string | undefined>(undefined);
  const pair = useMemo((): PendingPair | null => {
    const hit = confirmParam ? matches.find((m) => m.txn.id === confirmParam) : undefined;
    if (!hit) return null;
    return {
      score: hit.score,
      reasons: hit.reasons,
      confirm: {
        side: invoiceType,
        invoiceId,
        invoiceLabel,
        invoiceNr,
        invoiceGross,
        transactionId: hit.txn.id,
        transactionLabel: hit.txn.counterparty_holder ?? "—",
        transactionAmount: hit.txn.amount,
        transactionDate: hit.txn.booking_date,
      },
    };
  }, [confirmParam, matches, invoiceType, invoiceId, invoiceLabel, invoiceNr, invoiceGross]);
  const linking = linkIncoming.isPending || linkOutgoing.isPending;

  function link(transactionId: string, score: number, reasons: MatchReasons) {
    setPendingId(transactionId);
    const onSettled = {
      onSuccess: () => {
        toast.success(t("matchPanel.linked"));
        onLinked();
      },
      onError: (e: unknown) => toast.error(t("matchPanel.linkFailed", { error: errorText(e) })),
      onSettled: () => {
        setPendingId(null);
        setConfirmParam(undefined);
      },
    };
    if (invoiceType === "outgoing") {
      linkOutgoing.mutate(
        { outgoingInvoiceId: invoiceId, transactionId, score, reasons },
        onSettled,
      );
    } else {
      linkIncoming.mutate({ documentId: invoiceId, transactionId, score, reasons }, onSettled);
    }
  }

  return (
    <ul className="space-y-3">
      {matches.map(({ txn, score, reasons }) => (
        <li key={txn.id}>
          <MatchCard
            title={
              <span className="truncate text-sm font-medium text-foreground">
                {txn.counterparty_holder ?? "—"}
              </span>
            }
            meta={
              <MatchCardMeta
                amount={formatSignedEUR(txn.amount)}
                detail={formatDate(txn.booking_date)}
              />
            }
            reasons={reasons}
            score={score}
            actions={
              <MatchCardAction
                label={t("bank.matches.bestaetigenZahlung")}
                pendingLabel={t("matchPanel.linking")}
                pending={pendingId === txn.id}
                disabled={linking || !mayPay}
                title={noPaymentRight}
                onClick={() => setConfirmParam(txn.id)}
              />
            }
          />
        </li>
      ))}
      <LinkConfirmDialog
        pair={pair?.confirm ?? null}
        pending={linking}
        onCancel={() => setConfirmParam(undefined)}
        onConfirm={(confirmed) => pair && link(confirmed.transactionId, pair.score, pair.reasons)}
      />
    </ul>
  );
}

type PendingPair = { score: number; reasons: MatchReasons; confirm: LinkConfirmPair };
