import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Info, Link2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { CloseRemainderButton } from "@/components/bank/close-remainder";
import {
  useBankAccounts,
  useBankTransaction,
  useBwaCategories,
  useGesellschaften,
  useSetTransactionCategory,
  useTransactionMatches,
  useTransactionDocuments,
  useTransactionUploads,
  useCloseTransactionRemainder,
  useReopenTransactionRemainder,
} from "@/lib/data/queries";
import { useCategoryOptions } from "@/components/zuordnung/neue-regel-dialog";
import {
  fehlerText,
  formatEUR,
  formatDate,
  formatDateTime,
  formatIBAN,
  formatSignedEUR,
} from "@/lib/data/format";
import { GesellschaftChip } from "@/components/belege/badges";
import type { BankTransaction } from "@/lib/data/types";
import { RichtungBadge, TransactionTypeBadge, TxnMatchingBadge } from "@/components/bank/badges";
import { TransactionMatches } from "@/components/bank/match-candidates";
import { NoReceiptAction } from "@/components/bank/no-receipt-action";
import { TransactionDocuments } from "@/components/bank/transaction-documents";
import { NotifySomeone, PingNotice } from "@/components/belege/ping-button";
import { ErrorState } from "@/components/belege/query-states";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/banktransaktionen/$id")({
  head: () => ({ meta: [{ title: pageTitle("Transaktion") }] }),
  component: TransaktionDetailPage,
});

function TransaktionDetailPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { data: txn, isLoading, isError, error, refetch } = useBankTransaction(id);
  // Which of our accounts this ran through, and whose money it therefore is. The account decides
  // the company (trigger, migration 0025) and the company decides who may see the row at all, so
  // a detail page that names neither could not answer the screen's most basic question.
  const accountsQ = useBankAccounts();
  const gesellschaftenQ = useGesellschaften();
  const konto = (accountsQ.data ?? []).find((a) => a.id === txn?.account_id) ?? null;
  const gesellschaft = (gesellschaftenQ.data ?? []).find((g) => g.id === txn?.company_id) ?? null;
  // Reuses the very list this screen already renders below (TransactionMatches), so the header
  // badge and the suggestions panel can never disagree about whether something is pending.
  const matchesQ = useTransactionMatches(id);
  const hasSuggestedMatch = (matchesQ.data ?? []).some(
    (m) => m.status === "candidate" || m.status === "auto",
  );

  // WHAT IS LEFT ON THE PAYMENT. Coverage is summed from the links, never from the transaction
  // amount: a collective payment splits across several invoices and each link carries its own
  // share (migration 0024).
  const { can } = useAuth();
  const darfZahlen = can(PERMISSIONS.paymentsWrite);
  const closeRemainder = useCloseTransactionRemainder();
  const reopenRemainder = useReopenTransactionRemainder();
  const zugeordnet = (matchesQ.data ?? [])
    .filter((m) => m.status === "confirmed")
    .reduce((sum, m) => sum + Math.abs(m.amount_matched ?? 0), 0);
  const gesamt = txn ? Math.abs(txn.amount) : 0;
  const rest = Math.max(gesamt - zugeordnet, 0);
  // A cent of float noise is not a remainder anybody wants to be asked about.
  const hatRest = zugeordnet > 0 && rest > 0.01;
  const vollVerwendet = Boolean(txn?.fully_used_at);
  // FULL EITHER WAY. A payment can have no room left because the allocations add up to it, or
  // because somebody declared the remainder spent. Gating only on the stamp let a fully matched
  // payment keep offering an upload that link_invoice_transaction would then refuse with "nothing
  // left to allocate", which is a wasted upload and a confusing error.
  const nichtsMehrOffen = vollVerwendet || (zugeordnet > 0 && rest <= 0.01);

  // Every transaction used to sit in the browser tab as the same static "Transaktion", so two open
  // tabs were indistinguishable and the history was a wall of identical entries. Counterparty and
  // amount are what this screen leads with, and what a tab truncates to legibly.
  useEffect(() => {
    if (!txn) return;
    const wer = txn.counterparty_holder?.trim() || formatDate(txn.booking_date);
    document.title = pageTitle(`${wer} · ${formatSignedEUR(txn.amount)}`);
  }, [txn]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!txn) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("bank.detail.notFoundTitle")}
        </h1>
        <Button asChild className="mt-6">
          <Link to="/banktransaktionen">{t("bank.detail.toOverview")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/banktransaktionen"
        className="inline-flex items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("bank.detail.back")}
      </Link>

      <div data-tour="bank-txn-detail-header" className="mt-2 flex flex-wrap items-center gap-3">
        <h1
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            txn.amount < 0 ? "text-foreground" : "text-emerald-700",
          )}
        >
          {formatSignedEUR(txn.amount)}
        </h1>
        <TransactionTypeBadge type={txn.transaction_type} />
        <RichtungBadge richtung={txn.direction} />
        {/* Same reading as the list: an undecided match (kandidat/auto) leaves matching_status at
            'open', so without this the header said "Offen" on a transaction that in fact has a
            suggestion waiting right below it on this very screen. */}
        <TxnMatchingBadge status={txn.matching_status} hasSuggested={hasSuggestedMatch} />
        {/* The actions that address the whole transaction sit in the header, not inside a panel.
            Asking a colleague for the missing receipt is a decision about this payment, and it was
            buried in the document section — findable only after scrolling past the data card. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NotifySomeone kind="transaction" id={txn.id} />
          {/* Only outgoing debits are ever asked for a receipt — a credit pays one of OUR outgoing
              invoices and must stay open for matching, so it gets no hide action. */}
          {txn.direction === "ausgehend" && <NoReceiptAction txn={txn} variant="button" />}
        </div>
      </div>

      {/* Why this person is here. Somebody sent them to this transaction with a note, and without
          this the note stays behind in the bell on the screen they came from. Renders nothing when
          there is nothing waiting. */}
      <PingNotice kind="transaction" id={txn.id} />

      {/* Why this transaction is hidden, and who decided it — a rule or a person. */}
      {txn.matching_status === "ignored" && txn.no_receipt_reason && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("noReceipt.detail.grund", {
            grund: t(`oposWhitelist.category.${txn.no_receipt_reason}`),
          })}{" "}
          {txn.whitelist_rule_id
            ? t("noReceipt.detail.durchRegel")
            : t("noReceipt.detail.manuell", { actor: txn.no_receipt_set_by ?? "—" })}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <div
          data-tour="bank-txn-detail-data"
          className="rounded-xl border border-border bg-card p-5 text-base"
        >
          <h2 className="mb-3 text-base font-semibold uppercase tracking-wide text-muted-foreground">
            {t("bank.detail.section.transaktion")}
          </h2>
          <Row label={t("bank.detail.row.buchungsdatum")} value={formatDate(txn.booking_date)} />
          <Row label={t("bank.detail.row.wertstellung")} value={formatDate(txn.value_date)} />
          <Row label={t("bank.detail.row.buchungstext")} value={txn.booking_text ?? "—"} />
          <Separator className="my-3" />
          <Row label={t("bank.detail.row.gegenkonto")} value={txn.counterparty_holder ?? "—"} />
          <Row
            label={t("bank.detail.row.iban")}
            value={txn.counterparty_iban ? formatIBAN(txn.counterparty_iban) : "—"}
            mono
          />
          <Row label={t("bank.detail.row.bic")} value={txn.counterparty_bic ?? "—"} />
          {/* WHO SPENT IT. On a Pleo card purchase this is the whole counterparty story the bank
              side cannot tell: there is no IBAN and no creditor, just an employee and a merchant.
              The email rides along because two colleagues can share a first name, and because it
              is what somebody chasing a missing receipt actually writes to -- 1.959 of 2.123 Pleo
              rows carry both. Falls back to the email alone when Pleo has no display name. */}
          {(txn.spender_name || txn.spender_email) && (
            <Row
              label={t("bank.detail.row.bezahltVon")}
              value={txn.spender_name ?? txn.spender_email ?? "—"}
              sub={txn.spender_name ? (txn.spender_email ?? undefined) : undefined}
            />
          )}
          <Separator className="my-3" />
          <Row
            label={t("bank.detail.row.konto")}
            value={konto ? (konto.account_name ?? konto.iban ?? "—") : "—"}
          />
          {konto?.iban && (
            <Row label={t("bank.detail.row.kontoIban")} value={formatIBAN(konto.iban)} mono />
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t("bank.detail.row.gesellschaft")}</span>
            <span className="text-right text-foreground">
              {gesellschaft ? (
                <span className="inline-flex items-center gap-2">
                  <GesellschaftChip code={gesellschaft.code} />
                  <span className="text-base text-muted-foreground">{gesellschaft.name}</span>
                </span>
              ) : (
                t("bank.detail.keineGesellschaft")
              )}
            </span>
          </div>
          <Separator className="my-3" />
          <KategorieZeile txn={txn} />
          <Separator className="my-3" />
          <div>
            <div className="text-sm text-muted-foreground">
              {t("bank.detail.row.verwendungszweck")}
            </div>
            <p className="mt-1 text-base text-foreground">{txn.payment_reference ?? "—"}</p>
          </div>
        </div>

        {/* THE DOCUMENT, BEFORE THE SUGGESTIONS. A reader arriving here asks "is there a receipt
            for this?" first; the matching panel below answers a different question ("which
            invoice settles it?") and used to be the only thing on the page, which is why a
            transaction that already had its receipt still read as a dead end. */}
        {/* THE INVOICES FIRST. This is the question somebody opens a payment to answer: what does
            it pay for. The document card underneath answers a narrower one, and only Pleo ever
            fills it, so it does not deserve the top of the column. */}
        <section
          data-tour="bank-txn-detail-matches"
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
                {t(
                  txn.amount >= 0
                    ? "bank.detail.section.passendeAusgangsrechnungen"
                    : "bank.detail.section.passendeBelege",
                )}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  txn.amount >= 0
                    ? "bank.detail.passendeAusgangsrechnungenHint"
                    : "bank.detail.passendeBelegeHint",
                )}
              </p>
            </div>
            {/* The two ways to give this payment an invoice, next to the list of invoices rather
                than next to the Pleo receipt, because that is what they produce. */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* Only while there is something to assign to. A fully matched payment has no room
                  left, link_invoice_transaction would refuse it, and a row of greyed buttons on
                  every reconciled payment is clutter rather than guidance. */}
              {!nichtsMehrOffen && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/eingangsrechnungen/upload" search={{ fuer: `txn:${txn.id}` }}>
                      <Upload className="mr-1.5 size-4" />
                      {t("bank.detail.belege.hochladen")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/offene-posten" search={{ match: `txn:${txn.id}` }}>
                      <Link2 className="mr-1.5 size-4" />
                      {t("bank.detail.belege.zuordnen")}
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          <PendingUploads transactionId={txn.id} />

          {/* WHAT IS LEFT, and the way to close it. A link allocates the smaller of the two sides,
              so an invoice that disagrees with the payment leaves a remainder behind. */}
          {/* hatRest already means "allocated, and something is left" -- the stamp used to be ORed in
              here, which kept announcing "Restbetrag als verbraucht markiert" on a payment whose
              invoices had since grown to cover it in full. With nothing left over there is nothing
              to say, and the stamp changes no status the amounts do not already give. */}
          {hatRest && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-base">
              <span>
                {vollVerwendet
                  ? txn.fully_used_note
                    ? t("bank.detail.restschliessen.istGeschlossenGrund", {
                        grund: txn.fully_used_note,
                      })
                    : t("bank.detail.restschliessen.istGeschlossen")
                  : /* Unsigned: this is what is LEFT of the payment, not a movement, and
                       formatSignedEUR wrote it as "+62,08 EUR" as if money had come in. */
                    t("bank.detail.restschliessen.offenZahlung", { betrag: formatEUR(rest) })}
              </span>
              {vollVerwendet ? (
                darfZahlen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      reopenRemainder.mutate(txn.id, {
                        onSuccess: () =>
                          toast.success(t("bank.detail.restschliessen.wiederGeoeffnet")),
                        onError: (e) => toast.error(fehlerText(e)),
                      })
                    }
                  >
                    {t("bank.detail.restschliessen.wiederOeffnen")}
                  </Button>
                )
              ) : (
                <CloseRemainderButton
                  title={t("bank.detail.restschliessen.titelZahlung")}
                  description={t("bank.detail.restschliessen.beschreibungZahlung")}
                  actionLabel={t("bank.detail.restschliessen.aktionZahlung")}
                  remainderLabel={formatEUR(rest)}
                  disabledReason={
                    darfZahlen ? null : t("bank.detail.restschliessen.keineBerechtigung")
                  }
                  onClose={async (reason) => {
                    await closeRemainder.mutateAsync({ transactionId: txn.id, reason });
                  }}
                />
              )}
            </div>
          )}

          <TransactionMatches transactionId={txn.id} transactionAmount={txn.amount} />
        </section>

        {/* THE PAYMENT'S OWN DOCUMENT, which in practice means a Pleo receipt. An invoice matched
            to this payment is NOT shown here: it belongs to the invoice, it appears above as a
            match, and unlinking would otherwise strand its file on the payment. */}
        <TransactionDocumentCard txn={txn} />
      </div>
    </div>
  );
}

const KEINE_KATEGORIE = "__none";

/**
 * The transaction's own BWA category (migration 0069). It decides how a movement that will never
 * have a receipt is booked in the Kostenanalyse, and it used to be visible on exactly one screen:
 * the Kategorie cell on Offene Posten's open list. A transaction that is already hidden as "kein
 * Beleg" has left that list, so its category became unreachable at the moment it was the only
 * thing carrying that spend into the P&L. Editable here, for debits, where a person actually lands
 * after clicking a row -- and unlike the Offene-Posten cell, this one says whether the write
 * worked.
 */
/**
 * An invoice uploaded from this transaction that has not been linked yet.
 *
 * The upload is instant, the reading of it is not: the book-keeping cron fills in supplier and
 * amount up to two hours later, and only then can the link be made (migration 20260911190000).
 * Without this the transaction looks untouched for that whole window and the next person uploads
 * the same document again.
 *
 * Renders nothing once the link exists, because the matching panel below says it better.
 */
/**
 * The document belonging to the payment itself.
 *
 * Hidden entirely where one was never expected: a bank transfer has no receipt of its own, so an
 * empty panel on all 826 of them is furniture that teaches people to ignore the card. A Pleo row
 * keeps it even when empty, because there a missing receipt is the thing worth chasing.
 */
function TransactionDocumentCard({ txn }: { txn: BankTransaction }) {
  const { t } = useTranslation();
  const docsQ = useTransactionDocuments(txn.id);
  const hatBeleg = (docsQ.data ?? []).length > 0;
  const belegErwartet = txn.source === "pleo";
  if (!hatBeleg && !belegErwartet) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
          {t("bank.detail.section.belege")}
        </h2>
      </div>
      <TransactionDocuments transactionId={txn.id} />
    </section>
  );
}

function PendingUploads({ transactionId }: { transactionId: string }) {
  const { t } = useTranslation();
  const uploadsQ = useTransactionUploads(transactionId);
  const uploads = uploadsQ.data ?? [];
  if (uploads.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {uploads.map((u) => (
        <div
          key={u.id}
          // Amber, the same notice colour the rest of the Hub uses (objekt-detail, app-shell).
          // This is information and it has to be seen: the document is here but not in the system
          // yet, and somebody who misses that uploads it a second time.
          className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-base text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {/* A still icon, not a spinner. Nothing is happening on this page: the document is in a
              queue that a cron drains up to two hours later, and an animation that runs for two
              hours reads as a request that has hung. */}
          {u.extracted ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {u.extracted
                ? t("bank.detail.belege.uploadGelesen")
                : t("bank.detail.belege.uploadLaeuft")}
            </p>
            <p className="mt-0.5 text-sm">
              {u.extracted
                ? t("bank.detail.belege.uploadGelesenHint")
                : t("bank.detail.belege.uploadLaeuftHint")}
            </p>
            <p className="mt-1 truncate text-xs opacity-70">
              {u.filename ?? t("bank.detail.belege.datei")}
              {" · "}
              {formatDateTime(u.createdAt)}
            </p>
          </div>
          {/* Inherits the amber, otherwise a grey ghost button sits oddly inside a coloured card. */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <Link to="/eingangsrechnungen/$nr" params={{ nr: u.id }}>
              {t("bank.detail.belege.uploadOeffnen")}
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

function KategorieZeile({ txn }: { txn: BankTransaction }) {
  const { t } = useTranslation();
  const categoriesQ = useBwaCategories();
  const optionen = useCategoryOptions(categoriesQ.data ?? []);
  const setCategory = useSetTransactionCategory();
  const istGutschrift = txn.amount >= 0;
  const kategorie = (categoriesQ.data ?? []).find((c) => c.id === txn.category_id) ?? null;

  // A credit pays one of OUR invoices; it is booked from that invoice, never categorised here.
  if (istGutschrift) {
    return (
      <Row
        label={t("bank.detail.row.kategorie")}
        value={kategorie ? kategorie.name : t("bank.detail.kategorieGutschrift")}
      />
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{t("bank.detail.row.kategorie")}</span>
        {txn.category_source === "rule" && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("bank.detail.kategorieRegel")}
          </span>
        )}
      </div>
      <Combobox
        value={txn.category_id ?? KEINE_KATEGORIE}
        onValueChange={(v) =>
          setCategory.mutate(
            { transactionId: txn.id, categoryId: v === KEINE_KATEGORIE ? null : v },
            {
              onSuccess: () => toast.success(t("bank.detail.kategorieGespeichert")),
              onError: (e) =>
                toast.error(t("bank.detail.kategorieFehlgeschlagen", { error: fehlerText(e) })),
            },
          )
        }
        options={[{ value: KEINE_KATEGORIE, label: t("bank.detail.kategorieOhne") }, ...optionen]}
        className="w-full"
      />
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  sub,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** A quieter second line under the value, for a qualifier the main value cannot carry. */
  sub?: string;
}) {
  return (
    <div className="mt-2 flex items-start justify-between gap-3 first:mt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">
        <span className={cn("block text-foreground", mono && "font-mono")}>{value}</span>
        {sub && <span className="block truncate text-sm text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}
