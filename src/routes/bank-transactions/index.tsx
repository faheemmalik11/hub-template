import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

import {
  FilterPills,
  HintTooltip,
  FilterPopover,
  SearchInput,
  SortableColumnHeader,
  StackedCell,
} from "@/kit/components/data-table";
import type { FilterField } from "@/kit/components/data-table";
import { Button } from "@/components/ui/button";
import {
  usePeriodOptions,
  PERIOD_CUSTOM,
  periodArea,
} from "@/components/data-table/period-options";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useBankAccounts, useBankTransactionsPage, useCompanies, useBankConnections } from "@/data";
import type { BankTransaction } from "@/lib/data/types";
import type { BankTransactionSort } from "@/data";
import { TablePagination } from "@/components/data-table/table-pagination";
import { dateLocale, uniqueAccountLabels, formatDate, formatSignedEUR } from "@/lib/data/format";
import { TRANSACTION_TYPES } from "@/lib/data/types";
import { SourceBadge, TransactionTypeBadge, TxnMatchingBadge } from "@/components/bank/badges";
import { AccountSwitcher } from "@/components/bank/konto-switcher";
import { TriggerSyncButton } from "@/components/bank/trigger-sync-button";
import { ManualImportDialog } from "@/components/bank/manual-import-dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/bank-transactions/")({
  head: () => ({ meta: [{ title: pageTitle("Banktransaktionen") }] }),
  // The whole list state lives in the URL: a filtered view can be shared and bookmarked, it
  // survives the trip to a transaction and back, and ?matching=ignoriert still deep-links from
  // Offene Posten's "N ausgeblendet" link. Unknown values are dropped rather than passed into a
  // query (see MATCHING_FILTER below).
  validateSearch: (search: Record<string, unknown>): ListenSearch => {
    const text = (k: string) =>
      typeof search[k] === "string" && search[k] ? String(search[k]) : undefined;
    const intParam = (k: string) => {
      const n = Number(search[k]);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    };
    const sort = text("sort");
    const dir = text("dir");
    return {
      q: text("q"),
      matching: text("matching"),
      direction: text("richtung"),
      account: text("konto"),
      type: text("typ"),
      source: text("quelle"),
      doc: text("beleg"),
      period: text("zeitraum"),
      fromDate: text("von"),
      toDate: text("bis"),
      sort: sort === "amount" || sort === "counterparty_holder" ? sort : undefined,
      dir: dir === "asc" ? "asc" : undefined,
      page: intParam("seite"),
      pro: intParam("pro"),
    };
  },
  component: BankTransactionsPage,
});

const ALL = "__alle";

interface ListenSearch {
  q?: string;
  matching?: string;
  direction?: string;
  account?: string;
  type?: string;
  source?: string;
  doc?: string;
  period?: string;
  fromDate?: string;
  toDate?: string;
  sort?: BankTransactionSort;
  dir?: "asc";
  page?: number;
  pro?: number;
}

// booking_date descending is the default, so it is the one combination the URL leaves out.
const STANDARD_SORT: BankTransactionSort = "booking_date";

// The only values the Abgleich filter offers. A stale or hand-edited ?matching= used to be passed
// straight into .eq("matching_status", …), which matched nothing and then let the empty state
// blame the import; anything unknown now simply means "no filter".
const MATCHING_FILTER = ["open", "suggestion", "matched", "ignored"];

function BankTransactionsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Read once, as the seed for this screen's state. From then on the state drives the URL (the
  // effect below), never the other way round, so typing stays local and cannot fight a re-render.
  const start = Route.useSearch();
  const [search, setSearch] = useState(start.q ?? "");
  const [suchTerm, setSuchTerm] = useState(start.q ?? "");
  useEffect(() => {
    const timer = window.setTimeout(() => setSuchTerm(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const matching = start.matching;
  const [fStatus, setFStatus] = useState(
    matching && MATCHING_FILTER.includes(matching) ? matching : ALL,
  );
  const [fDirection, setFDirection] = useState(start.direction ?? ALL);
  const [fAccount, setFAccount] = useState(start.account ?? ALL);
  const [fType, setFType] = useState(start.type ?? ALL);
  const [fSource, setFSource] = useState(start.source ?? ALL);
  const [fDocument, setFDocument] = useState(start.doc ?? ALL);
  const [datumFromDate, setDatumFromDate] = useState(start.fromDate ?? "");
  const [datumToDate, setDatumToDate] = useState(start.toDate ?? "");
  // The chosen preset, kept beside the dates it resolves to. Without it a shared link restores the
  // right dates but always labels them "custom range", because concrete dates cannot say which
  // preset produced them.
  const [period, setPeriod] = useState(
    start.period ?? (start.fromDate || start.toDate ? PERIOD_CUSTOM : ALL),
  );
  // ALLE is this screen's own "no filter" sentinel, shared with its account/direction/type
  // filters, so the period keeps it rather than adopting the shared vocabulary's own spelling.
  const periodOptions = usePeriodOptions(ALL);
  const [sortColumn, setSortColumn] = useState<BankTransactionSort>(start.sort ?? STANDARD_SORT);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(start.dir === "asc" ? "asc" : "desc");

  const [page, setPage] = useState(start.page ?? 1);
  const [pageSize, setPageSize] = useState(start.pro ?? 25);
  // Any change to the search or the filters shrinks/reshuffles the result set, so page 3 of the old
  // result is meaningless — go back to the first page instead of showing an empty table.
  const firstPage = useRef(true);
  useEffect(() => {
    // Not on the first render: that would throw away a ?seite= somebody shared or came back to.
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    setPage(1);
  }, [
    suchTerm,
    fStatus,
    fDirection,
    fAccount,
    fType,
    fSource,
    fDocument,
    datumFromDate,
    datumToDate,
    pageSize,
  ]);

  // State -> URL. `replace` so the history stays one entry per screen rather than one per
  // keystroke; the point is that the address bar always describes what is on screen, so the view
  // can be shared, bookmarked, and restored when you come back from a transaction.
  useEffect(() => {
    navigate({
      to: "/bank-transactions",
      replace: true,
      search: {
        q: suchTerm || undefined,
        matching: fStatus === ALL ? undefined : fStatus,
        direction: fDirection === ALL ? undefined : fDirection,
        account: fAccount === ALL ? undefined : fAccount,
        type: fType === ALL ? undefined : fType,
        source: fSource === ALL ? undefined : fSource,
        doc: fDocument === ALL ? undefined : fDocument,
        period: period === ALL ? undefined : period,
        fromDate: datumFromDate || undefined,
        toDate: datumToDate || undefined,
        sort: sortColumn === STANDARD_SORT ? undefined : sortColumn,
        dir: sortDir === "asc" ? "asc" : undefined,
        page: page > 1 ? page : undefined,
        pro: pageSize !== 25 ? pageSize : undefined,
      },
    });
  }, [
    navigate,
    suchTerm,
    fStatus,
    fDirection,
    fAccount,
    fType,
    fSource,
    fDocument,
    period,
    datumFromDate,
    datumToDate,
    sortColumn,
    sortDir,
    page,
    pageSize,
  ]);

  // "Nothing matched your filters" is a different state from "no bank movements exist at all",
  // and the second message tells the reader to connect a bank and start a sync -- advice that is
  // wrong, and that somebody will act on, when the truth is that a search term excluded every row.
  const filterActive =
    suchTerm !== "" ||
    fStatus !== ALL ||
    fDirection !== ALL ||
    fAccount !== ALL ||
    fType !== ALL ||
    fSource !== ALL ||
    fDocument !== ALL ||
    datumFromDate !== "" ||
    datumToDate !== "";

  function filterReset() {
    setSearch("");
    setSuchTerm("");
    setFStatus(ALL);
    setFDirection(ALL);
    setFAccount(ALL);
    setFType(ALL);
    setFSource(ALL);
    setPeriod(ALL);
    setDatumFromDate("");
    setDatumToDate("");
    setPage(1);
    // The URL follows the state (see the effect above), so clearing the state clears the deep link
    // with it and a reload cannot put the old filter back.
  }

  const accountsQ = useBankAccounts();
  const companiesQ = useCompanies();
  const txnQ = useBankTransactionsPage({
    search: suchTerm,
    matchingStatus: fStatus === ALL ? undefined : fStatus,
    direction: fDirection === ALL ? undefined : fDirection,
    accountId: fAccount === ALL ? undefined : fAccount,
    transactionType: fType === ALL ? undefined : fType,
    source: fSource === ALL ? undefined : fSource,
    doc: fDocument === ALL ? undefined : fDocument,
    bookingDateFromDate: datumFromDate || undefined,
    bookingDateToDate: datumToDate || undefined,
    sort: sortColumn,
    dir: sortDir,
    page,
    pageSize,
  });
  const connectionsQ = useBankConnections();

  // Clicking a column sorts by it, descending first (the biggest amount, the newest date, which is
  // what somebody is looking for), and a second click flips it.
  function sort(column: BankTransactionSort) {
    if (column === sortColumn) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortColumn(column);
      setSortDir("desc");
    }
    setPage(1);
  }

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const txns = txnQ.data?.rows ?? [];
  const total = txnQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromDate = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toDate = Math.min(page * pageSize, total);
  // BANKSapi names every account after its product category, so "Sichteinlagen" can be five
  // different accounts of four different companies. kontoLabel adds what tells them apart.
  const companyCode = useMemo(
    () => new Map((companiesQ.data ?? []).map((g) => [g.id, g.code])),
    [companiesQ.data],
  );
  const accountName = useMemo(
    () => uniqueAccountLabels(accounts, (id) => (id ? (companyCode.get(id) ?? null) : null)),
    [accounts, companyCode],
  );

  const accountIban = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.iban ?? null])),
    [accounts],
  );

  const accountTitle = useMemo(
    () =>
      new Map(
        accounts.map((a) => {
          const name = a.account_name?.trim() || null;
          const code = a.company_id ? (companyCode.get(a.company_id) ?? null) : null;
          const iban = a.iban?.replace(/\s+/g, "") || null;
          const base = name ?? (iban ? `…${iban.slice(-4)}` : "—");
          return [a.id, code ? `${base} · ${code}` : base];
        }),
      ),
    [accounts, companyCode],
  );

  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "richtung",
      label: t("bank.list.filter.richtung"),
      value: fDirection,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("bank.list.filter.alleRichtungen") },
        { value: "ausgehend", label: t("bank.richtung.ausgehend") },
        { value: "eingehend", label: t("bank.richtung.eingehend") },
      ],
      onChange: setFDirection,
    },
    {
      kind: "select",
      key: "typ",
      label: t("bank.list.filter.typ"),
      value: fType,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("bank.list.filter.alleTypen") },
        ...TRANSACTION_TYPES.map((type) => ({
          value: type,
          label: t(`bank.transactionType.${type}`),
        })),
      ],
      onChange: setFType,
    },
    {
      kind: "select",
      key: "quelle",
      label: t("bank.list.filter.quelle"),
      value: fSource,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("bank.list.filter.alleQuellen") },
        { value: "banksapi", label: t("bank.quelle.banksapi") },
        { value: "pleo", label: t("bank.quelle.pleo") },
        { value: "manual", label: t("bank.quelle.manual") },
      ],
      onChange: setFSource,
    },
    {
      kind: "select",
      key: "beleg",
      label: t("bank.list.filter.beleg"),
      value: fDocument,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("bank.list.filter.alleBelege") },
        { value: "mit", label: t("bank.list.filter.mitBeleg") },
        { value: "ohne", label: t("bank.list.filter.ohneBeleg") },
      ],
      onChange: setFDocument,
    },
    {
      kind: "select",
      key: "abgleich",
      label: t("bank.list.filter.abgleich"),
      value: fStatus,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("bank.list.filter.alle") },
        { value: "open", label: t("bank.txnMatching.offen") },
        { value: "suggestion", label: t("bank.txnMatching.vorschlag") },
        { value: "matched", label: t("bank.txnMatching.zugeordnet") },
        { value: "ignored", label: t("bank.txnMatching.ignoriert") },
      ],
      onChange: setFStatus,
    },
    {
      kind: "dateRange",
      key: "zeitraum",
      label: t("documents.list.filter.zeitraum"),
      value: period,
      defaultValue: ALL,
      onChange: (v) => {
        setPeriod(v);
        // A preset resolves to concrete dates immediately, which is what the query filters on.
        // Picking the custom option only opens the calendar — the range it produces arrives via
        // onRangeApply below.
        if (v === PERIOD_CUSTOM) return;
        const area = periodArea(v, datumFromDate, datumToDate);
        setDatumFromDate(area.fromDate ?? "");
        setDatumToDate(area.toDate ?? "");
      },
      options: periodOptions,
      customValue: PERIOD_CUSTOM,
      from: datumFromDate,
      to: datumToDate,
      onRangeApply: (fromDateNew, toDateNew) => {
        setPeriod(PERIOD_CUSTOM);
        setDatumFromDate(fromDateNew);
        setDatumToDate(toDateNew);
      },
      locale: dateLocale(),
      formatDay: (iso) => formatDate(iso),
      backLabel: t("home.zeitraumAktion.zurueck"),
      placeholder: t("documents.list.filter.zeitraum"),
      searchPlaceholder: t("common.combobox.search"),
      emptyLabel: t("common.combobox.empty"),
      rangeLabels: {
        reset: t("documents.list.filter.zeitraumZuruecksetzen"),
        apply: t("documents.list.filter.zeitraumAnwenden"),
        previousMonth: t("documents.list.filter.monatZurueck"),
        nextMonth: t("documents.list.filter.monatVor"),
        pickSecond: t("documents.list.filter.zweitesDatum"),
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("bank.list.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("bank.list.subtitle")}</p>
        </div>
        {/* w-full on mobile: three buttons with non-wrapping text (whitespace-nowrap is baked
            into the Button component) in a non-wrapping row ran off the right edge of a phone
            screen instead of shrinking. flex-wrap lets them stack once they no longer all fit
            on one line. */}
        <div
          data-tour="bank-txn-actions"
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
        >
          <Button variant="outline" asChild className="gap-2">
            <Link to="/bank-accounts">
              <Settings2 className="size-4" /> {t("bank.list.bankkonten")}
            </Link>
          </Button>
          {/* The same confirmed button as on Bankkonten. It used to be a bare click here and a
              confirmed one there, for an action that in live mode calls the bank. */}
          <TriggerSyncButton
            connections={connectionsQ.data ?? []}
            variant="default"
            size="default"
          />
          <ManualImportDialog />
        </div>
      </div>

      {/* The account first, the filters under it. Which account you are working is not one
          question among six -- it is the one you answer before the screen means anything. */}
      <AccountSwitcher
        accounts={accounts}
        value={fAccount}
        onChange={setFAccount}
        allValue={ALL}
        allLabel={t("bank.list.filter.alleKonten")}
        labelFor={(id) => accountName.get(id) ?? id}
        titleFor={(id) => accountTitle.get(id) ?? ""}
        className="mt-6"
      />

      <div data-tour="bank-txn-filters" className="mt-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t("bank.list.search")}
          className="min-w-[240px] flex-1 max-w-none"
        />
        <FilterPopover
          fields={filterFields}
          labels={{
            button: t("bank.list.filter.button"),
            title: t("bank.list.filter.title"),
            reset: t("bank.list.filter.reset"),
          }}
        />
      </div>

      <FilterPills
        fields={filterFields}
        extra={
          suchTerm
            ? [
                {
                  key: "suche",
                  label: t("bank.list.search"),
                  valueLabel: suchTerm,
                  clear: () => {
                    setSearch("");
                    setSuchTerm("");
                  },
                },
              ]
            : []
        }
        className="mt-3"
      />

      {txnQ.isError ? (
        <div className="mt-4">
          <ErrorState error={txnQ.error} onRetry={() => txnQ.refetch()} />
        </div>
      ) : txnQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={9} />
        </div>
      ) : txns.length === 0 ? (
        <div className="mt-4">
          {filterActive ? (
            <EmptyState
              title={t("bank.list.keineTreffer")}
              hint={t("bank.list.keineTrefferHint")}
              action={
                <Button variant="outline" onClick={filterReset}>
                  {t("bank.list.filterZuruecksetzen")}
                </Button>
              }
            />
          ) : (
            <EmptyState title={t("bank.list.emptyTitle")} hint={t("bank.list.emptyHint")} />
          )}
        </div>
      ) : (
        <div data-tour="bank-txn-list">
          <p className="mt-4 text-sm text-muted-foreground">
            {/* The total across all pages, not the size of the current page. */}
            {t("bank.list.count", { count: total })}
            {txnQ.isFetching && ` · ${t("bank.list.updating")}`}
          </p>
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <SortableColumnHeader
                    className="whitespace-nowrap"
                    column="booking_date"
                    sort={sortColumn}
                    direction={sortDir}
                    onSort={(column) => sort(column as BankTransactionSort)}
                  >
                    {t("bank.list.col.datum")}
                  </SortableColumnHeader>
                  <TableHead>{t("bank.list.col.konto")}</TableHead>
                  <SortableColumnHeader
                    column="counterparty_holder"
                    sort={sortColumn}
                    direction={sortDir}
                    onSort={(column) => sort(column as BankTransactionSort)}
                  >
                    {t("bank.list.col.gegenkonto")}
                  </SortableColumnHeader>
                  <TableHead>{t("bank.list.col.verwendungszweck")}</TableHead>
                  <TableHead>{t("bank.list.col.abgleich")}</TableHead>
                  <TableHead>{t("bank.list.col.typ")}</TableHead>
                  <SortableColumnHeader
                    column="amount"
                    sort={sortColumn}
                    direction={sortDir}
                    onSort={(column) => sort(column as BankTransactionSort)}
                    align="right"
                  >
                    {t("bank.list.col.betrag")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((txn) => (
                  <TableRow
                    key={txn.id}
                    className="cursor-pointer"
                    // The detail page has no other route in, so a mouse-only row made the whole
                    // screen keyboard-unreachable. Same role/tabIndex/Enter+Space shape as the
                    // Protokoll rows.
                    role="button"
                    tabIndex={0}
                    aria-label={t("bank.list.zeileOeffnen", {
                      contraAccount: txn.counterparty_holder ?? "—",
                      amount: formatSignedEUR(txn.amount),
                    })}
                    onClick={() =>
                      navigate({ to: "/bank-transactions/$id", params: { id: txn.id } })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate({ to: "/bank-transactions/$id", params: { id: txn.id } });
                      }
                    }}
                  >
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {formatDate(txn.booking_date)}
                    </TableCell>
                    {/* WHERE THE MONEY SAT, AND WHOSE HAND IT WAS IN. Three facts in one column
                        because they are one fact: the chip says which rail the row came down (Bank
                        or Pleo), the paperclip on it says the row brought its own receipt, and the
                        name says whose account it is. Every Pleo row runs through a single account
                        literally called "Pleo", so naming the employee is the only way this column
                        identifies anything; a bank row has no spender and keeps its account name
                        and IBAN.

                        The chip LEADS the name. It sat after it briefly, which put it against the
                        next column and made it read as the counterparty's; in front, every row
                        opens with the same shape and the eye can sort Bank from Pleo without
                        reading a word. */}
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex w-fit items-center gap-2">
                        <SourceBadge
                          source={txn.source}
                          hasDocument={txn.has_document}
                          documentTitle={t("bank.list.beleg.titel", {
                            source: txn.document_source
                              ? t(`bank.quelle.${txn.document_source}`, {
                                  defaultValue: txn.document_source,
                                })
                              : t("bank.list.beleg.vorhanden"),
                          })}
                          className="shrink-0"
                        />
                        <StackedCell
                          primary={
                            txn.spender_name ??
                            txn.spender_email ??
                            accountTitle.get(txn.account_id) ??
                            "—"
                          }
                          secondary={
                            txn.spender_name
                              ? txn.spender_email
                              : txn.spender_email
                                ? null
                                : accountIban.get(txn.account_id)
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <StackedCell
                        primary={txn.counterparty_holder ?? "—"}
                        secondary={txn.counterparty_iban}
                        primaryClassName="text-sm font-medium"
                      />
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                      <HintTooltip label={txn.payment_reference}>
                        <div className="truncate">{txn.payment_reference ?? "—"}</div>
                      </HintTooltip>
                    </TableCell>
                    <TableCell>
                      <TxnMatchingBadge
                        status={txn.matching_status}
                        hasSuggested={txn.has_suggested_match}
                      />
                    </TableCell>
                    <TableCell>
                      <TransactionTypeBadge type={txn.transaction_type} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        txn.amount < 0 ? "text-foreground" : "text-emerald-700",
                      )}
                    >
                      {formatSignedEUR(txn.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 space-y-3 sm:hidden">
            {txns.map((txn) => (
              <div
                key={txn.id}
                className="cursor-pointer rounded-xl border border-border bg-card p-4"
                role="button"
                tabIndex={0}
                aria-label={t("bank.list.zeileOeffnen", {
                  contraAccount: txn.counterparty_holder ?? "—",
                  amount: formatSignedEUR(txn.amount),
                })}
                onClick={() => navigate({ to: "/bank-transactions/$id", params: { id: txn.id } })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate({ to: "/bank-transactions/$id", params: { id: txn.id } });
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {txn.counterparty_holder ?? "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {txn.counterparty_iban ||
                        (txn.spender_name || txn.spender_email
                          ? t("bank.list.bezahltVonKurz", {
                              who: txn.spender_name ?? txn.spender_email,
                            })
                          : "")}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 text-right font-medium tabular-nums",
                      txn.amount < 0 ? "text-foreground" : "text-emerald-700",
                    )}
                  >
                    {formatSignedEUR(txn.amount)}
                  </div>
                </div>
                {txn.payment_reference && (
                  <p className="mt-2 truncate text-sm text-muted-foreground">
                    {txn.payment_reference}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <TransactionTypeBadge type={txn.transaction_type} />
                  <TxnMatchingBadge
                    status={txn.matching_status}
                    hasSuggested={txn.has_suggested_match}
                  />
                  <SourceBadge source={txn.source} hasDocument={txn.has_document} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                  <span className="truncate">{accountName.get(txn.account_id) ?? "—"}</span>
                  <span className="shrink-0 tabular-nums">{formatDate(txn.booking_date)}</span>
                </div>
              </div>
            ))}
          </div>

          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            from={fromDate}
            to={toDate}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A sortable column header. The whole list is sorted server-side, so the order holds across every
 * page rather than only within the 25 rows on screen.
 */
