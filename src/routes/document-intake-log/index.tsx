import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { NoAccess } from "@/components/layout/no-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelBadge } from "@/components/documents/badges";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { FilterPills } from "@/components/data-table/filter-pills";
import type { FilterField } from "@/components/data-table/filter-fields";
import { DocumentIntakeLogDetailSheet } from "@/components/document-intake-log/detail-sheet";
import {
  DOCUMENT_INTAKE_LOG_PAGE_SIZE,
  DOCUMENT_INTAKE_OUTCOMES,
  useDocumentIntakeLog,
  type DocumentIntakeLogTab,
  type DocumentIntakeOutcome,
} from "@/data/documents/intake-log";
import { formatDateTime } from "@/lib/data/format";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

const OUTCOME_STYLE: Record<DocumentIntakeOutcome, string> = {
  open: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
  in_review: "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100",
  recognised: "border-transparent bg-sky-100 text-sky-800 hover:bg-sky-100",
  approved: "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  handed_over: "border-transparent bg-violet-100 text-violet-800 hover:bg-violet-100",
  filed: "border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  not_relevant: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
  archived: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
};

const TABS: DocumentIntakeLogTab[] = ["all", "open", "done"];

interface IntakeLogSearch {
  tab: DocumentIntakeLogTab;
  search: string;
  page: number;
  outcome: string;
  channel: string;
  document?: string;
}

export const Route = createFileRoute("/document-intake-log/")({
  validateSearch: (input: Record<string, unknown>): IntakeLogSearch => {
    const tab = TABS.find((value) => value === input.tab) ?? "all";
    const search = typeof input.search === "string" ? input.search.slice(0, 200) : "";
    const page = Number(input.page);
    const outcome = DOCUMENT_INTAKE_OUTCOMES.find((value) => value === input.outcome) ?? "";
    return {
      tab,
      search,
      page: Number.isFinite(page) && page > 1 ? Math.floor(page) : 1,
      outcome,
      channel: typeof input.channel === "string" ? input.channel : "",
      document: typeof input.document === "string" && input.document ? input.document : undefined,
    };
  },
  head: () => ({ meta: [{ title: pageTitle("Document intake log") }] }),
  component: DocumentIntakeLogGuard,
});

function DocumentIntakeLogGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageDocumentIntakeLog)) return <NoAccess variant="manager" />;
  return <DocumentIntakeLogPage />;
}

function DocumentIntakeLogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { tab, search: query, page } = search;
  const [searchInput, setSearchInput] = useState(query);

  const setSearch = useCallback(
    (patch: Partial<IntakeLogSearch>) => {
      void navigate({
        to: "/document-intake-log",
        search: { ...search, page: 1, ...patch } as IntakeLogSearch,
      });
    },
    [navigate, search],
  );

  const openEntry = useCallback(
    (id: string | undefined) => {
      void navigate({
        to: "/document-intake-log",
        search: { ...search, document: id } as IntakeLogSearch,
      });
    },
    [navigate, search],
  );

  useEffect(() => {
    if (searchInput === query) return;
    const id = window.setTimeout(() => setSearch({ search: searchInput }), 300);
    return () => window.clearTimeout(id);
  }, [searchInput, query, setSearch]);

  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "outcome",
      label: t("documentIntakeLog.filter.outcome", { defaultValue: "What happened" }),
      value: search.outcome,
      defaultValue: "",
      options: [
        { value: "", label: t("documentIntakeLog.filter.allOutcomes", { defaultValue: "All" }) },
        ...DOCUMENT_INTAKE_OUTCOMES.map((value) => ({
          value,
          label: t(`documentIntakeLog.outcome.${value}`, { defaultValue: value }),
        })),
      ],
      onChange: (value: string) => setSearch({ outcome: value }),
    },
  ];

  const entries = useDocumentIntakeLog({
    tab,
    search: query,
    page: page - 1,
    outcome: (search.outcome || null) as DocumentIntakeOutcome | null,
    channel: search.channel || null,
  });
  const total = entries.data?.total ?? 0;
  const rows = entries.data?.rows ?? [];
  const lastPage = Math.max(1, Math.ceil(total / DOCUMENT_INTAKE_LOG_PAGE_SIZE));
  const openRow = search.document ? rows.find((row) => row.id === search.document) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("documentIntakeLog.title", { defaultValue: "Document intake log" })}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("documentIntakeLog.subtitle", {
            defaultValue: "Every document that came in, and what happened to it.",
          })}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(value) => setSearch({ tab: value as DocumentIntakeLogTab })}
        >
          <TabsList>
            {TABS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`documentIntakeLog.tab.${key}`, { defaultValue: key })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("documentIntakeLog.searchPlaceholder", {
                defaultValue: "Search sender or subject",
              })}
              className="pl-8"
            />
          </div>
          <FilterPopover
            fields={filterFields}
            labels={{
              button: t("documentIntakeLog.filter.button", { defaultValue: "Filter" }),
              title: t("documentIntakeLog.filter.title", { defaultValue: "Filter" }),
              reset: t("documentIntakeLog.filter.reset", { defaultValue: "Reset" }),
            }}
          />
        </div>
      </div>

      <FilterPills fields={filterFields} />

      {entries.isLoading ? (
        <TableSkeleton cols={6} />
      ) : entries.isError ? (
        <ErrorState error={entries.error} onRetry={() => entries.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("documentIntakeLog.emptyTitle", { defaultValue: "Nothing here yet" })}
          hint={t("documentIntakeLog.emptyHint", {
            defaultValue: "Documents will show up here once they come in.",
          })}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("documentIntakeLog.col.received", { defaultValue: "Received" })}
                    </TableHead>
                    <TableHead>
                      {t("documentIntakeLog.col.channel", { defaultValue: "Source" })}
                    </TableHead>
                    <TableHead>
                      {t("documentIntakeLog.col.sender", { defaultValue: "Sender" })}
                    </TableHead>
                    <TableHead>
                      {t("documentIntakeLog.col.subject", { defaultValue: "Subject" })}
                    </TableHead>
                    <TableHead>
                      {t("documentIntakeLog.col.company", { defaultValue: "Company" })}
                    </TableHead>
                    <TableHead>
                      {t("documentIntakeLog.col.outcome", { defaultValue: "What happened" })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => openEntry(row.id)}
                    >
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(row.receivedAt)}
                      </TableCell>
                      <TableCell>
                        <ChannelBadge channel={row.channel} />
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-sm font-medium text-foreground">
                        {row.sender ??
                          t("documentIntakeLog.unknownSender", { defaultValue: "Unknown" })}
                      </TableCell>
                      <TableCell className="max-w-[20rem] truncate text-sm text-muted-foreground">
                        {row.subject ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.companyCode ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[row.outcome]}`}
                        >
                          {t(`documentIntakeLog.outcome.${row.outcome}`, {
                            defaultValue: row.outcome,
                          })}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("common.pagination.showing", {
                from: total === 0 ? 0 : (page - 1) * DOCUMENT_INTAKE_LOG_PAGE_SIZE + 1,
                to: Math.min(page * DOCUMENT_INTAKE_LOG_PAGE_SIZE, total),
                total,
                defaultValue: `Showing ${total === 0 ? 0 : (page - 1) * DOCUMENT_INTAKE_LOG_PAGE_SIZE + 1}–${Math.min(page * DOCUMENT_INTAKE_LOG_PAGE_SIZE, total)} of ${total}`,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={page <= 1}
                onClick={() =>
                  void navigate({
                    to: "/document-intake-log",
                    search: { ...search, page: page - 1, document: undefined } as IntakeLogSearch,
                  })
                }
              >
                <ChevronLeft className="size-4" />
                {t("common.pagination.prev", { defaultValue: "Back" })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={page >= lastPage}
                onClick={() =>
                  void navigate({
                    to: "/document-intake-log",
                    search: { ...search, page: page + 1, document: undefined } as IntakeLogSearch,
                  })
                }
              >
                {t("common.pagination.next", { defaultValue: "Next" })}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {openRow && (
        <DocumentIntakeLogDetailSheet entry={openRow} onClose={() => openEntry(undefined)} />
      )}
    </div>
  );
}
