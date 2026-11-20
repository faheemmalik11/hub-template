import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { EmptyState, ErrorState } from "@/components/documents/query-states";
import { NoAccess } from "@/components/layout/no-access";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pageTitle } from "@/config/brand";
import { PERMISSIONS } from "@/config/permissions";
import { useDealsWithUnmaintainedFields } from "@/data";
import type { DealWithUnmaintainedFields } from "@/data";
import { useAuth } from "@/lib/auth";
import { propstackUnitUrl } from "@/lib/crm/propstack";
import { formatDate } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { useTableView } from "@/lib/use-table-view";

export const Route = createFileRoute("/unmaintained-fields/")({
  head: () => ({ meta: [{ title: pageTitle("Nicht gepflegte Felder") }] }),
  staticData: { titleKey: "unmaintainedFields" },
  component: UnmaintainedFieldsGuard,
});

function UnmaintainedFieldsGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageUnmaintainedFields)) return <NoAccess />;
  return <UnmaintainedFieldsPage />;
}

function UnmaintainedFieldsPage() {
  const { t } = useTranslation();
  const q = useDealsWithUnmaintainedFields();

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("unmaintainedFields.title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("unmaintainedFields.subtitle")}
      </p>

      <div className="mt-6">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <DealTable rows={q.data} />
        )}
      </div>
    </div>
  );
}

function missingFieldLabels(
  row: DealWithUnmaintainedFields,
  translate: (key: string) => string,
): string[] {
  return row.missing_fields.map((field) =>
    translate(`commissionDeals.unmaintainedFields.field.${field}`),
  );
}

function DealTable({ rows }: { rows: readonly DealWithUnmaintainedFields[] }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [...rows];
    return rows.filter((row) => {
      const missing = missingFieldLabels(row, t).join(" ");
      return `${row.property_label ?? ""} ${missing}`.toLowerCase().includes(term);
    });
  }, [rows, search, t]);

  const view = useTableView(filtered, {
    initialSort: "property",
    initialDir: "asc",
    initialPageSize: 10,
    resetKey: search,
    sortValue: (row, key) => {
      if (key === "notarisedOn") return row.notarised_on ?? "";
      if (key === "missing") return row.missing_fields.length;
      return row.property_label ?? "";
    },
  });

  if (rows.length === 0) return <EmptyState title={t("unmaintainedFields.empty")} />;

  return (
    <div className="space-y-3">
      <Input
        className="max-w-sm"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("unmaintainedFields.searchPlaceholder")}
        aria-label={t("unmaintainedFields.searchPlaceholder")}
      />

      {view.pageRows.length === 0 ? (
        <EmptyState title={t("unmaintainedFields.noMatch")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableColumnHeader
                  column="property"
                  sort={view.sort}
                  dir={view.dir}
                  onSort={view.toggleSort}
                >
                  {t("unmaintainedFields.column.property")}
                </SortableColumnHeader>
                <SortableColumnHeader
                  column="notarisedOn"
                  sort={view.sort}
                  dir={view.dir}
                  onSort={view.toggleSort}
                >
                  {t("unmaintainedFields.column.notarisedOn")}
                </SortableColumnHeader>
                <SortableColumnHeader
                  column="missing"
                  sort={view.sort}
                  dir={view.dir}
                  onSort={view.toggleSort}
                >
                  {t("unmaintainedFields.column.missing")}
                </SortableColumnHeader>
                <TableHead>{t("unmaintainedFields.column.open")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.pageRows.map((row) => (
                <TableRow key={row.deal_id}>
                  <TableCell>
                    <Link
                      className="font-medium text-foreground underline underline-offset-2"
                      to="/commission-deals/$id"
                      params={{ id: row.deal_id }}
                    >
                      {row.property_label ?? t("unmaintainedFields.noLabel")}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.notarised_on ? formatDate(row.notarised_on) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {missingFieldLabels(row, t).join(", ")}
                  </TableCell>
                  <TableCell>
                    {row.property_external_id && (
                      <a
                        className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2"
                        href={propstackUnitUrl(row.property_external_id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink aria-hidden className="size-3.5" />
                        {t("unmaintainedFields.openInPropstack")}
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {view.total > 0 && (
        <TablePagination
          page={view.page}
          totalPages={view.totalPages}
          pageSize={view.pageSize}
          total={view.total}
          from={view.from}
          to={view.to}
          onPage={view.setPage}
          onPageSize={view.setPageSize}
        />
      )}
    </div>
  );
}
