import { useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { usePaymentRight } from "@/lib/payment-right";
import { useFetchNextSentinel } from "@/lib/use-fetch-next-sentinel";
import {
  useLinkInvoiceTransaction,
  useLinkOutgoingInvoiceTransaction,
  useOpenBankTransactionsInfinite,
  useOpenBelegeInfinite,
  useOpenOutgoingInvoicesInfinite,
} from "@/data";
import { fehlerText, formatDate, formatEUR, formatSignedEUR } from "@/lib/data/format";
import { SEARCH_PAGE_SIZE } from "@/components/bank/match-panel/constants";
import {
  LinkConfirmDialog,
  type LinkConfirmPair,
} from "@/components/bank/match-panel/link-confirm-dialog";
import type { MatchPanelTarget } from "@/components/bank/match-panel/match-panel";

// Mirrors _shared/matching.ts's own DATE_WINDOW_DAYS, and the same window use-possible-matches
// scores against.
const DATE_WINDOW_DAYS = 60;

function windowBounds(anchor: string | null): { von?: string; bis?: string } {
  if (!anchor) return {};
  const center = new Date(`${anchor}T00:00:00`);
  const von = new Date(center);
  von.setDate(von.getDate() - DATE_WINDOW_DAYS);
  const bis = new Date(center);
  bis.setDate(bis.getDate() + DATE_WINDOW_DAYS);
  return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
}

/**
 * The fallback path when the panel's precomputed candidates (InvoiceMatches / TransactionMatches)
 * don't include the right one -- covers the near-miss cases the bank-sync matcher's exact-amount
 * requirement misses. Dispatches to the transaction- or invoice-side list depending on what the
 * panel is open for.
 */
export function ManualSearch({
  target,
  search,
  onSearchChange,
  debouncedSearch,
  onLinked,
}: {
  target: MatchPanelTarget;
  search: string;
  onSearchChange: (v: string) => void;
  debouncedSearch: string;
  onLinked: () => void;
}) {
  if (target.kind === "invoice") {
    // Direction mirrors the retired ManualLinkTab's own convention: an incoming invoice is
    // settled by an outgoing (ausgehend) bank movement, an outgoing invoice by an incoming
    // (eingehend) one.
    const richtung = target.type === "outgoing" ? "eingehend" : "ausgehend";
    const { von, bis } = windowBounds(target.dueDate ?? target.documentDate);
    return (
      <TransactionSearchList
        richtung={richtung}
        von={von}
        bis={bis}
        search={search}
        onSearchChange={onSearchChange}
        debouncedSearch={debouncedSearch}
        invoiceId={target.id}
        invoiceType={target.type}
        invoiceLabel={target.label}
        invoiceNr={target.nr}
        invoiceGross={target.amount}
        onLinked={onLinked}
      />
    );
  }

  // Same convention TransactionMatches already uses (isCredit = amount >= 0): a credit is settled
  // by an outgoing invoice, a debit by an incoming one.
  const invoiceType = target.txn.amount >= 0 ? "outgoing" : "incoming";
  const { von, bis } = windowBounds(target.txn.booking_date);
  return (
    <InvoiceSearchList
      invoiceType={invoiceType}
      von={von}
      bis={bis}
      search={search}
      onSearchChange={onSearchChange}
      debouncedSearch={debouncedSearch}
      transactionId={target.txn.id}
      transactionLabel={target.txn.counterparty_holder ?? "—"}
      transactionAmount={target.txn.amount}
      transactionDate={target.txn.booking_date}
      onLinked={onLinked}
    />
  );
}

function TransactionSearchList({
  richtung,
  von,
  bis,
  search,
  onSearchChange,
  debouncedSearch,
  invoiceId,
  invoiceType,
  invoiceLabel,
  invoiceNr,
  invoiceGross,
  onLinked,
}: {
  richtung: "eingehend" | "ausgehend";
  von?: string;
  bis?: string;
  search: string;
  onSearchChange: (v: string) => void;
  debouncedSearch: string;
  invoiceId: string;
  invoiceType: "incoming" | "outgoing";
  invoiceLabel: string;
  invoiceNr: string | null;
  invoiceGross: number | null;
  onLinked: () => void;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: keinZahlrecht } = usePaymentRight();
  const [confirmParam, setConfirmParam] = useState<string | undefined>(undefined);
  const hasQuery = debouncedSearch.trim().length > 0;
  // Two modes on one list. With no query it BROWSES: open payments in the settling direction,
  // narrowed to the same +/-60 day window the matcher itself scores in, so the default view is a
  // plausible shortlist rather than every open payment in the database. Typing drops the window
  // and searches the whole open set, because a payment outside the window is exactly the case
  // manual search exists to reach.
  const q = useOpenBankTransactionsInfinite({
    search: debouncedSearch,
    matchingStatus: "open",
    richtung,
    bookingDateVon: hasQuery ? undefined : von,
    bookingDateBis: hasQuery ? undefined : bis,
    sort: "booking_date",
    dir: "desc",
    pageSize: SEARCH_PAGE_SIZE,
  });
  const linkIncoming = useLinkInvoiceTransaction();
  const linkOutgoing = useLinkOutgoingInvoiceTransaction();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const linking = linkIncoming.isPending || linkOutgoing.isPending;
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.rows) ?? [], [q.data]);
  const pair = useMemo((): LinkConfirmPair | null => {
    const hit = confirmParam ? rows.find((r) => r.id === confirmParam) : undefined;
    if (!hit) return null;
    return {
      side: invoiceType,
      invoiceId,
      invoiceLabel,
      invoiceNr,
      invoiceGross,
      transactionId: hit.id,
      transactionLabel: hit.counterparty_holder ?? "—",
      transactionAmount: hit.amount,
      transactionDate: hit.booking_date,
    };
  }, [confirmParam, rows, invoiceType, invoiceId, invoiceLabel, invoiceNr, invoiceGross]);
  const sentinelRef = useFetchNextSentinel(q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage);

  function link(
    transactionId: string,
    options?: { differenceReason?: string; closeInvoice?: boolean; closeTransaction?: boolean },
  ) {
    setPendingId(transactionId);
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
    if (invoiceType === "outgoing") {
      linkOutgoing.mutate({ outgoingInvoiceId: invoiceId, transactionId }, onSettled);
    } else {
      linkIncoming.mutate(
        {
          belegId: invoiceId,
          transactionId,
          differenceReason: options?.differenceReason,
          closeInvoice: options?.closeInvoice,
          closeTransaction: options?.closeTransaction,
        },
        onSettled,
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t("matchPanel.searchPlaceholderTransactions")}
        aria-label={t("matchPanel.searchPlaceholderTransactions")}
        className="h-9 rounded-none border-0 border-b border-border bg-transparent shadow-none focus-visible:ring-0"
      />
      {q.isLoading ? (
        <Skeleton className="m-2.5 h-16" />
      ) : rows.length === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t("matchPanel.searchEmptyTransactions")}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((txn) => (
            <li key={txn.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">
                  {txn.counterparty_holder ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(txn.booking_date)} · {formatSignedEUR(txn.amount)}
                </div>
              </div>
              <Button
                size="sm"
                variant="link"
                className="h-auto shrink-0 gap-1 px-0 py-0 font-medium"
                disabled={linking || !mayPay}
                title={keinZahlrecht}
                onClick={() => setConfirmParam(txn.id)}
              >
                {pendingId === txn.id ? t("matchPanel.linking") : t("matchPanel.link")}
                {pendingId === txn.id ? <Loader2 className="animate-spin" /> : <ChevronRight />}
              </Button>
            </li>
          ))}
          {q.hasNextPage && (
            <li ref={sentinelRef} className="flex justify-center py-2">
              {q.isFetchingNextPage && (
                <span className="text-xs text-muted-foreground">{t("matchPanel.loadMore")}</span>
              )}
            </li>
          )}
        </ul>
      )}
      <LinkConfirmDialog
        pair={pair}
        pending={linking}
        onCancel={() => setConfirmParam(undefined)}
        onConfirm={(confirmed, options) => link(confirmed.transactionId, options)}
      />
    </div>
  );
}

function InvoiceSearchList({
  invoiceType,
  von,
  bis,
  search,
  onSearchChange,
  debouncedSearch,
  transactionId,
  transactionLabel,
  transactionAmount,
  transactionDate,
  onLinked,
}: {
  invoiceType: "incoming" | "outgoing";
  von?: string;
  bis?: string;
  search: string;
  onSearchChange: (v: string) => void;
  debouncedSearch: string;
  transactionId: string;
  transactionLabel: string;
  transactionAmount: number | null;
  transactionDate: string | null;
  onLinked: () => void;
}) {
  const { t } = useTranslation();
  const { mayPay, reason: keinZahlrecht } = usePaymentRight();
  const [confirmParam, setConfirmParam] = useState<string | undefined>(undefined);
  const hasQuery = debouncedSearch.trim().length > 0;
  // Both hooks are always called (rules of hooks); `enabled` keeps only the relevant one live.
  // Same browse/search split as TransactionSearchList above -- see its comment.
  const incomingQ = useOpenBelegeInfinite(
    {
      q: debouncedSearch,
      von: hasQuery ? undefined : von,
      bis: hasQuery ? undefined : bis,
      sort: "eingegangen_am",
      dir: "desc",
      pageSize: SEARCH_PAGE_SIZE,
    },
    { enabled: invoiceType === "incoming" },
  );
  const outgoingQ = useOpenOutgoingInvoicesInfinite(
    {
      q: debouncedSearch,
      von: hasQuery ? undefined : von,
      bis: hasQuery ? undefined : bis,
      sort: "created_at",
      dir: "desc",
      pageSize: SEARCH_PAGE_SIZE,
    },
    { enabled: invoiceType === "outgoing" },
  );
  const linkIncoming = useLinkInvoiceTransaction();
  const linkOutgoing = useLinkOutgoingInvoiceTransaction();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const linking = linkIncoming.isPending || linkOutgoing.isPending;
  const isOutgoing = invoiceType === "outgoing";
  const activeQ = isOutgoing ? outgoingQ : incomingQ;
  const sentinelRef = useFetchNextSentinel(
    activeQ.hasNextPage,
    activeQ.isFetchingNextPage,
    activeQ.fetchNextPage,
  );

  function link(invoiceId: string) {
    setPendingId(invoiceId);
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
    if (isOutgoing) {
      linkOutgoing.mutate({ outgoingInvoiceId: invoiceId, transactionId }, onSettled);
    } else {
      linkIncoming.mutate({ belegId: invoiceId, transactionId }, onSettled);
    }
  }

  const outgoingRows = useMemo(
    () => outgoingQ.data?.pages.flatMap((p) => p.rows) ?? [],
    [outgoingQ.data],
  );
  const incomingRows = useMemo(
    () => incomingQ.data?.pages.flatMap((p) => p.rows) ?? [],
    [incomingQ.data],
  );
  const pair = useMemo((): LinkConfirmPair | null => {
    if (!confirmParam) return null;
    const oi = outgoingRows.find((r) => r.id === confirmParam);
    if (oi) {
      return {
        side: "outgoing",
        invoiceId: oi.id,
        invoiceLabel: oi.customers?.name ?? "—",
        invoiceNr: oi.invoice_number,
        invoiceGross: oi.amount_gross,
        transactionId,
        transactionLabel,
        transactionAmount,
        transactionDate,
      };
    }
    const b = incomingRows.find((r) => r.id === confirmParam);
    if (!b) return null;
    return {
      side: "incoming",
      invoiceId: b.id,
      invoiceLabel: b.issuer ?? "—",
      invoiceNr: b.invoice_number,
      invoiceGross: b.amount_gross,
      transactionId,
      transactionLabel,
      transactionAmount,
      transactionDate,
    };
  }, [
    confirmParam,
    outgoingRows,
    incomingRows,
    transactionId,
    transactionLabel,
    transactionAmount,
    transactionDate,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t(
          isOutgoing
            ? "matchPanel.searchPlaceholderOutgoing"
            : "matchPanel.searchPlaceholderIncoming",
        )}
        aria-label={t(
          isOutgoing
            ? "matchPanel.searchPlaceholderOutgoing"
            : "matchPanel.searchPlaceholderIncoming",
        )}
        className="h-9 rounded-none border-0 border-b border-border bg-transparent shadow-none focus-visible:ring-0"
      />
      {activeQ.isLoading ? (
        <Skeleton className="m-2.5 h-16" />
      ) : isOutgoing ? (
        outgoingRows.length === 0 ? (
          <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {t("matchPanel.searchEmptyOutgoing")}
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {outgoingRows.map((oi) => (
              <li key={oi.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {oi.customers?.name ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {oi.invoice_number ?? "—"} · {formatEUR(oi.amount_gross)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="link"
                  className="h-auto shrink-0 gap-1 px-0 py-0 font-medium"
                  disabled={linking || !mayPay}
                  title={keinZahlrecht}
                  onClick={() => setConfirmParam(oi.id)}
                >
                  {pendingId === oi.id ? t("matchPanel.linking") : t("matchPanel.link")}
                  {pendingId === oi.id ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                </Button>
              </li>
            ))}
            {activeQ.hasNextPage && (
              <li ref={sentinelRef} className="flex justify-center py-2">
                {activeQ.isFetchingNextPage && (
                  <span className="text-xs text-muted-foreground">{t("matchPanel.loadMore")}</span>
                )}
              </li>
            )}
          </ul>
        )
      ) : incomingRows.length === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t("matchPanel.searchEmptyIncoming")}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {incomingRows.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{b.issuer ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {b.invoice_number ?? "—"} · {formatEUR(b.amount_gross)}
                </div>
              </div>
              <Button
                size="sm"
                variant="link"
                className="h-auto shrink-0 gap-1 px-0 py-0 font-medium"
                disabled={linking || !mayPay}
                title={keinZahlrecht}
                onClick={() => setConfirmParam(b.id)}
              >
                {pendingId === b.id ? t("matchPanel.linking") : t("matchPanel.link")}
                {pendingId === b.id ? <Loader2 className="animate-spin" /> : <ChevronRight />}
              </Button>
            </li>
          ))}
          {activeQ.hasNextPage && (
            <li ref={sentinelRef} className="flex justify-center py-2">
              {activeQ.isFetchingNextPage && (
                <span className="text-xs text-muted-foreground">{t("matchPanel.loadMore")}</span>
              )}
            </li>
          )}
        </ul>
      )}
      <LinkConfirmDialog
        pair={pair}
        pending={linking}
        onCancel={() => setConfirmParam(undefined)}
        onConfirm={(confirmed) => link(confirmed.invoiceId)}
      />
    </div>
  );
}
