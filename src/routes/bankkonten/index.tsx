import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useFokus } from "@/lib/use-fokus";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useBankAccounts, useBankConnections, useGesellschaften } from "@/lib/data/queries";
import type { BankAccount, BankConnection } from "@/lib/data/types";
import { BankAccountDialog } from "@/components/bank/bank-account-dialog";
import { ConnectBankDialog } from "@/components/bank/connect-bank-dialog";
import { SyncLogDialog } from "@/components/bank/sync-log-dialog";
import { TriggerSyncButton } from "@/components/bank/trigger-sync-button";
import { type KontoGruppe } from "@/components/bank/connection-group-row";
import { BankAccountsTable, type ZeilenKontext } from "@/components/bank/bank-accounts-table";
import { banksapiState } from "@/components/bank/banksapi-state";
import { PleoPanel } from "@/components/bank/pleo-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { FilterPills } from "@/components/data-table/filter-pills";
import { ListToolbar } from "@/components/records/list-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { SortDir } from "@/lib/use-table-view";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/lib/brand";

export const Route = createFileRoute("/bankkonten/")({
  head: () => ({ meta: [{ title: pageTitle("Bankkonten") }] }),
  // ?bank=connected|error is set by the bank-callback Edge Function when the customer
  // returns from the BANKSapi webform. Only those two values mean anything: the param arrives
  // from outside the app, so anything else (a truncated redirect, a hand-edited URL) used to be
  // read as "error" and greeted the user with a red "Verbindung fehlgeschlagen" toast for a
  // connection that was never attempted. Unknown values are dropped instead.
  //
  // `tabSearch` has to be spread in as well, or TanStack Router drops `?tab=` and the active tab
  // never round-trips through a refresh or a shared link.
  validateSearch: (
    search: Record<string, unknown>,
  ): { bank?: BankOutcome; tab?: string; fokus?: string } => ({
    ...tabSearch(search),
    bank: search.bank === "connected" || search.bank === "error" ? search.bank : undefined,
  }),
  component: BankkontenPage,
});

type BankOutcome = "connected" | "error";

/**
 * Three subjects, three tabs.
 *
 * Everything in `bank_accounts` used to be one long page, which is a storage detail deciding the
 * layout. Three different things live in that table and they answer different questions:
 *
 *   konten   accounts a bank connection delivers, grouped under the connection that feeds them
 *   manuell  accounts with no connection: entered by hand, or seeded ready to be adopted by one
 *   pleo     a card programme, which is not a bank account at all
 *
 * Every value stays in this list even while its trigger is hidden, so a `?tab=` link survives the
 * first render, when the accounts query has not come back and nothing knows what exists yet.
 */
const TABS = ["konten", "pleo", "manuell"] as const;
type Tab = (typeof TABS)[number];

// Radix Select rejects an empty-string item value, so "all" needs a sentinel of its own.
const ALLE = "alle";
const OHNE_GESELLSCHAFT = "ohne";
/**
 * The Status filter's three values, over `is_active`.
 *
 * It used to be Aktiv | Entfernt, over `excluded_at`. Once removal lost its button that split was
 * describing a state nobody could reach, and "Aktiv" was doing double duty: it meant "not removed",
 * so a switched-off account was an "Aktiv" row. On and off is the only state an account has now, so
 * that is what the filter says.
 */
const AKTIV = "aktiv";
const INAKTIV = "inaktiv";
const ALLE_STATUS = "alleStatus";

type SortKey = "konto" | "gesellschaft";

/**
 * The search and filters, owned by the page.
 *
 * They live up there because they render on the TAB ROW, beside the tab strip, rather than inside
 * the panel they narrow. Keeping them in the panel and the tabs above it is what made this two
 * rows. The values are shared by the two account tabs on purpose: a search typed on one is still
 * the search when you look at the other, which is what somebody hunting for an IBAN expects.
 */
type KontenFilter = {
  suche: string;
  statusFilter: string;
  gesellschaftFilter: string;
  banksapiFilter: string;
  nurSandbox: boolean;
};

/** The one bucket in the connections table that is not itself a connection. */
const GRUPPE_UNBEKANNT = "__unbekannt";

function istKartenprogramm(a: BankAccount): boolean {
  return (a.metadata as { source?: string } | null)?.source === "pleo";
}

/**
 * Bank accounts and the connections that feed them, with Pleo alongside on its own tab.
 *
 * WHY THE CONNECTIONS ARE HERE. This used to be two nav entries describing the same thing from
 * opposite ends. Bankkonten listed the accounts and said nothing about where they came from;
 * Bankverbindungen listed the accesses and could only preview the account names underneath. Neither
 * answered the question people arrive with, which is one question: which bank is feeding us what,
 * and is it still working. So the connections became the group headers of the accounts table, and
 * the sync controls sit beside the sync state they act on.
 *
 * Not everybody sees that layer. bank_connections and bank_sync_logs carry the BANKSapi access
 * handles and the banking relationship, neither table has a company_id to scope by, and migration
 * 20260819160000 denies both to the assistant role at the database. Without the permission the page
 * renders the accounts flat, which is the honest shape: grouping by a connection whose row cannot
 * be read would produce headers with nothing behind them.
 */
function BankkontenPage() {
  useFokus();
  const { t } = useTranslation();
  const { bank } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<Tab>(TABS, "konten");

  const accountsQ = useBankAccounts();
  const companiesQ = useGesellschaften();
  const connectionsQ = useBankConnections();
  const { can } = useAuth();
  const darfVerbindungen = can(PERMISSIONS.pageBankverbindungen);

  // Report the webform outcome once, then strip the param so a reload or a shared link
  // does not replay the message. The ref guards against StrictMode's double effect.
  const outcomeShown = useRef(false);
  useEffect(() => {
    if (!bank || outcomeShown.current) return;
    outcomeShown.current = true;
    if (bank === "connected") {
      toast.success(t("bankkonten.verbunden.titel"), {
        description: t("bankkonten.verbunden.text"),
      });
    } else {
      toast.error(t("bankkonten.verbindungFehler.titel"), {
        description: t("bankkonten.verbindungFehler.text"),
      });
    }
    // Only `bank` is cleared. Replacing the whole search object would take `tab` with it and throw
    // the reader back to the accounts tab on arrival from the bank's web form.
    navigate({
      to: "/bankkonten",
      search: (prev: Record<string, unknown>) => ({ ...prev, bank: undefined }),
      replace: true,
    });
  }, [bank, navigate, t]);

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState(AKTIV);
  const [gesellschaftFilter, setGesellschaftFilter] = useState(ALLE);
  const [banksapiFilter, setBanksapiFilter] = useState(ALLE);
  const [nurSandbox, setNurSandbox] = useState(false);
  const [pleoSuche, setPleoSuche] = useState("");

  const alleZugaenge = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const kartenprogramme = useMemo(() => alleZugaenge.filter(istKartenprogramm), [alleZugaenge]);

  // company_id → { code, name }, shared by both tabs.
  const companyById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const g of companiesQ.data ?? []) m.set(g.id, { code: g.code, name: g.name });
    return m;
  }, [companiesQ.data]);

  const connections = useMemo<BankConnection[]>(
    () => (darfVerbindungen ? (connectionsQ.data ?? []) : []),
    [connectionsQ.data, darfVerbindungen],
  );

  // A tab with nothing behind it is worse than no tab. Kept visible while the accounts are still
  // loading so the trigger does not appear a moment after the page does.
  const zeigePleo = kartenprogramme.length > 0 || accountsQ.isLoading;
  const aktiv: Tab = tab === "pleo" && !zeigePleo ? "konten" : tab;

  const hatSandbox = useMemo(
    () => alleZugaenge.some((a) => !istKartenprogramm(a) && a.is_sandbox),
    [alleZugaenge],
  );

  const filterFields: FilterField[] = [
    // Removed accounts are a state of the same list, not a separate section. As a filter they cost
    // nothing when nobody is looking for them, and the option carries its own count so the fact
    // that some exist is still visible without a screenful at the bottom of the page.
    {
      kind: "select",
      key: "status",
      label: t("bankkonten.filter.status"),
      value: statusFilter,
      defaultValue: AKTIV,
      onChange: setStatusFilter,
      options: [
        { value: AKTIV, label: t("bankkonten.filter.statusAktiv") },
        { value: INAKTIV, label: t("bankkonten.filter.statusInaktiv") },
        { value: ALLE_STATUS, label: t("bankkonten.filter.statusAlle") },
      ],
    },
    {
      kind: "select",
      key: "gesellschaft",
      label: t("bankkonten.col.gesellschaft"),
      value: gesellschaftFilter,
      defaultValue: ALLE,
      onChange: setGesellschaftFilter,
      options: [
        { value: ALLE, label: t("bankkonten.filter.alleGesellschaften") },
        { value: OHNE_GESELLSCHAFT, label: t("bankkonten.keineGesellschaft") },
        ...(companiesQ.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
      ],
    },
    ...(aktiv === "manuell"
      ? []
      : ([
          {
            kind: "select",
            key: "banksapi",
            label: t("bankkonten.col.anbindung"),
            value: banksapiFilter,
            defaultValue: ALLE,
            onChange: setBanksapiFilter,
            options: [
              { value: ALLE, label: t("bankkonten.filter.alleBanksapi") },
              { value: "connected", label: t("bankkonten.banksapiVerbunden") },
              { value: "linkable", label: t("bankkonten.banksapiJa") },
              { value: "none", label: t("bankkonten.banksapiNein") },
            ],
          },
        ] as FilterField[])),
    // Only offered where it can narrow anything. On a Hub with no mock data it would be a filter
    // that always returns nothing.
    ...(hatSandbox
      ? ([
          {
            kind: "toggle",
            key: "sandbox",
            fieldLabel: t("bankkonten.sandbox"),
            label: t("bankkonten.filter.nurSandbox"),
            value: nurSandbox,
            onChange: setNurSandbox,
          },
        ] as FilterField[])
      : []),
  ];

  const filter: KontenFilter = {
    suche,
    statusFilter,
    gesellschaftFilter,
    banksapiFilter,
    nurSandbox,
  };
  function filterZuruecksetzen() {
    setSuche("");
    setStatusFilter(AKTIV);
    setGesellschaftFilter(ALLE);
    setBanksapiFilter(ALLE);
    setNurSandbox(false);
  }

  return (
    <div>
      {/* Title, one supporting line, and the two actions that create something. Sync, the log,
          search and the filters all belong to a tab's content, not to the page: they applied to the
          accounts only, and sitting up here they made the header the busiest part of the screen. */}
      <div
        data-tour="bank-accounts-header"
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("bankkonten.title")}
          </h1>
        </div>
        {/* The action belongs to the tab, not to the page. Offering "Neues Konto" while somebody is
            looking at Pleo, or "Bank verbinden" on a tab of accounts no bank delivers, is offering
            a button whose result appears somewhere the reader is not. Pleo has no create action at
            all: a card programme arrives from Pleo, it is not something anybody adds here. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {aktiv === "konten" && darfVerbindungen && <ConnectBankDialog />}
          {aktiv === "manuell" && <BankAccountDialog />}
        </div>
      </div>

      <Tabs value={aktiv} onValueChange={setTab} className="mt-6">
        {/* Tabs and controls on one line. The search and the filters narrow the panel below, but
            they sit up here beside the tabs: on their own row they pushed the table down by a whole
            control's height for no gain, and the tab strip left two thirds of its line empty. */}
        <ListToolbar
          dataTour="bank-accounts-toolbar"
          leading={
            <TabsList>
              {/* The two providers are named by their own wordmarks, which a reader recognises faster
                  than a label. `alt` carries the name for a screen reader and for the case where the
                  file does not load, so nothing depends on the image having rendered. Inactive
                  triggers dim their mark: the active tab already has the lighter ground and the
                  shadow, and three full-colour logos in a row flatten that difference. */}
              <TabsTrigger value="konten">
                <img
                  src="/brand/banksapi.svg"
                  alt={t("bankkonten.tab.konten")}
                  className={cn(
                    "h-4 w-auto transition-opacity",
                    aktiv === "konten" ? "opacity-100" : "opacity-60",
                  )}
                />
              </TabsTrigger>
              {zeigePleo && (
                <TabsTrigger value="pleo">
                  <img
                    src="/brand/pleo.svg"
                    alt={t("bankkonten.tab.pleo")}
                    className={cn(
                      "h-4 w-auto transition-opacity",
                      aktiv === "pleo" ? "opacity-100" : "opacity-60",
                    )}
                  />
                </TabsTrigger>
              )}
              <TabsTrigger value="manuell">{t("bankkonten.tab.manuell")}</TabsTrigger>
            </TabsList>
          }
          value={aktiv === "pleo" ? pleoSuche : suche}
          onValueChange={aktiv === "pleo" ? setPleoSuche : setSuche}
          placeholder={
            aktiv === "pleo" ? t("bankkonten.karten.suche") : t("bankkonten.filter.suche")
          }
          actions={
            <>
              {/* Only on the connections tab. Nothing on the other two is synced, so a sync button
                  there would be an action with no effect on anything in front of the reader. */}
              {aktiv === "konten" && darfVerbindungen && (
                <>
                  <TriggerSyncButton connections={connections} size="default" />
                  <SyncLogDialog />
                </>
              )}
              {aktiv !== "pleo" && (
                <FilterPopover
                  fields={filterFields}
                  labels={{
                    button: t("bankkonten.filter.button"),
                    title: t("bankkonten.filter.title"),
                    reset: t("bankkonten.filter.zuruecksetzen"),
                  }}
                />
              )}
            </>
          }
        />
        {aktiv !== "pleo" && <FilterPills className="mt-3" fields={filterFields} />}

        <TabsContent
          value="konten"
          data-tour="bank-accounts-connected"
          data-fokus="verbindungen"
          className="mt-4"
        >
          <KontenTab
            companyById={companyById}
            connections={connections}
            darfVerbindungen={darfVerbindungen}
            filter={filter}
            onReset={filterZuruecksetzen}
          />
        </TabsContent>

        <TabsContent value="manuell" data-tour="bank-accounts-manual" className="mt-4">
          <KontenTab
            companyById={companyById}
            connections={connections}
            darfVerbindungen={darfVerbindungen}
            filter={filter}
            onReset={filterZuruecksetzen}
            manuell
          />
        </TabsContent>

        {zeigePleo && (
          <TabsContent value="pleo" className="mt-4">
            <PleoPanel programs={kartenprogramme} suche={pleoSuche} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/**
 * The Bankkonten tab: section heading with the live sync state, then search and filters, then the
 * table. Its own component so the page above stays a header and two tabs, and so none of this state
 * exists while the reader is looking at Pleo.
 */
function KontenTab({
  companyById,
  connections,
  darfVerbindungen,
  filter,
  onReset,
  manuell = false,
}: {
  companyById: Map<string, { code: string; name: string }>;
  connections: BankConnection[];
  darfVerbindungen: boolean;
  /**
   * Search and filters live on the page, because they render on the tab row above this component
   * rather than inside it. Sorting and which groups are open stay here: they belong to this table
   * and mean nothing to the other tabs.
   */
  filter: KontenFilter;
  onReset: () => void;
  /**
   * The accounts no connection delivers, rather than the ones a connection does. Same table and the
   * same filters; what falls away is everything that only means something on a feed: the grouping,
   * the sync controls, and the Anbindung column, which would say "not connected" on every row.
   */
  manuell?: boolean;
}) {
  const { t } = useTranslation();
  const accountsQ = useBankAccounts();
  const companiesQ = useGesellschaften();
  // Switching an account off stops the import for it, so it stays an admin action.
  const { can } = useAuth();
  const darfEntfernen = can(PERMISSIONS.bankAccountsRemove);

  const { suche, statusFilter, gesellschaftFilter, banksapiFilter, nurSandbox } = filter;
  const [sortierung, setSortierung] = useState<SortKey>("konto");
  const [richtung, setRichtung] = useState<SortDir>("asc");
  // Collapsed by default: the page opens on the banks, and the accounts are one press away. The
  // set holds what is OPEN, so a group added by a new connection arrives closed like the rest.
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(new Set());

  // The account's own bank_name wins when somebody typed one (manual accounts); otherwise fall
  // back to the connection's. Deliberately a display fallback rather than copying the value onto
  // every account row: duplicating it would mean bank-sync overwriting a hand-edited field on
  // every run, the same trap that made renaming accounts impossible.
  const bankNameOf = useMemo(() => {
    const byConnection = new Map<string, string | null>(
      connections.map((c) => [c.id, c.bank_name ?? c.provider_name ?? null]),
    );
    return (a: BankAccount): string =>
      a.bank_name ?? (a.connection_id ? (byConnection.get(a.connection_id) ?? null) : null) ?? "—";
  }, [connections]);

  // Every account the user may see, on and off, before search and the filters. Kept separate
  // because the group counts reason about the whole set, not about what the filter left over.
  const alleKonten = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (a) => !istKartenprogramm(a) && (manuell ? !a.connection_id : !!a.connection_id),
      ),
    [accountsQ.data, manuell],
  );

  // Includes sandbox/mock rows (is_sandbox) too — BANKSAPI_MODE=mock is all this app can
  // connect to until real BANKSapi credentials are live, so hiding them left this page
  // permanently empty. Sandbox rows are visually flagged, not filtered out.
  const konten = useMemo(() => {
    const q = suche.trim().toLowerCase();
    // IBANs are read and pasted with spaces in them, and stored without, so both sides are
    // stripped -- otherwise searching for what the screen displays finds nothing.
    const qIban = q.replace(/\s+/g, "");
    const rows = alleKonten.filter((a) => {
      if (gesellschaftFilter === OHNE_GESELLSCHAFT && a.company_id) return false;
      if (
        gesellschaftFilter !== ALLE &&
        gesellschaftFilter !== OHNE_GESELLSCHAFT &&
        a.company_id !== gesellschaftFilter
      ) {
        return false;
      }
      if (banksapiFilter !== ALLE && banksapiState(a) !== banksapiFilter) return false;
      // `=== false` and not `!a.is_active`: on a database where migration 20260902160000 has not
      // been applied the column is absent, and treating undefined as "off" would empty the table.
      const inaktiv = a.is_active === false;
      if (statusFilter === AKTIV && inaktiv) return false;
      if (statusFilter === INAKTIV && !inaktiv) return false;
      if (nurSandbox && !a.is_sandbox) return false;
      if (!q) return true;
      const iban = (a.iban ?? "").replace(/\s+/g, "").toLowerCase();
      return (
        (a.account_name ?? "").toLowerCase().includes(q) ||
        (a.holder ?? "").toLowerCase().includes(q) ||
        (!!qIban && iban.includes(qIban))
      );
    });
    const faktor = richtung === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortierung === "gesellschaft") {
        const ca = a.company_id ? (companyById.get(a.company_id)?.code ?? "") : "";
        const cb = b.company_id ? (companyById.get(b.company_id)?.code ?? "") : "";
        const byCompany = ca.localeCompare(cb);
        if (byCompany !== 0) return byCompany * faktor;
      }
      return (a.account_name ?? "").localeCompare(b.account_name ?? "") * faktor;
    });
  }, [
    alleKonten,
    companyById,
    suche,
    gesellschaftFilter,
    banksapiFilter,
    nurSandbox,
    statusFilter,
    sortierung,
    richtung,
  ]);

  /**
   * Has the reader actually narrowed anything, as opposed to the list simply being shorter?
   *
   * This used to be `konten.length !== alleKonten.length`, which is not the same question and got
   * the answer wrong the moment a single account was switched off: the DEFAULT status filter hides
   * inactive accounts, so the lengths differ with nothing having been filtered by anybody. Every
   * group was then permanently force-expanded and the collapse looked broken.
   */
  const gefiltert =
    suche.trim() !== "" ||
    statusFilter !== AKTIV ||
    gesellschaftFilter !== ALLE ||
    banksapiFilter !== ALLE ||
    nurSandbox;

  // Grouped by CONNECTION, driven from the connections rather than from the accounts.
  //
  // Building the groups out of the accounts would mean a connection delivering nothing has no
  // group and simply does not appear, which is the exact bug the old connections table had: an
  // abandoned webform, an expired consent and a live connection whose last account an admin removed
  // all looked identical, namely absent, while bank-sync kept running against them.
  const gruppiert = !manuell && darfVerbindungen && connections.length > 0;

  const gruppen = useMemo<{ gruppe: KontoGruppe; konten: BankAccount[] }[]>(() => {
    if (!gruppiert) return [];
    const nachVerbindung = new Map<string, BankAccount[]>();
    const unbekannt: BankAccount[] = [];
    const bekannt = new Set(connections.map((c) => c.id));
    for (const a of konten) {
      // Every account in this tab has a connection; the ones without are their own tab now.
      if (!a.connection_id) continue;
      if (!bekannt.has(a.connection_id)) unbekannt.push(a);
      else {
        const list = nachVerbindung.get(a.connection_id) ?? [];
        list.push(a);
        nachVerbindung.set(a.connection_id, list);
      }
    }

    // The unfiltered per-connection counts, so an empty group can say whether it is the filter or
    // the connection that is delivering nothing.
    const gesamtProVerbindung = new Map<string, number>();
    for (const a of alleKonten) {
      if (!a.connection_id) continue;
      gesamtProVerbindung.set(a.connection_id, (gesamtProVerbindung.get(a.connection_id) ?? 0) + 1);
    }

    const out: { gruppe: KontoGruppe; konten: BankAccount[] }[] = connections
      .map((c) => ({
        gruppe: {
          key: c.id,
          connectionId: c.id,
          label: c.bank_name ?? c.provider_name ?? t("bankkonten.gruppe.unbekannteBank"),
          status: c.status ?? null,
          sandbox: c.is_sandbox,
          createdAt: c.created_at ?? null,
          lastSyncAt: c.last_sync_at ?? null,
          disconnectedAt: c.disconnected_at ?? null,
          verbundenVon: c.connected_by_user?.name ?? c.connected_by_email ?? null,
          anzahl: nachVerbindung.get(c.id)?.length ?? 0,
          anzahlGesamt: gesamtProVerbindung.get(c.id) ?? 0,
        } satisfies KontoGruppe,
        konten: nachVerbindung.get(c.id) ?? [],
      }))
      .sort((a, b) => a.gruppe.label.localeCompare(b.gruppe.label));

    const anhang = (key: string, label: string, rows: BankAccount[], gesamt: number) => ({
      gruppe: {
        key,
        connectionId: null,
        label,
        status: null,
        sandbox: false,
        createdAt: null,
        lastSyncAt: null,
        verbundenVon: null,
        disconnectedAt: null,
        anzahl: rows.length,
        anzahlGesamt: gesamt,
      } satisfies KontoGruppe,
      konten: rows,
    });

    // Accounts whose connection this user cannot read. Rare, and listed rather than dropped:
    // silently losing a row from the table would be the worse failure.
    const unbekanntGesamt = alleKonten.filter(
      (a) => a.connection_id && !bekannt.has(a.connection_id),
    ).length;
    if (unbekanntGesamt > 0) {
      out.push(anhang(GRUPPE_UNBEKANNT, t("bankkonten.gruppe.andere"), unbekannt, unbekanntGesamt));
    }
    return out;
  }, [gruppiert, connections, konten, alleKonten, t]);

  // An empty group is only worth a row in the ACTIVE, unfiltered view, where it means "this
  // connection delivers nothing", which is what the old connections screen hid. Under a filter, or
  // in the removed view, it is just an empty heading.
  const sichtbareGruppen = useMemo(
    () => gruppen.filter((g) => g.konten.length > 0 || (!gefiltert && g.gruppe.connectionId)),
    [gruppen, gefiltert],
  );

  // The Kreditinstitut column, only when it tells the rows apart. Grouped, the bank is named on the
  // group header above every row it owns, so the column would repeat that header all the way down.
  // Ungrouped it earns its place as soon as a second institution appears, and not before.
  const bankNamen = useMemo(() => {
    const s = new Set<string>();
    for (const a of konten) {
      const b = bankNameOf(a);
      if (b && b !== "—") s.add(b);
    }
    return s;
  }, [konten, bankNameOf]);
  // Ungrouped, the institution is the only thing telling the rows apart, so it appears as soon as
  // there is more than one. Grouped, the group header already says it above every row it owns.
  const zeigeBankSpalte = !gruppiert && bankNamen.size > 1;

  function sortUmschalten(spalte: string) {
    const key = spalte as SortKey;
    if (key === sortierung) setRichtung((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortierung(key);
      setRichtung("asc");
    }
  }

  function gruppeUmschalten(key: string) {
    setAufgeklappt((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const ctx: ZeilenKontext = {
    companyById,
    zeigeBankSpalte,
    zeigeAnbindung: !manuell,
    bankNameOf,
    darfEntfernen,
    darfTrennen: darfVerbindungen,
  };

  const isLoading = accountsQ.isLoading || companiesQ.isLoading;

  return (
    <div>
      <div className="mt-4">
        {accountsQ.isError ? (
          <ErrorState error={accountsQ.error} onRetry={() => accountsQ.refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : /* A connection that delivers nothing still has to be visible. Falling through to the
               empty state here is what the old connections screen effectively did on the Immonetz
               Hub: two pending connections, an empty table, and no way to tell "never connected"
               from "connected but delivering nothing". */
        konten.length === 0 && sichtbareGruppen.length === 0 ? (
          <LeererZustand
            leer={alleKonten.length === 0}
            manuell={manuell}
            darfVerbindungen={darfVerbindungen}
            onReset={onReset}
          />
        ) : (
          <BankAccountsTable
            gruppiert={gruppiert}
            gruppen={sichtbareGruppen}
            konten={konten}
            aufgeklappt={aufgeklappt}
            // Any narrowing unfolds every group. Filtering is a request to see what matches, and
            // leaving the matches behind a folded header would answer it with a row of counts.
            // `gefiltert` is the explicit "did the reader narrow something" predicate, not a length
            // comparison, so the default status filter hiding inactive accounts does not count as
            // filtering and the page still opens collapsed.
            alleOffen={gefiltert}
            onToggleGruppe={gruppeUmschalten}
            sort={sortierung}
            dir={richtung}
            onSort={sortUmschalten}
            ctx={ctx}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Nothing to show, in the two flavours that need different words: no accounts at all is a setup
 * question, no match is a stuck filter with a way out.
 */
function LeererZustand({
  leer,
  manuell,
  darfVerbindungen,
  onReset,
}: {
  leer: boolean;
  manuell: boolean;
  darfVerbindungen: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  if (leer && manuell) {
    return (
      // Title only. The create button is one line above, in the header, so a sentence pointing at
      // it would be describing what the reader can already see.
      <EmptyState title={t("bankkonten.emptyManuell.title")} />
    );
  }
  if (leer) {
    return (
      <EmptyState
        title={t("bankkonten.empty.title")}
        hint={darfVerbindungen ? t("bankkonten.empty.hint") : t("bankkonten.empty.hintManuell")}
      />
    );
  }
  return (
    <div>
      <EmptyState
        title={t("bankkonten.keineTreffer.title")}
        hint={t("bankkonten.keineTreffer.hint")}
      />
      <div className="mt-3 flex justify-center">
        <Button variant="outline" onClick={onReset}>
          {t("bankkonten.filter.zuruecksetzen")}
        </Button>
      </div>
    </div>
  );
}
