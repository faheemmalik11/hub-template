import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useFocus } from "@/lib/use-focus";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useBankAccounts, useBankConnections, useCompanies } from "@/data";
import type { BankAccount, BankConnection } from "@/lib/data/types";
import { BankAccountDialog } from "@/components/bank/bank-account-dialog";
import { ConnectBankDialog } from "@/components/bank/connect-bank-dialog";
import { SyncLogDialog } from "@/components/bank/sync-log-dialog";
import { TriggerSyncButton } from "@/components/bank/trigger-sync-button";
import { type AccountGroup } from "@/components/bank/connection-group-row";
import { BankAccountsTable, type RowsContext } from "@/components/bank/bank-accounts-table";
import { banksapiState } from "@/components/bank/banksapi-state";
import { PleoPanel } from "@/components/bank/pleo-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { FilterPills } from "@/components/data-table/filter-pills";
import { ListToolbar } from "@/components/records/list-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import type { SortDir } from "@/lib/use-table-view";
import { tabSearch, useTabParam } from "@/lib/use-tab-param";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/bank-accounts/")({
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
  ): { bank?: BankOutcome; tab?: string; focus?: string } => ({
    ...tabSearch(search),
    bank: search.bank === "connected" || search.bank === "error" ? search.bank : undefined,
  }),
  component: BankAccountsPage,
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
const ALL = "alle";
const WITHOUT_COMPANY = "ohne";
/**
 * The Status filter's three values, over `is_active`.
 *
 * It used to be Aktiv | Entfernt, over `excluded_at`. Once removal lost its button that split was
 * describing a state nobody could reach, and "Aktiv" was doing double duty: it meant "not removed",
 * so a switched-off account was an "Aktiv" row. On and off is the only state an account has now, so
 * that is what the filter says.
 */
const ACTIVE = "aktiv";
const INACTIVE = "inaktiv";
const ALL_STATUS = "alleStatus";

type SortKey = "konto" | "gesellschaft";

/**
 * The search and filters, owned by the page.
 *
 * They live up there because they render on the TAB ROW, beside the tab strip, rather than inside
 * the panel they narrow. Keeping them in the panel and the tabs above it is what made this two
 * rows. The values are shared by the two account tabs on purpose: a search typed on one is still
 * the search when you look at the other, which is what somebody hunting for an IBAN expects.
 */
type AccountsFilter = {
  search: string;
  statusFilter: string;
  companyFilter: string;
  banksapiFilter: string;
  onlySandbox: boolean;
};

/** The one bucket in the connections table that is not itself a connection. */
const GROUP_UNKNOWN = "__unbekannt";

function isCardProgram(a: BankAccount): boolean {
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
function BankAccountsPage() {
  useFocus();
  const { t } = useTranslation();
  const { bank } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam<Tab>(TABS, "konten");

  const accountsQ = useBankAccounts();
  const companiesQ = useCompanies();
  const connectionsQ = useBankConnections();
  const { can } = useAuth();
  const canConnections = can(PERMISSIONS.pageBankConnections);

  // Report the webform outcome once, then strip the param so a reload or a shared link
  // does not replay the message. The ref guards against StrictMode's double effect.
  const outcomeShown = useRef(false);
  useEffect(() => {
    if (!bank || outcomeShown.current) return;
    outcomeShown.current = true;
    if (bank === "connected") {
      toast.success(t("bankAccounts.verbunden.titel"), {
        description: t("bankAccounts.verbunden.text"),
      });
    } else {
      toast.error(t("bankAccounts.verbindungFehler.titel"), {
        description: t("bankAccounts.verbindungFehler.text"),
      });
    }
    // Only `bank` is cleared. Replacing the whole search object would take `tab` with it and throw
    // the reader back to the accounts tab on arrival from the bank's web form.
    navigate({
      to: "/bank-accounts",
      search: (prev: Record<string, unknown>) => ({ ...prev, bank: undefined }),
      replace: true,
    });
  }, [bank, navigate, t]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ACTIVE);
  const [companyFilter, setCompanyFilter] = useState(ALL);
  const [banksapiFilter, setBanksapiFilter] = useState(ALL);
  const [onlySandbox, setOnlySandbox] = useState(false);
  const [pleoSearch, setPleoSearch] = useState("");

  const allAccesses = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const cardPrograms = useMemo(() => allAccesses.filter(isCardProgram), [allAccesses]);

  // company_id → { code, name }, shared by both tabs.
  const companyById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const g of companiesQ.data ?? []) m.set(g.id, { code: g.code, name: g.name });
    return m;
  }, [companiesQ.data]);

  const connections = useMemo<BankConnection[]>(
    () => (canConnections ? (connectionsQ.data ?? []) : []),
    [connectionsQ.data, canConnections],
  );

  // A tab with nothing behind it is worse than no tab. Kept visible while the accounts are still
  // loading so the trigger does not appear a moment after the page does.
  const showPleo = cardPrograms.length > 0 || accountsQ.isLoading;
  const active: Tab = tab === "pleo" && !showPleo ? "konten" : tab;

  const hatSandbox = useMemo(
    () => allAccesses.some((a) => !isCardProgram(a) && a.is_sandbox),
    [allAccesses],
  );

  const filterFields: FilterField[] = [
    // Removed accounts are a state of the same list, not a separate section. As a filter they cost
    // nothing when nobody is looking for them, and the option carries its own count so the fact
    // that some exist is still visible without a screenful at the bottom of the page.
    {
      kind: "select",
      key: "status",
      label: t("bankAccounts.filter.status"),
      value: statusFilter,
      defaultValue: ACTIVE,
      onChange: setStatusFilter,
      options: [
        { value: ACTIVE, label: t("bankAccounts.filter.statusAktiv") },
        { value: INACTIVE, label: t("bankAccounts.filter.statusInaktiv") },
        { value: ALL_STATUS, label: t("bankAccounts.filter.statusAlle") },
      ],
    },
    {
      kind: "select",
      key: "gesellschaft",
      label: t("bankAccounts.col.gesellschaft"),
      value: companyFilter,
      defaultValue: ALL,
      onChange: setCompanyFilter,
      options: [
        { value: ALL, label: t("bankAccounts.filter.alleGesellschaften") },
        { value: WITHOUT_COMPANY, label: t("bankAccounts.keineGesellschaft") },
        ...(companiesQ.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
      ],
    },
    ...(active === "manuell"
      ? []
      : ([
          {
            kind: "select",
            key: "banksapi",
            label: t("bankAccounts.col.anbindung"),
            value: banksapiFilter,
            defaultValue: ALL,
            onChange: setBanksapiFilter,
            options: [
              { value: ALL, label: t("bankAccounts.filter.alleBanksapi") },
              { value: "connected", label: t("bankAccounts.banksapiVerbunden") },
              { value: "linkable", label: t("bankAccounts.banksapiJa") },
              { value: "none", label: t("bankAccounts.banksapiNein") },
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
            fieldLabel: t("bankAccounts.sandbox"),
            label: t("bankAccounts.filter.nurSandbox"),
            value: onlySandbox,
            onChange: setOnlySandbox,
          },
        ] as FilterField[])
      : []),
  ];

  const filter: AccountsFilter = {
    search,
    statusFilter,
    companyFilter,
    banksapiFilter,
    onlySandbox,
  };
  function filterReset() {
    setSearch("");
    setStatusFilter(ACTIVE);
    setCompanyFilter(ALL);
    setBanksapiFilter(ALL);
    setOnlySandbox(false);
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
            {t("bankAccounts.title")}
          </h1>
        </div>
        {/* The action belongs to the tab, not to the page. Offering "Neues Konto" while somebody is
            looking at Pleo, or "Bank verbinden" on a tab of accounts no bank delivers, is offering
            a button whose result appears somewhere the reader is not. Pleo has no create action at
            all: a card programme arrives from Pleo, it is not something anybody adds here. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {active === "konten" && canConnections && <ConnectBankDialog />}
          {active === "manuell" && <BankAccountDialog />}
        </div>
      </div>

      <Tabs value={active} onValueChange={setTab} className="mt-6">
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
                  alt={t("bankAccounts.tab.konten")}
                  className={cn(
                    "h-4 w-auto transition-opacity",
                    active === "konten" ? "opacity-100" : "opacity-60",
                  )}
                />
              </TabsTrigger>
              {showPleo && (
                <TabsTrigger value="pleo">
                  <img
                    src="/brand/pleo.svg"
                    alt={t("bankAccounts.tab.pleo")}
                    className={cn(
                      "h-4 w-auto transition-opacity",
                      active === "pleo" ? "opacity-100" : "opacity-60",
                    )}
                  />
                </TabsTrigger>
              )}
              <TabsTrigger value="manuell">{t("bankAccounts.tab.manuell")}</TabsTrigger>
            </TabsList>
          }
          value={active === "pleo" ? pleoSearch : search}
          onValueChange={active === "pleo" ? setPleoSearch : setSearch}
          placeholder={
            active === "pleo" ? t("bankAccounts.karten.suche") : t("bankAccounts.filter.suche")
          }
          actions={
            <>
              {/* Only on the connections tab. Nothing on the other two is synced, so a sync button
                  there would be an action with no effect on anything in front of the reader. */}
              {active === "konten" && canConnections && (
                <>
                  <TriggerSyncButton connections={connections} size="default" />
                  <SyncLogDialog />
                </>
              )}
              {active !== "pleo" && (
                <FilterPopover
                  fields={filterFields}
                  labels={{
                    button: t("bankAccounts.filter.button"),
                    title: t("bankAccounts.filter.title"),
                    reset: t("bankAccounts.filter.zuruecksetzen"),
                  }}
                />
              )}
            </>
          }
        />
        {active !== "pleo" && <FilterPills className="mt-3" fields={filterFields} />}

        <TabsContent
          value="konten"
          data-tour="bank-accounts-connected"
          data-focus="connections"
          className="mt-4"
        >
          <AccountsTab
            companyById={companyById}
            connections={connections}
            canConnections={canConnections}
            filter={filter}
            onReset={filterReset}
          />
        </TabsContent>

        <TabsContent value="manuell" data-tour="bank-accounts-manual" className="mt-4">
          <AccountsTab
            companyById={companyById}
            connections={connections}
            canConnections={canConnections}
            filter={filter}
            onReset={filterReset}
            manual
          />
        </TabsContent>

        {showPleo && (
          <TabsContent value="pleo" className="mt-4">
            <PleoPanel programs={cardPrograms} search={pleoSearch} />
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
function AccountsTab({
  companyById,
  connections,
  canConnections,
  filter,
  onReset,
  manual = false,
}: {
  companyById: Map<string, { code: string; name: string }>;
  connections: BankConnection[];
  canConnections: boolean;
  /**
   * Search and filters live on the page, because they render on the tab row above this component
   * rather than inside it. Sorting and which groups are open stay here: they belong to this table
   * and mean nothing to the other tabs.
   */
  filter: AccountsFilter;
  onReset: () => void;
  /**
   * The accounts no connection delivers, rather than the ones a connection does. Same table and the
   * same filters; what falls away is everything that only means something on a feed: the grouping,
   * the sync controls, and the Anbindung column, which would say "not connected" on every row.
   */
  manual?: boolean;
}) {
  const { t } = useTranslation();
  const accountsQ = useBankAccounts();
  const companiesQ = useCompanies();
  // Switching an account off stops the import for it, so it stays an admin action.
  const { can } = useAuth();
  const canRemove = can(PERMISSIONS.bankWrite);

  const { search, statusFilter, companyFilter, banksapiFilter, onlySandbox } = filter;
  const [sorting, setSorting] = useState<SortKey>("konto");
  const [direction, setDirection] = useState<SortDir>("asc");
  // Collapsed by default: the page opens on the banks, and the accounts are one press away. The
  // set holds what is OPEN, so a group added by a new connection arrives closed like the rest.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
  const allAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (a) => !isCardProgram(a) && (manual ? !a.connection_id : !!a.connection_id),
      ),
    [accountsQ.data, manual],
  );

  // Includes sandbox/mock rows (is_sandbox) too — BANKSAPI_MODE=mock is all this app can
  // connect to until real BANKSapi credentials are live, so hiding them left this page
  // permanently empty. Sandbox rows are visually flagged, not filtered out.
  const accounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    // IBANs are read and pasted with spaces in them, and stored without, so both sides are
    // stripped -- otherwise searching for what the screen displays finds nothing.
    const qIban = q.replace(/\s+/g, "");
    const rows = allAccounts.filter((a) => {
      if (companyFilter === WITHOUT_COMPANY && a.company_id) return false;
      if (
        companyFilter !== ALL &&
        companyFilter !== WITHOUT_COMPANY &&
        a.company_id !== companyFilter
      ) {
        return false;
      }
      if (banksapiFilter !== ALL && banksapiState(a) !== banksapiFilter) return false;
      // `=== false` and not `!a.is_active`: on a database where migration 20260902160000 has not
      // been applied the column is absent, and treating undefined as "off" would empty the table.
      const inactive = a.is_active === false;
      if (statusFilter === ACTIVE && inactive) return false;
      if (statusFilter === INACTIVE && !inactive) return false;
      if (onlySandbox && !a.is_sandbox) return false;
      if (!q) return true;
      const iban = (a.iban ?? "").replace(/\s+/g, "").toLowerCase();
      return (
        (a.account_name ?? "").toLowerCase().includes(q) ||
        (a.holder ?? "").toLowerCase().includes(q) ||
        (!!qIban && iban.includes(qIban))
      );
    });
    const factor = direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sorting === "gesellschaft") {
        const ca = a.company_id ? (companyById.get(a.company_id)?.code ?? "") : "";
        const cb = b.company_id ? (companyById.get(b.company_id)?.code ?? "") : "";
        const byCompany = ca.localeCompare(cb);
        if (byCompany !== 0) return byCompany * factor;
      }
      return (a.account_name ?? "").localeCompare(b.account_name ?? "") * factor;
    });
  }, [
    allAccounts,
    companyById,
    search,
    companyFilter,
    banksapiFilter,
    onlySandbox,
    statusFilter,
    sorting,
    direction,
  ]);

  /**
   * Has the reader actually narrowed anything, as opposed to the list simply being shorter?
   *
   * This used to be `konten.length !== alleKonten.length`, which is not the same question and got
   * the answer wrong the moment a single account was switched off: the DEFAULT status filter hides
   * inactive accounts, so the lengths differ with nothing having been filtered by anybody. Every
   * group was then permanently force-expanded and the collapse looked broken.
   */
  const filtered =
    search.trim() !== "" ||
    statusFilter !== ACTIVE ||
    companyFilter !== ALL ||
    banksapiFilter !== ALL ||
    onlySandbox;

  // Grouped by CONNECTION, driven from the connections rather than from the accounts.
  //
  // Building the groups out of the accounts would mean a connection delivering nothing has no
  // group and simply does not appear, which is the exact bug the old connections table had: an
  // abandoned webform, an expired consent and a live connection whose last account an admin removed
  // all looked identical, namely absent, while bank-sync kept running against them.
  const grouped = !manual && canConnections && connections.length > 0;

  const groups = useMemo<{ group: AccountGroup; accounts: BankAccount[] }[]>(() => {
    if (!grouped) return [];
    const byConnection = new Map<string, BankAccount[]>();
    const unknown: BankAccount[] = [];
    const known = new Set(connections.map((c) => c.id));
    for (const a of accounts) {
      // Every account in this tab has a connection; the ones without are their own tab now.
      if (!a.connection_id) continue;
      if (!known.has(a.connection_id)) unknown.push(a);
      else {
        const list = byConnection.get(a.connection_id) ?? [];
        list.push(a);
        byConnection.set(a.connection_id, list);
      }
    }

    // The unfiltered per-connection counts, so an empty group can say whether it is the filter or
    // the connection that is delivering nothing.
    const totalProConnection = new Map<string, number>();
    for (const a of allAccounts) {
      if (!a.connection_id) continue;
      totalProConnection.set(a.connection_id, (totalProConnection.get(a.connection_id) ?? 0) + 1);
    }

    const out: { group: AccountGroup; accounts: BankAccount[] }[] = connections
      .map((c) => ({
        group: {
          key: c.id,
          connectionId: c.id,
          label: c.bank_name ?? c.provider_name ?? t("bankAccounts.gruppe.unbekannteBank"),
          status: c.status ?? null,
          sandbox: c.is_sandbox,
          createdAt: c.created_at ?? null,
          lastSyncAt: c.last_sync_at ?? null,
          disconnectedAt: c.disconnected_at ?? null,
          connectedFromDate: c.connected_by_user?.name ?? c.connected_by_email ?? null,
          count: byConnection.get(c.id)?.length ?? 0,
          countTotal: totalProConnection.get(c.id) ?? 0,
        } satisfies AccountGroup,
        accounts: byConnection.get(c.id) ?? [],
      }))
      .sort((a, b) => a.group.label.localeCompare(b.group.label));

    const attachment = (key: string, label: string, rows: BankAccount[], total: number) => ({
      group: {
        key,
        connectionId: null,
        label,
        status: null,
        sandbox: false,
        createdAt: null,
        lastSyncAt: null,
        connectedFromDate: null,
        disconnectedAt: null,
        count: rows.length,
        countTotal: total,
      } satisfies AccountGroup,
      accounts: rows,
    });

    // Accounts whose connection this user cannot read. Rare, and listed rather than dropped:
    // silently losing a row from the table would be the worse failure.
    const unknownTotal = allAccounts.filter(
      (a) => a.connection_id && !known.has(a.connection_id),
    ).length;
    if (unknownTotal > 0) {
      out.push(attachment(GROUP_UNKNOWN, t("bankAccounts.gruppe.andere"), unknown, unknownTotal));
    }
    return out;
  }, [grouped, connections, accounts, allAccounts, t]);

  // An empty group is only worth a row in the ACTIVE, unfiltered view, where it means "this
  // connection delivers nothing", which is what the old connections screen hid. Under a filter, or
  // in the removed view, it is just an empty heading.
  const visibleGroups = useMemo(
    () => groups.filter((g) => g.accounts.length > 0 || (!filtered && g.group.connectionId)),
    [groups, filtered],
  );

  // The Kreditinstitut column, only when it tells the rows apart. Grouped, the bank is named on the
  // group header above every row it owns, so the column would repeat that header all the way down.
  // Ungrouped it earns its place as soon as a second institution appears, and not before.
  const bankNames = useMemo(() => {
    const s = new Set<string>();
    for (const a of accounts) {
      const b = bankNameOf(a);
      if (b && b !== "—") s.add(b);
    }
    return s;
  }, [accounts, bankNameOf]);
  // Ungrouped, the institution is the only thing telling the rows apart, so it appears as soon as
  // there is more than one. Grouped, the group header already says it above every row it owns.
  const showBankColumn = !grouped && bankNames.size > 1;

  function sortToggle(column: string) {
    const key = column as SortKey;
    if (key === sorting) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSorting(key);
      setDirection("asc");
    }
  }

  function groupToggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const ctx: RowsContext = {
    companyById,
    showBankColumn,
    showConnection: !manual,
    bankNameOf,
    canRemove,
    canUnlink: canConnections,
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
        accounts.length === 0 && visibleGroups.length === 0 ? (
          <BankAccountsEmptyState
            leer={allAccounts.length === 0}
            manual={manual}
            canConnections={canConnections}
            onReset={onReset}
          />
        ) : (
          <BankAccountsTable
            grouped={grouped}
            groups={visibleGroups}
            accounts={accounts}
            expanded={expanded}
            // Any narrowing unfolds every group. Filtering is a request to see what matches, and
            // leaving the matches behind a folded header would answer it with a row of counts.
            // `gefiltert` is the explicit "did the reader narrow something" predicate, not a length
            // comparison, so the default status filter hiding inactive accounts does not count as
            // filtering and the page still opens collapsed.
            allOpen={filtered}
            onToggleGroup={groupToggle}
            sort={sorting}
            dir={direction}
            onSort={sortToggle}
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
function BankAccountsEmptyState({
  leer,
  manual,
  canConnections,
  onReset,
}: {
  leer: boolean;
  manual: boolean;
  canConnections: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  if (leer && manual) {
    return (
      // Title only. The create button is one line above, in the header, so a sentence pointing at
      // it would be describing what the reader can already see.
      <EmptyState title={t("bankAccounts.emptyManuell.title")} />
    );
  }
  if (leer) {
    return (
      <EmptyState
        title={t("bankAccounts.empty.title")}
        hint={canConnections ? t("bankAccounts.empty.hint") : t("bankAccounts.empty.hintManuell")}
      />
    );
  }
  return (
    <div>
      <EmptyState
        title={t("bankAccounts.keineTreffer.title")}
        hint={t("bankAccounts.keineTreffer.hint")}
      />
      <div className="mt-3 flex justify-center">
        <Button variant="outline" onClick={onReset}>
          {t("bankAccounts.filter.zuruecksetzen")}
        </Button>
      </div>
    </div>
  );
}
