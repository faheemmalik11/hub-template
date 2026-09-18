import { Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n";
import { usePaymentRight } from "@/lib/payment-right";
import { PaymentRightNotice } from "@/components/bank/payment-right-notice";
import {
  useConfirmMatch,
  useConfirmOutgoingMatch,
  useOutgoingTransactionMatches,
  useRejectMatch,
  useRejectOutgoingMatch,
  useUnlinkMatch,
  useUnlinkOutgoingMatch,
  useTransactionMatches,
} from "@/lib/data/queries";
import { fehlerText, formatEUR } from "@/lib/data/format";
import { MatchStatusBadge } from "@/components/bank/badges";
import { MatchCard, MatchCardAction } from "@/components/bank/match-panel/match-card";
import {
  LinkConfirmDialog,
  type LinkConfirmPair,
} from "@/components/bank/match-panel/link-confirm-dialog";
import type { MatchReasons } from "@/lib/data/types";

function gruppe(status: string): "abgeglichen" | "vorschlaege" | "abgelehnt" {
  if (status === "bestaetigt") return "abgeglichen";
  if (status === "abgelehnt") return "abgelehnt";
  return "vorschlaege";
}

const GRUPPEN_RANG = { abgeglichen: 0, vorschlaege: 1, abgelehnt: 2 } as const;

// One row's worth of what's direction-specific, normalized so the JSX below reads the same either
// way. entityId is whichever id the confirm/reject mutation needs (invoice or outgoing invoice).
interface DisplayMatch {
  id: string;
  entityId: string | null;
  status: string;
  score: number | null;
  match_reasons: MatchReasons | null;
  amount_matched: number;
  label: string;
  nr: string | null;
  amountGross: number | null;
  // Only an incoming Beleg has an in-app detail page — an outgoing invoice never does
  // (migration 0086 removed the LexOffice link that used to cover that case).
  link: { kind: "internal"; nr: string } | null;
}

// Candidate belege (incoming) or outgoing invoices (credit, migration 0045) for a bank transaction,
// with confirm/reject controls. Direction is derived from the transaction's own sign — the same
// convention runMatching() uses (amount < 0 = incoming/debit, amount >= 0 = outgoing/credit) — so a
// caller never has to say it explicitly.
export function TransactionMatches({
  transactionId,
  transactionAmount,
}: {
  transactionId: string;
  /** Signed transaction amount, so the allocated total can be shown against it and the right
   * direction's matches are shown. */
  transactionAmount?: number | null;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: keinZahlrecht } = usePaymentRight();
  const [confirmParam, setConfirmParam] = useState<string | undefined>(undefined);
  const isCredit = (transactionAmount ?? -1) >= 0;

  // Both directions' queries/mutations are always called unconditionally (react-hooks forbids a
  // conditional hook call) — only the RESULT selected below depends on direction.
  const incomingMatchesQ = useTransactionMatches(transactionId);
  const outgoingMatchesQ = useOutgoingTransactionMatches(transactionId);
  const confirmMatch = useConfirmMatch();
  const rejectMatch = useRejectMatch();
  const confirmOutgoingMatch = useConfirmOutgoingMatch();
  const rejectOutgoingMatch = useRejectOutgoingMatch();
  const unlinkMatch = useUnlinkMatch();
  const unlinkOutgoingMatch = useUnlinkOutgoingMatch();

  const rohMatches = useMemo(
    () => (isCredit ? (outgoingMatchesQ.data ?? []) : (incomingMatchesQ.data ?? [])),
    [isCredit, outgoingMatchesQ.data, incomingMatchesQ.data],
  );

  const pair = useMemo((): PendingConfirm | null => {
    if (!confirmParam) return null;
    for (const m of rohMatches) {
      const entity = isCredit
        ? ((m as { outgoing_invoices?: { id: string } | null }).outgoing_invoices ?? null)
        : ((m as { documents?: { id: string } | null }).documents ?? null);
      if (!entity || entity.id !== confirmParam) continue;
      return {
        matchId: m.id,
        entityId: entity.id,
        confirm: {
          side: isCredit ? "outgoing" : "incoming",
          invoiceId: entity.id,
          invoiceLabel: t("bank.matches.beleg"),
          invoiceNr: null,
          // The dialog measures the invoice against this. Passing null made it read
          // "not paid in full, 0,00 EUR stays unpaid" on a match that covered the invoice exactly,
          // because isFullyCovered() cannot judge coverage with no gross to judge against.
          invoiceGross: isCredit
            ? ((m as { outgoing_invoices?: { amount_gross?: number | null } | null })
                .outgoing_invoices?.amount_gross ?? null)
            : ((m as { documents?: { amount_gross?: number | null } | null }).documents
                ?.amount_gross ?? null),
          transactionId,
          transactionLabel: t("matchPanel.transactionTitle"),
          transactionAmount: transactionAmount ?? null,
          transactionDate: null,
          fixedAmount: m.amount_matched,
        },
      };
    }
    return null;
  }, [confirmParam, rohMatches, isCredit, transactionId, transactionAmount, t]);

  const isLoading = isCredit ? outgoingMatchesQ.isLoading : incomingMatchesQ.isLoading;
  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const alleMatches: DisplayMatch[] = isCredit
    ? (outgoingMatchesQ.data ?? []).map((m) => {
        const oi = m.outgoing_invoices ?? null;
        return {
          id: m.id,
          entityId: oi?.id ?? null,
          status: m.status,
          score: m.score,
          match_reasons: m.match_reasons,
          amount_matched: m.amount_matched,
          label: oi?.customers?.name ?? t("bank.matches.beleg"),
          nr: oi?.voucher_number ?? null,
          amountGross: oi?.amount_gross ?? null,
          // No in-app detail page for an outgoing invoice; its file is reachable from the
          // Ausgangsrechnungen list instead.
          link: null,
        };
      })
    : (incomingMatchesQ.data ?? []).map((m) => {
        const b = m.documents ?? null;
        return {
          id: m.id,
          entityId: b?.id ?? null,
          status: m.status,
          score: m.score,
          match_reasons: m.match_reasons,
          amount_matched: m.amount_matched,
          label: b?.issuer ?? t("bank.matches.beleg"),
          nr: b?.invoice_number ?? null,
          amountGross: b?.amount_gross ?? null,
          link: b != null ? { kind: "internal", nr: b.id } : null,
        };
      });

  // A rejected suggestion used to be filtered out entirely, so a mis-click deleted the record from
  // the screen: the panel then said no candidates had been proposed at all. They stay listed now,
  // last and muted, with their own badge -- the rejection is a decision somebody made, and the
  // screen is where you would look to see that it happened.
  const matches = [...alleMatches].sort(
    (a, b) => GRUPPEN_RANG[gruppe(a.status)] - GRUPPEN_RANG[gruppe(b.status)],
  );

  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("bank.matches.empty")}</p>;
  }

  // A collective payment is only readable as a running total: how much of this transaction is
  // already explained by receipts, and how much still is not.
  const allocated = matches
    .filter((m) => m.status === "bestaetigt")
    .reduce((s, m) => s + Math.abs(m.amount_matched ?? 0), 0);
  const total = Math.abs(transactionAmount ?? 0);
  const rest = Math.max(total - allocated, 0);

  return (
    <>
      <PaymentRightNotice className="mb-3" />
      {total > 0 && allocated > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          {t("bank.matches.zugeordnetVon", {
            zugeordnet: formatEUR(allocated),
            gesamt: formatEUR(total),
          })}
          {rest > 0.01 && ` · ${t("bank.matches.restOffen", { rest: formatEUR(rest) })}`}
        </p>
      )}
      <ul className="space-y-3">
        {matches.map((m, i) => {
          const offen = m.status === "kandidat" || m.status === "auto";
          const g = gruppe(m.status);
          const neueGruppe = i === 0 || gruppe(matches[i - 1].status) !== g;
          return (
            <Fragment key={m.id}>
              {neueGruppe && (
                <li className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`bank.matches.gruppe${g.charAt(0).toUpperCase()}${g.slice(1)}`)}
                </li>
              )}
              <li>
                <MatchCard
                  muted={m.status === "abgelehnt"}
                  title={
                    m.link?.kind === "internal" ? (
                      <Link
                        to="/eingangsrechnungen/$nr"
                        params={{ nr: m.link.nr }}
                        className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {m.label}
                      </Link>
                    ) : m.entityId ? (
                      <span className="truncate text-sm font-medium text-foreground">
                        {m.label}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("bank.matches.belegEntfernt")}
                      </span>
                    )
                  }
                  badge={
                    m.status === "bestaetigt" ? undefined : <MatchStatusBadge status={m.status} />
                  }
                  meta={
                    <>
                      <span>
                        {m.nr ? t("bank.matches.nr", { nr: m.nr }) : t("bank.matches.ohneNr")}
                      </span>
                      <span className="tabular-nums">{formatEUR(m.amountGross)}</span>
                      {m.amountGross != null &&
                        Math.abs(Math.abs(m.amountGross ?? 0) - Math.abs(m.amount_matched ?? 0)) >
                          0.01 && (
                          <span className="tabular-nums font-medium text-foreground">
                            {t("bank.matches.davon", { betrag: formatEUR(m.amount_matched) })}
                          </span>
                        )}
                    </>
                  }
                  reasons={m.match_reasons}
                  score={m.score}
                  actions={
                    offen && m.entityId ? (
                      <>
                        <MatchCardAction
                          label={t("bank.matches.bestaetigenBeleg")}
                          disabled={
                            (isCredit ? confirmOutgoingMatch.isPending : confirmMatch.isPending) ||
                            !mayPay
                          }
                          title={keinZahlrecht}
                          onClick={() => setConfirmParam(m.entityId as string)}
                        />
                        <MatchCardAction
                          tone="quiet"
                          label={t("bank.matches.keinTreffer")}
                          disabled={
                            isCredit ? rejectOutgoingMatch.isPending : rejectMatch.isPending
                          }
                          onClick={() => {
                            const onSettled = {
                              onSuccess: () => toast.success(t("bank.matches.toast.abgelehnt")),
                              onError: (e: unknown) =>
                                toast.error(
                                  t("bank.matches.toast.fehlgeschlagen", {
                                    error: fehlerText(e),
                                  }),
                                ),
                            };
                            if (isCredit) {
                              rejectOutgoingMatch.mutate(
                                { matchId: m.id, outgoingInvoiceId: m.entityId as string },
                                onSettled,
                              );
                            } else {
                              rejectMatch.mutate(
                                { matchId: m.id, belegId: m.entityId as string },
                                onSettled,
                              );
                            }
                          }}
                        />
                      </>
                    ) : m.status === "bestaetigt" && m.entityId ? (
                      <UnlinkMatchButton
                        isCredit={isCredit}
                        matchId={m.id}
                        entityId={m.entityId}
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
      </ul>
      <LinkConfirmDialog
        pair={pair?.confirm ?? null}
        pending={isCredit ? confirmOutgoingMatch.isPending : confirmMatch.isPending}
        onCancel={() => setConfirmParam(undefined)}
        onConfirm={(confirmedPair, options) => {
          if (!pair) return;
          const onSettled = {
            onSuccess: () => {
              toast.success(t("bank.matches.toast.bestaetigt"));
              setConfirmParam(undefined);
            },
            onError: (e: unknown) =>
              toast.error(t("bank.matches.toast.fehlgeschlagen", { error: fehlerText(e) })),
          };
          if (isCredit) {
            confirmOutgoingMatch.mutate(
              {
                matchId: pair.matchId,
                outgoingInvoiceId: pair.entityId,
                differenceReason: options?.differenceReason,
                transactionId,
                closeTransaction: options?.closeTransaction,
              },
              onSettled,
            );
          } else {
            confirmMatch.mutate(
              {
                matchId: pair.matchId,
                belegId: pair.entityId,
                differenceReason: options?.differenceReason,
                // The dialog asks whether to close a side; dropping the answer here left the
                // checkbox ticked, the reason typed, and the remainder still open.
                transactionId,
                closeInvoice: options?.closeInvoice,
                closeTransaction: options?.closeTransaction,
              },
              onSettled,
            );
          }
        }}
      />
    </>
  );
}

type PendingConfirm = { matchId: string; entityId: string; confirm: LinkConfirmPair };

function UnlinkMatchButton({
  isCredit,
  matchId,
  entityId,
  unlinkMatch,
  unlinkOutgoingMatch,
}: {
  isCredit: boolean;
  matchId: string;
  entityId: string;
  unlinkMatch: ReturnType<typeof useUnlinkMatch>;
  unlinkOutgoingMatch: ReturnType<typeof useUnlinkOutgoingMatch>;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: keinZahlrecht } = usePaymentRight();
  const [grund, setGrund] = useState("");
  const pending = isCredit ? unlinkOutgoingMatch.isPending : unlinkMatch.isPending;

  function unlink() {
    const onSettled = {
      onSuccess: () => toast.success(t("bank.matches.toast.getrennt")),
      onError: (e: unknown) =>
        toast.error(
          t("bank.matches.toast.fehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    };
    // NOT the reject mutation: unlinking hands the pair back as a suggestion, so it can be linked
    // again with one click. Rejecting parked it in 'abgelehnt', where the Match button never
    // returned -- reported from the live app.
    if (isCredit) {
      unlinkOutgoingMatch.mutate(
        { matchId, outgoingInvoiceId: entityId, grund: grund.trim() },
        onSettled,
      );
    } else {
      unlinkMatch.mutate(
        { matchId, belegId: entityId, grund: grund.trim(), walkBack: true },
        onSettled,
      );
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && setGrund("")}>
      <AlertDialogTrigger asChild>
        <MatchCardAction
          tone="quiet"
          label={t("bank.matches.trennen")}
          disabled={pending || !mayPay}
          title={keinZahlrecht}
        />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bank.matches.trennenDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("bank.matches.trennenDialog.desc")}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* REQUIRED, the same rule as moving an invoice back out of Bezahlt. Unlinking undoes a
            payment: the invoice returns to the chain and the transaction reopens, and the history
            is the only record of why somebody decided that. An optional field on a decision this
            size is left blank most of the time. */}
        <div className="space-y-1.5">
          <Label htmlFor="unlink-grund">
            {t("bank.matches.trennenDialog.grund")}{" "}
            <span className="text-destructive" title={t("common.form.pflichtfeld")}>
              *
            </span>
          </Label>
          <Input
            id="unlink-grund"
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder={t("bank.matches.trennenDialog.grundPlaceholder")}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("bank.matches.trennenDialog.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={grund.trim() === ""}
            onClick={unlink}
          >
            {t("bank.matches.trennenDialog.bestaetigen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
