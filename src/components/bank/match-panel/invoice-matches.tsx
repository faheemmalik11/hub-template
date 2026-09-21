import { Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { usePaymentRight } from "@/lib/payment-right";
import { PaymentRightNotice } from "@/components/bank/payment-right-notice";
import {
  useDocumentMatches,
  useConfirmMatch,
  useConfirmOutgoingMatch,
  useOutgoingInvoiceMatches,
  useRejectMatch,
  useRejectOutgoingMatch,
  useUnlinkMatch,
  useUnlinkOutgoingMatch,
} from "@/data";
import { errorText, formatDate, formatEUR, formatSignedEUR } from "@/lib/data/format";
import { MatchStatusBadge } from "@/components/bank/badges";
import { MatchCard, MatchCardAction } from "@/components/bank/match-panel/match-card";
import {
  LinkConfirmDialog,
  type LinkConfirmPair,
} from "@/components/bank/match-panel/link-confirm-dialog";
import type { MatchReasons } from "@/lib/data/types";

function group(status: string): "reconciled" | "suggestions" | "rejected" {
  if (status === "confirmed") return "reconciled";
  if (status === "rejected") return "rejected";
  return "suggestions";
}

const GROUP_ORDER = { reconciled: 0, suggestions: 1, rejected: 2 } as const;

interface DisplayMatch {
  id: string;
  entityId: string | null; // the candidate bank transaction's id
  status: string;
  score: number | null;
  match_reasons: MatchReasons | null;
  amount_matched: number;
  label: string;
  date: string | null;
  amount: number | null;
}

/**
 * Candidate bank transactions for one invoice, with confirm/reject controls.
 *
 * The invoice-side mirror of `TransactionMatches` (match-candidates.tsx). Unlike that component,
 * both directions embed the SAME `bank_transactions(*)` shape (see useBelegMatches /
 * useOutgoingInvoiceMatches in queries.ts), so there is only one row shape to map to here, not two.
 */
export function InvoiceMatches({
  invoiceId,
  invoiceType,
  invoiceLabel,
  invoiceNr,
  invoiceGross,
}: {
  invoiceId: string;
  invoiceType: "incoming" | "outgoing";
  invoiceLabel: string;
  invoiceNr: string | null;
  invoiceGross: number | null;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: noPaymentRight } = usePaymentRight();
  const [confirmParam, setConfirmParam] = useState<string | undefined>(undefined);
  const isOutgoing = invoiceType === "outgoing";

  // Both directions' queries/mutations are always called unconditionally (react-hooks forbids a
  // conditional hook call) -- only the RESULT selected below depends on invoiceType. Harmless: an
  // incoming invoice's id never appears in outgoing_invoice_transaction_matches and vice versa.
  const incomingMatchesQ = useDocumentMatches(invoiceId);
  const outgoingMatchesQ = useOutgoingInvoiceMatches(invoiceId);
  const confirmMatch = useConfirmMatch();
  const rejectMatch = useRejectMatch();
  const confirmOutgoingMatch = useConfirmOutgoingMatch();
  const rejectOutgoingMatch = useRejectOutgoingMatch();
  const unlinkMatch = useUnlinkMatch();
  const unlinkOutgoingMatch = useUnlinkOutgoingMatch();

  const rawMatches = useMemo(
    () => (isOutgoing ? (outgoingMatchesQ.data ?? []) : (incomingMatchesQ.data ?? [])),
    [isOutgoing, outgoingMatchesQ.data, incomingMatchesQ.data],
  );

  const pair = useMemo((): PendingConfirm | null => {
    if (!confirmParam) return null;
    const hit = rawMatches.find((m) => m.bank_transactions?.id === confirmParam);
    const txn = hit?.bank_transactions;
    if (!hit || !txn) return null;
    return {
      matchId: hit.id,
      confirm: {
        side: invoiceType,
        invoiceId,
        invoiceLabel,
        invoiceNr,
        invoiceGross,
        transactionId: txn.id,
        transactionLabel: txn.counterparty_holder ?? "—",
        transactionAmount: txn.amount,
        transactionDate: txn.booking_date,
        fixedAmount: hit.amount_matched,
      },
    };
  }, [confirmParam, rawMatches, invoiceType, invoiceId, invoiceLabel, invoiceNr, invoiceGross]);

  const isLoading = isOutgoing ? outgoingMatchesQ.isLoading : incomingMatchesQ.isLoading;
  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const raw = isOutgoing ? (outgoingMatchesQ.data ?? []) : (incomingMatchesQ.data ?? []);
  const allMatches: DisplayMatch[] = raw.map((m) => {
    const txn = m.bank_transactions ?? null;
    return {
      id: m.id,
      entityId: txn?.id ?? null,
      status: m.status,
      score: m.score,
      match_reasons: m.match_reasons,
      amount_matched: m.amount_matched,
      label: txn?.counterparty_holder ?? t("bank.matches.transaktion"),
      date: txn?.booking_date ?? null,
      amount: txn?.amount ?? null,
    };
  });

  // A rejected suggestion stays listed, last and muted, with its own badge -- see
  // TransactionMatches's identical comment on why it is not simply filtered out.

  const matches = [...allMatches].sort(
    (a, b) => GROUP_ORDER[group(a.status)] - GROUP_ORDER[group(b.status)],
  );

  if (matches.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        {t("bank.matches.emptyTransactions")}
      </p>
    );
  }

  return (
    <>
      <PaymentRightNotice className="mb-3" />
      <ul className="space-y-3">
        {matches.map((m, i) => {
          const open = m.status === "candidate" || m.status === "auto";
          const g = group(m.status);
          const newGroup = i === 0 || group(matches[i - 1].status) !== g;
          return (
            <Fragment key={m.id}>
              {newGroup && (
                <li className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`bank.matches.gruppe${g.charAt(0).toUpperCase()}${g.slice(1)}`)}
                </li>
              )}
              <li>
                <MatchCard
                  muted={m.status === "rejected"}
                  title={
                    m.entityId ? (
                      <Link
                        to="/bank-transactions/$id"
                        params={{ id: m.entityId }}
                        className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {m.label}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("bank.matches.transaktionEntfernt")}
                      </span>
                    )
                  }
                  badge={
                    m.status === "confirmed" ? undefined : <MatchStatusBadge status={m.status} />
                  }
                  meta={
                    <>
                      <span className="tabular-nums">{formatSignedEUR(m.amount)}</span>
                      {m.amount != null &&
                        Math.abs(Math.abs(m.amount) - Math.abs(m.amount_matched ?? 0)) > 0.01 && (
                          <span className="tabular-nums font-medium text-foreground">
                            {t("bank.matches.davon", { amount: formatEUR(m.amount_matched) })}
                          </span>
                        )}
                      <span>·</span>
                      <span>{formatDate(m.date)}</span>
                    </>
                  }
                  reasons={m.match_reasons}
                  score={m.score}
                  actions={
                    open && m.entityId ? (
                      <>
                        <MatchCardAction
                          label={t("bank.matches.bestaetigenZahlung")}
                          disabled={
                            (isOutgoing
                              ? confirmOutgoingMatch.isPending
                              : confirmMatch.isPending) || !mayPay
                          }
                          title={noPaymentRight}
                          onClick={() => setConfirmParam(m.entityId as string)}
                        />
                        <MatchCardAction
                          tone="quiet"
                          label={t("bank.matches.keinTreffer")}
                          disabled={
                            isOutgoing ? rejectOutgoingMatch.isPending : rejectMatch.isPending
                          }
                          onClick={() => {
                            const onSettled = {
                              onSuccess: () => toast.success(t("bank.matches.toast.abgelehnt")),
                              onError: (e: unknown) =>
                                toast.error(
                                  t("bank.matches.toast.fehlgeschlagen", { error: errorText(e) }),
                                ),
                            };
                            if (isOutgoing) {
                              rejectOutgoingMatch.mutate(
                                { matchId: m.id, outgoingInvoiceId: invoiceId },
                                onSettled,
                              );
                            } else {
                              rejectMatch.mutate(
                                { matchId: m.id, documentId: invoiceId },
                                onSettled,
                              );
                            }
                          }}
                        />
                      </>
                    ) : m.status === "confirmed" && m.entityId ? (
                      <UnlinkInvoiceMatchButton
                        isOutgoing={isOutgoing}
                        matchId={m.id}
                        invoiceId={invoiceId}
                        unlinkMatch={unlinkMatch}
                        unlinkOutgoingMatch={unlinkOutgoingMatch}
                      />
                    ) : null
                  }
                />
              </li>
            </Fragment>
          );
        })}
        <LinkConfirmDialog
          pair={pair?.confirm ?? null}
          pending={isOutgoing ? confirmOutgoingMatch.isPending : confirmMatch.isPending}
          onCancel={() => setConfirmParam(undefined)}
          onConfirm={(confirmedPair, options) => {
            if (!pair) return;
            const onSettled = {
              onSuccess: () => {
                toast.success(t("bank.matches.toast.bestaetigt"));
                setConfirmParam(undefined);
              },
              onError: (e: unknown) =>
                toast.error(t("bank.matches.toast.fehlgeschlagen", { error: errorText(e) })),
            };
            if (isOutgoing) {
              confirmOutgoingMatch.mutate(
                {
                  matchId: pair.matchId,
                  outgoingInvoiceId: invoiceId,
                  differenceReason: options?.differenceReason,
                },
                onSettled,
              );
            } else {
              confirmMatch.mutate(
                {
                  matchId: pair.matchId,
                  documentId: invoiceId,
                  differenceReason: options?.differenceReason,
                },
                onSettled,
              );
            }
          }}
        />
      </ul>
    </>
  );
}

type PendingConfirm = { matchId: string; confirm: LinkConfirmPair };

// Undo a CONFIRMED match. Mirrors UnlinkMatchButton (match-candidates.tsx) exactly, keyed by
// invoiceId instead of the transaction-side entityId.
function UnlinkInvoiceMatchButton({
  isOutgoing,
  matchId,
  invoiceId,
  unlinkMatch,
  unlinkOutgoingMatch,
}: {
  isOutgoing: boolean;
  matchId: string;
  invoiceId: string;
  unlinkMatch: ReturnType<typeof useUnlinkMatch>;
  unlinkOutgoingMatch: ReturnType<typeof useUnlinkOutgoingMatch>;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: noPaymentRight } = usePaymentRight();
  const [reason, setReason] = useState("");
  const pending = isOutgoing ? unlinkOutgoingMatch.isPending : unlinkMatch.isPending;

  function unlink() {
    const onSettled = {
      onSuccess: () => toast.success(t("bank.matches.toast.getrennt")),
      onError: (e: unknown) =>
        toast.error(t("bank.matches.toast.fehlgeschlagen", { error: errorText(e) })),
    };
    if (isOutgoing) {
      unlinkOutgoingMatch.mutate(
        { matchId, outgoingInvoiceId: invoiceId, reason: reason.trim() },
        onSettled,
      );
    } else {
      unlinkMatch.mutate(
        // walkBack, same as the other two unlink buttons: an invoice with its only payment removed
        // cannot stand at 'bezahlt', and this screen was the one path that left it there.
        { matchId, documentId: invoiceId, reason: reason.trim(), walkBack: true },
        onSettled,
      );
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && setReason("")}>
      <AlertDialogTrigger asChild>
        <MatchCardAction
          tone="quiet"
          label={t("bank.matches.trennen")}
          disabled={pending || !mayPay}
          title={noPaymentRight}
        />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bank.matches.trennenDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("bank.matches.trennenDialog.desc")}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* REQUIRED, the same rule as the other two unlink paths and as moving an invoice back out
            of Bezahlt. Unlinking undoes a payment, and the history is the only record of why. */}
        <div className="space-y-1.5">
          <Label htmlFor="unlink-grund-panel">
            {t("bank.matches.trennenDialog.grund")}{" "}
            <span className="text-destructive" title={t("common.form.pflichtfeld")}>
              *
            </span>
          </Label>
          <Input
            id="unlink-grund-panel"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("bank.matches.trennenDialog.grundPlaceholder")}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("bank.matches.trennenDialog.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={reason.trim() === ""}
            onClick={unlink}
          >
            {t("bank.matches.trennenDialog.bestaetigen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
