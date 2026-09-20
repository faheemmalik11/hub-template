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
  useZeitraumOptionen,
  ZEITRAUM_INDIVIDUELL,
  zeitraumBereich,
} from "@/components/data-table/zeitraum-optionen";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useBankAccounts,
  useBankTransactionsPage,
  useGesellschaften,
  useBankConnections,
} from "@/data";
import type { BankTransaction } from "@/lib/data/types";
import type { BankTransactionSort } from "@/data";
import { TablePagination } from "@/components/data-table/table-pagination";
import { dateLocale, eindeutigeKontoLabels, formatDate, formatSignedEUR } from "@/lib/data/format";
import { TRANSACTION_TYPES } from "@/lib/data/types";
import { QuelleBadge, TransactionTypeBadge, TxnMatchingBadge } from "@/components/bank/badges";
import { KontoSwitcher } from "@/components/bank/konto-switcher";
import { TriggerSyncButton } from "@/components/bank/trigger-sync-button";
import { ManualImportDialog } from "@/components/bank/manual-import-dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/banktransaktionen/")({
  head: () => ({ meta: [{ title: pageTitle("Banktransaktionen") }] }),
  // The whole list state lives in the URL: a filtered view can be shared and bookmarked, it
  // survives the trip to a transaction and back, and ?matching=ignoriert still deep-links from
  // Offene Posten's "N ausgeblendet" link. Unknown values are dropped rather than passed into a
  // query (see MATCHING_FILTER below).
  validateSearch: (search: Record<string, unknown>): ListenSuche => {
    const text = (k: string) =>
      typeof search[k] === "string" && search[k] ? String(search[k]) : undefined;
    const zahl = (k: string) => {
      const n = Number(search[k]);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    };
    const sort = text("sort");
    const dir = text("dir");
    return {
      q: text("q"),
      matching: text("matching"),
      richtung: text("richtung"),
      konto: text("konto"),
      typ: text("typ"),
      quelle: text("quelle"),
      beleg: text("beleg"),
      zeitraum: text("zeitraum"),
      von: text("von"),
      bis: text("bis"),
      sort: sort === "amount" || sort === "counterparty_holder" ? sort : undefined,
      dir: dir === "asc" ? "asc" : undefined,
      seite: zahl("seite"),
      pro: zahl("pro"),
    };
  },
  component: BanktransaktionenPage,
});

const ALLE = "__alle";

interface ListenSuche {
  q?: string;
  matching?: string;
  richtung?: string;
  konto?: string;
  typ?: string;
  quelle?: string;
  beleg?: string;
  zeitraum?: string;
  von?: string;
  bis?: string;
  sort?: BankTransactionSort;
  dir?: "asc";
  seite?: number;
  pro?: number;
}

// booking_date descending is the default, so it is the one combination the URL leaves out.
const STANDARD_SORT: BankTransactionSort = "booking_date";

// The only values the Abgleich filter offers. A stale or hand-edited ?matching= used to be passed
// straight into .eq("matching_status", …), which matched nothing and then let the empty state
// blame the import; anything unknown now simply means "no filter".
const MATCHING_FILTER = ["open", "suggestion", "matched", "ignored"];

function BanktransaktionenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Read once, as the seed for this screen's state. From then on the state drives the URL (the
  // effect below), never the other way round, so typing stays local and cannot fight a re-render.
  const start = Route.useSearch();
  const [suche, setSuche] = useState(start.q ?? "");
  const [suchTerm, setSuchTerm] = useState(start.q ?? "");
  useEffect(() => {
    const timer = window.setTimeout(() => setSuchTerm(suche.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [suche]);

  const matching = start.matching;
  const [fStatus, setFStatus] = useState(
    matching && MATCHING_FILTER.includes(matching) ? matching : ALLE,
  );
  const [fRichtung, setFRichtung] = useState(start.richtung ?? ALLE);
  const [fKonto, setFKonto] = useState(start.konto ?? ALLE);
  const [fTyp, setFTyp] = useState(start.typ ?? ALLE);
  const [fQuelle, setFQuelle] = useState(start.quelle ?? ALLE);
  const [fBeleg, setFBeleg] = useState(start.beleg ?? ALLE);
  const [datumVon, setDatumVon] = useState(start.von ?? "");
  const [datumBis, setDatumBis] = useState(start.bis ?? "");
  // The chosen preset, kept beside the dates it resolves to. Without it a shared link restores the
  // right dates but always labels them "custom range", because concrete dates cannot say which
  // preset produced them.
  const [zeitraum, setZeitraum] = useState(
    start.zeitraum ?? (start.von || start.bis ? ZEITRAUM_INDIVIDUELL : ALLE),
  );
  // ALLE is this screen's own "no filter" sentinel, shared with its account/direction/type
  // filters, so the period keeps it rather than adopting the shared vocabulary's own spelling.
  const zeitraumOptionen = useZeitraumOptionen(ALLE);
  const [sortSpalte, setSortSpalte] = useState<BankTransactionSort>(start.sort ?? STANDARD_SORT);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(start.dir === "asc" ? "asc" : "desc");

  const [page, setPage] = useState(start.seite ?? 1);
  const [pageSize, setPageSize] = useState(start.pro ?? 25);
  // Any change to the search or the filters shrinks/reshuffles the result set, so page 3 of the old
  // result is meaningless — go back to the first page instead of showing an empty table.
  const ersteSeite = useRef(true);
  useEffect(() => {
    // Not on the first render: that would throw away a ?seite= somebody shared or came back to.
    if (ersteSeite.current) {
      ersteSeite.current = false;
      return;
    }
    setPage(1);
  }, [suchTerm, fStatus, fRichtung, fKonto, fTyp, fQuelle, fBeleg, datumVon, datumBis, pageSize]);

  // State -> URL. `replace` so the history stays one entry per screen rather than one per
  // keystroke; the point is that the address bar always describes what is on screen, so the view
  // can be shared, bookmarked, and restored when you come back from a transaction.
  useEffect(() => {
    navigate({
      to: "/banktransaktionen",
      replace: true,
      search: {
        q: suchTerm || undefined,
        matching: fStatus === ALLE ? undefined : fStatus,
        richtung: fRichtung === ALLE ? undefined : fRichtung,
        konto: fKonto === ALLE ? undefined : fKonto,
        typ: fTyp === ALLE ? undefined : fTyp,
        quelle: fQuelle === ALLE ? undefined : fQuelle,
        beleg: fBeleg === ALLE ? undefined : fBeleg,
        zeitraum: zeitraum === ALLE ? undefined : zeitraum,
        von: datumVon || undefined,
        bis: datumBis || undefined,
        sort: sortSpalte === STANDARD_SORT ? undefined : sortSpalte,
        dir: sortDir === "asc" ? "asc" : undefined,
        seite: page > 1 ? page : undefined,
        pro: pageSize !== 25 ? pageSize : undefined,
      },
    });
  }, [
    navigate,
    suchTerm,
    fStatus,
    fRichtung,
    fKonto,
    fTyp,
    fQuelle,
    fBeleg,
    zeitraum,
    datumVon,
    datumBis,
    sortSpalte,
    sortDir,
    page,
    pageSize,
  ]);

  // "Nothing matched your filters" is a different state from "no bank movements exist at all",
  // and the second message tells the reader to connect a bank and start a sync -- advice that is
  // wrong, and that somebody will act on, when the truth is that a search term excluded every row.
  const filterAktiv =
    suchTerm !== "" ||
    fStatus !== ALLE ||
    fRichtung !== ALLE ||
    fKonto !== ALLE ||
    fTyp !== ALLE ||
    fQuelle !== ALLE ||
    fBeleg !== ALLE ||
    datumVon !== "" ||
    datumBis !== "";

  function filterZuruecksetzen() {
    setSuche("");
    setSuchTerm("");
    setFStatus(ALLE);
    setFRichtung(ALLE);
    setFKonto(ALLE);
    setFTyp(ALLE);
    setFQuelle(ALLE);
    setZeitraum(ALLE);
    setDatumVon("");
    setDatumBis("");
    setPage(1);
    // The URL follows the state (see the effect above), so clearing the state clears the deep link
    // with it and a reload cannot put the old filter back.
  }

  const accountsQ = useBankAccounts();
  const gesellschaftenQ = useGesellschaften();
  const txnQ = useBankTransactionsPage({
    search: suchTerm,
    matchingStatus: fStatus === ALLE ? undefined : fStatus,
    richtung: fRichtung === ALLE ? undefined : fRichtung,
    accountId: fKonto === ALLE ? undefined : fKonto,
    transactionType: fTyp === ALLE ? undefined : fTyp,
    source: fQuelle === ALLE ? undefined : fQuelle,
    beleg: fBeleg === ALLE ? undefined : fBeleg,
    bookingDateVon: datumVon || undefined,
    bookingDateBis: datumBis || undefined,
    sort: sortSpalte,
    dir: sortDir,
    page,
    pageSize,
  });
  const connectionsQ = useBankConnections();

  // Clicking a column sorts by it, descending first (the biggest amount, the newest date, which is
  // what somebody is looking for), and a second click flips it.
  function sortieren(spalte: BankTransactionSort) {
    if (spalte === sortSpalte) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortSpalte(spalte);
      setSortDir("desc");
    }
    setPage(1);
  }

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const txns = txnQ.data?.rows ?? [];
  const total = txnQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const von = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const bis = Math.min(page * pageSize, total);
  // BANKSapi names every account after its product category, so "Sichteinlagen" can be five
  // different accounts of four different companies. kontoLabel adds what tells them apart.
  const gesellschaftCode = useMemo(
    () => new Map((gesellschaftenQ.data ?? []).map((g) => [g.id, g.code])),
    [gesellschaftenQ.data],
  );
  const accountName = useMemo(
    () => eindeutigeKontoLabels(accounts, (id) => (id ? (gesellschaftCode.get(id) ?? null) : null)),
    [accounts, gesellschaftCode],
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
          const code = a.company_id ? (gesellschaftCode.get(a.company_id) ?? null) : null;
          const iban = a.iban?.replace(/\s+/g, "") || null;
          const base = name ?? (iban ? `…${iban.slice(-4)}` : "—");
          return [a.id, code ? `${base} · ${code}` : base];
        }),
      ),
    [accounts, gesellschaftCode],
  );

  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "richtung",
      label: t("bank.list.filter.richtung"),
      value: fRichtung,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("bank.list.filter.alleRichtungen") },
        { value: "ausgehend", label: t("bank.richtung.ausgehend") },
        { value: "eingehend", label: t("bank.richtung.eingehend") },
      ],
      onChange: setFRichtung,
    },
    {
      kind: "select",
      key: "typ",
      label: t("bank.list.filter.typ"),
      value: fTyp,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("bank.list.filter.alleTypen") },
        ...TRANSACTION_TYPES.map((typ) => ({
          value: typ,
          label: t(`bank.transactionType.${typ}`),
        })),
      ],
      onChange: setFTyp,
    },
    {
      kind: "select",
      key: "quelle",
      label: t("bank.list.filter.quelle"),
      value: fQuelle,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("bank.list.filter.alleQuellen") },
        { value: "banksapi", label: t("bank.quelle.banksapi") },
        { value: "pleo", label: t("bank.quelle.pleo") },
        { value: "manual", label: t("bank.quelle.manual") },
      ],
      onChange: setFQuelle,
    },
    {
      kind: "select",
      key: "beleg",
      label: t("bank.list.filter.beleg"),
      value: fBeleg,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("bank.list.filter.alleBelege") },
        { value: "mit", label: t("bank.list.filter.mitBeleg") },
        { value: "ohne", label: t("bank.list.filter.ohneBeleg") },
      ],
      onChange: setFBeleg,
    },
    {
      kind: "select",
      key: "abgleich",
      label: t("bank.list.filter.abgleich"),
      value: fStatus,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("bank.list.filter.alle") },
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
      label: t("belege.list.filter.zeitraum"),
      value: zeitraum,
      defaultValue: ALLE,
      onChange: (v) => {
        setZeitraum(v);
        // A preset resolves to concrete dates immediately, which is what the query filters on.
        // Picking the custom option only opens the calendar — the range it produces arrives via
        // onRangeApply below.
        if (v === ZEITRAUM_INDIVIDUELL) return;
        const bereich = zeitraumBereich(v, datumVon, datumBis);
        setDatumVon(bereich.von ?? "");
        setDatumBis(bereich.bis ?? "");
      },
      options: zeitraumOptionen,
      customValue: ZEITRAUM_INDIVIDUELL,
      from: datumVon,
      to: datumBis,
      onRangeApply: (vonNeu, bisNeu) => {
        setZeitraum(ZEITRAUM_INDIVIDUELL);
        setDatumVon(vonNeu);
        setDatumBis(bisNeu);
      },
      locale: dateLocale(),
      formatDay: (iso) => formatDate(iso),
      backLabel: t("home.zeitraumAktion.zurueck"),
      placeholder: t("belege.list.filter.zeitraum"),
      searchPlaceholder: t("common.combobox.search"),
      emptyLabel: t("common.combobox.empty"),
      rangeLabels: {
        reset: t("belege.list.filter.zeitraumZuruecksetzen"),
        apply: t("belege.list.filter.zeitraumAnwenden"),
        previousMonth: t("belege.list.filter.monatZurueck"),
        nextMonth: t("belege.list.filter.monatVor"),
        pickSecond: t("belege.list.filter.zweitesDatum"),
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
            <Link to="/bankkonten">
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
      <KontoSwitcher
        accounts={accounts}
        value={fKonto}
        onChange={setFKonto}
        allValue={ALLE}
        allLabel={t("bank.list.filter.alleKonten")}
        labelFor={(id) => accountName.get(id) ?? id}
        titleFor={(id) => accountTitle.get(id) ?? ""}
        className="mt-6"
      />

      <div data-tour="bank-txn-filters" className="mt-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={suche}
          onValueChange={setSuche}
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
                    setSuche("");
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
          {filterAktiv ? (
            <EmptyState
              title={t("bank.list.keineTreffer")}
              hint={t("bank.list.keineTrefferHint")}
              action={
                <Button variant="outline" onClick={filterZuruecksetzen}>
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
                    sort={sortSpalte}
                    direction={sortDir}
                    onSort={(spalte) => sortieren(spalte as BankTransactionSort)}
                  >
                    {t("bank.list.col.datum")}
                  </SortableColumnHeader>
                  <TableHead>{t("bank.list.col.konto")}</TableHead>
                  <SortableColumnHeader
                    column="counterparty_holder"
                    sort={sortSpalte}
                    direction={sortDir}
                    onSort={(spalte) => sortieren(spalte as BankTransactionSort)}
                  >
                    {t("bank.list.col.gegenkonto")}
                  </SortableColumnHeader>
                  <TableHead>{t("bank.list.col.verwendungszweck")}</TableHead>
                  <TableHead>{t("bank.list.col.abgleich")}</TableHead>
                  <TableHead>{t("bank.list.col.typ")}</TableHead>
                  <SortableColumnHeader
                    column="amount"
                    sort={sortSpalte}
                    direction={sortDir}
                    onSort={(spalte) => sortieren(spalte as BankTransactionSort)}
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
                      gegenkonto: txn.counterparty_holder ?? "—",
                      betrag: formatSignedEUR(txn.amount),
                    })}
                    onClick={() =>
                      navigate({ to: "/banktransaktionen/$id", params: { id: txn.id } })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate({ to: "/banktransaktionen/$id", params: { id: txn.id } });
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
                        <QuelleBadge
                          source={txn.source}
                          hasDocument={txn.has_document}
                          documentTitle={t("bank.list.beleg.titel", {
                            quelle: txn.document_source
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
                  gegenkonto: txn.counterparty_holder ?? "—",
                  betrag: formatSignedEUR(txn.amount),
                })}
                onClick={() => navigate({ to: "/banktransaktionen/$id", params: { id: txn.id } })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate({ to: "/banktransaktionen/$id", params: { id: txn.id } });
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
                              wer: txn.spender_name ?? txn.spender_email,
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
                  <QuelleBadge source={txn.source} hasDocument={txn.has_document} />
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
            from={von}
            to={bis}
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
