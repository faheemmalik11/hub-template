import { useMemo, useState } from "react";
import { CreditCard, Landmark, Search } from "lucide-react";

import { Input } from "../../ui/input";
import { Combobox } from "../../ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { ErrorState, TableSkeleton } from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { cn } from "../../lib/class-names";
import type { OpenItemsAdapter } from "../../adapters/open-items";
import type {
  BankReconciliationAdapter,
  BankTransactionRecord,
} from "../../adapters/bank-reconciliation";
import {
  BankMatchPanel,
  englishBankMatchPanelLabels,
  type BankMatchPanelLabels,
} from "../../components/bank-match/BankMatchPanel";
import { computeUrgency } from "./urgency";
import { englishOpenItemsLabels, type OpenItemsLabels } from "./labels";

const SOURCE_ICON: Record<string, typeof Landmark> = { banksapi: Landmark, pleo: CreditCard };

export interface OpenItemsPageProps {
  openItemsAdapter: OpenItemsAdapter;
  bankAdapter: BankReconciliationAdapter;
  labels?: OpenItemsLabels;
  bankLabels?: BankMatchPanelLabels;
}

export function OpenItemsPage({
  openItemsAdapter,
  bankAdapter,
  labels = englishOpenItemsLabels,
  bankLabels = englishBankMatchPanelLabels,
}: OpenItemsPageProps) {
  const [tab, setTab] = useState("open");

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="open">{labels.tabOpenItems}</TabsTrigger>
          <TabsTrigger value="missing">{labels.tabMissingReceipts}</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-4">
          <OpenItemsTab adapter={openItemsAdapter} labels={labels} />
        </TabsContent>
        <TabsContent value="missing" className="mt-4">
          <MissingReceiptsTab adapter={bankAdapter} labels={labels} bankLabels={bankLabels} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const PAGE_SIZE = 25;

function OpenItemsTab({ adapter, labels }: { adapter: OpenItemsAdapter; labels: OpenItemsLabels }) {
  const [type, setType] = useState("__all");
  const [due, setDue] = useState("__all");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [showBlocked, setShowBlocked] = useState(false);
  const [page, setPage] = useState(1);

  const itemsQuery = adapter.useOpenItems(showBlocked);
  const companyOptionsQuery = adapter.useCompanyOptions();
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return itemsQuery.data.filter((row) => {
      if (!showBlocked && row.blocked) return false;
      if (type !== "__all" && row.type !== type) return false;
      if (company && row.companyCode !== company) return false;
      if (term && !row.counterparty.toLowerCase().includes(term)) return false;
      if (due !== "__all") {
        const urgency = computeUrgency(row, today);
        if (due === "overdue" && !urgency.overdue) return false;
        if (due === "soon" && (urgency.overdue || urgency.days == null || urgency.days < -14))
          return false;
      }
      return true;
    });
  }, [itemsQuery.data, type, company, search, due, showBlocked, today]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ua = computeUrgency(a, today);
        const ub = computeUrgency(b, today);
        return (ub.days ?? -Infinity) - (ua.days ?? -Infinity);
      }),
    [filtered, today],
  );

  const { overdueCount, overdueAmount } = useMemo(() => {
    let count = 0;
    let amount = 0;
    for (const row of filtered) {
      const urgency = computeUrgency(row, today);
      if (urgency.overdue) {
        count += 1;
        amount += (row.amount ?? 0) - row.matchedAmount;
      }
    }
    return { overdueCount: count, overdueAmount: amount };
  }, [filtered, today]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={labels.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <Combobox
          value={type}
          onValueChange={(v) => {
            setType(v);
            setPage(1);
          }}
          className="w-full sm:w-40"
          options={[
            { value: "__all", label: labels.typeAll },
            { value: "incoming", label: labels.typeIncoming },
            { value: "outgoing", label: labels.typeOutgoing },
          ]}
        />
        <Combobox
          value={due}
          onValueChange={(v) => {
            setDue(v);
            setPage(1);
          }}
          className="w-full sm:w-40"
          options={[
            { value: "__all", label: labels.dueAll },
            { value: "soon", label: labels.dueSoon },
            { value: "overdue", label: labels.dueOverdue },
          ]}
        />
        <Combobox
          value={company}
          onValueChange={(v) => {
            setCompany(v);
            setPage(1);
          }}
          className="w-full sm:w-48"
          options={[
            { value: "", label: labels.companyAll },
            ...companyOptionsQuery.data.map((c) => ({
              value: c.code,
              label: `${c.code} — ${c.name}`,
            })),
          ]}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showBlocked}
            onChange={(event) => {
              setShowBlocked(event.target.checked);
              setPage(1);
            }}
            className="size-4"
          />
          {labels.showBlocked}
        </label>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {labels.summary(filtered.length, overdueCount, adapter.formatMoney(overdueAmount))}
      </p>

      {itemsQuery.error ? (
        <div className="mt-4">
          <ErrorState error={itemsQuery.error} onRetry={() => {}} />
        </div>
      ) : itemsQuery.loading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} columns={7} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{labels.columnType}</TableHead>
                <TableHead>{labels.columnCounterparty}</TableHead>
                <TableHead>{labels.columnInvoice}</TableHead>
                <TableHead className="text-right">{labels.columnAmount}</TableHead>
                <TableHead className="text-right">{labels.columnMatched}</TableHead>
                <TableHead>{labels.columnReceived}</TableHead>
                <TableHead>{labels.columnDue}</TableHead>
                <TableHead>{labels.columnDiscount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => {
                const urgency = computeUrgency(row, today);
                return (
                  <TableRow
                    key={`${row.type}-${row.id}`}
                    className="cursor-pointer"
                    onClick={() => adapter.openInvoice({ type: row.type, id: row.id })}
                  >
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                          row.type === "incoming"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-teal-100 text-teal-800",
                        )}
                      >
                        {row.type === "incoming" ? labels.typeIncoming : labels.typeOutgoing}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                      {row.counterparty}
                      {row.blocked && (
                        <span className="ml-1.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {labels.blockedBadge}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.invoiceNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {adapter.formatMoney(row.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {row.matchedAmount > 0 ? adapter.formatMoney(row.matchedAmount) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {adapter.formatDate(row.receivedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {urgency.days != null ? (
                        <span
                          className={cn(
                            urgency.level === "critical"
                              ? "text-destructive"
                              : urgency.level === "old"
                                ? "text-amber-700"
                                : "text-muted-foreground",
                          )}
                        >
                          {urgency.overdue
                            ? labels.daysOverdue(urgency.days)
                            : labels.daysOld(Math.abs(urgency.days))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {row.discountDeadline && row.discountPercent != null
                        ? labels.discountUntil(
                            adapter.formatDate(row.discountDeadline),
                            row.discountPercent,
                          )
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    {labels.emptyOpenItems}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!itemsQuery.error && !itemsQuery.loading && sorted.length > 0 && (
        <TablePagination
          page={safePage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          total={sorted.length}
          from={(safePage - 1) * PAGE_SIZE + 1}
          to={Math.min(safePage * PAGE_SIZE, sorted.length)}
          onPage={setPage}
          onPageSize={() => {}}
        />
      )}
    </div>
  );
}

function MissingReceiptsTab({
  adapter,
  labels,
  bankLabels,
}: {
  adapter: BankReconciliationAdapter;
  labels: OpenItemsLabels;
  bankLabels: BankMatchPanelLabels;
}) {
  const [direction, setDirection] = useState("__all");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [openTransaction, setOpenTransaction] = useState<BankTransactionRecord | null>(null);

  const transactionsQuery = adapter.useTransactions();
  const companyOptionsQuery = adapter.useCompanyOptions?.();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactionsQuery.data.filter((row) => {
      if (direction !== "__all" && row.direction !== direction) return false;
      if (!term) return true;
      return (row.counterparty_holder ?? "").toLowerCase().includes(term);
    });
  }, [transactionsQuery.data, direction, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <Combobox
          value={direction}
          onValueChange={setDirection}
          className="w-full sm:w-40"
          options={[
            { value: "__all", label: labels.directionAll },
            { value: "eingehend", label: labels.directionIncoming },
            { value: "ausgehend", label: labels.directionOutgoing },
          ]}
        />
        {companyOptionsQuery && (companyOptionsQuery.data?.length ?? 0) > 0 && (
          <Combobox
            value={company}
            onValueChange={setCompany}
            className="w-full sm:w-48"
            options={[
              { value: "", label: labels.companyAll },
              ...companyOptionsQuery.data.map((c) => ({
                value: c.code,
                label: `${c.code} — ${c.name}`,
              })),
            ]}
          />
        )}
      </div>

      {transactionsQuery.error ? (
        <div className="mt-4">
          <ErrorState error={transactionsQuery.error} onRetry={() => {}} />
        </div>
      ) : transactionsQuery.loading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} columns={5} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{labels.columnDate}</TableHead>
                <TableHead>{labels.columnCounterparty}</TableHead>
                <TableHead>{labels.columnAccount}</TableHead>
                <TableHead className="text-right">{labels.columnAmount}</TableHead>
                <TableHead>{labels.columnSource}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const SourceIcon = row.transaction_type
                  ? SOURCE_ICON[row.transaction_type]
                  : undefined;
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => setOpenTransaction(row)}
                  >
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {adapter.formatDate(row.booking_date)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                      {row.counterparty_holder ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.account_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {adapter.formatMoney(row.amount)}
                    </TableCell>
                    <TableCell>
                      {SourceIcon ? <SourceIcon className="size-4 text-muted-foreground" /> : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    {labels.emptyMissing}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <BankMatchPanel
        transaction={openTransaction}
        onClose={() => setOpenTransaction(null)}
        adapter={adapter}
        labels={bankLabels}
      />
    </div>
  );
}
