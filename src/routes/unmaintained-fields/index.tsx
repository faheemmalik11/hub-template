import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { EmptyState, ErrorState } from "@/components/documents/query-states";
import { NoAccess } from "@/components/layout/no-access";
import { UNMAINTAINED_CRM_FIELDS } from "@/components/commission/unmaintained-crm-fields";
import type { UnmaintainedCrmField } from "@/components/commission/unmaintained-crm-fields";
import { Combobox } from "@/components/ui/combobox";
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
import type { DealWithUnmaintainedFields, UnmaintainedFieldsSort } from "@/data";
import { useAuth } from "@/lib/auth";
import { propstackUnitUrl } from "@/lib/crm/propstack";
import { formatDate } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const ALL_FIELDS = "all";

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

function missingFieldLabels(
  row: DealWithUnmaintainedFields,
  translate: (key: string) => string,
): string[] {
  return row.missing_fields.map((field) =>
    translate(`commissionDeals.unmaintainedFields.field.${field}`),
  );
}

function UnmaintainedFieldsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [missingField, setMissingField] = useState<UnmaintainedCrmField | null>(null);
  const [sort, setSort] = useState<UnmaintainedFieldsSort>("property_label");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const q = useDealsWithUnmaintainedFields({
    search,
    missingField,
    sort,
    ascending,
    page,
    pageSize,
  });

  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const sortBy = (column: string) => {
    const key = column as UnmaintainedFieldsSort;
    if (key === sort) {
      setAscending(!ascending);
    } else {
      setSort(key);
      setAscending(true);
    }
    setPage(1);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const changeMissingField = (value: string) => {
    setMissingField(value === ALL_FIELDS ? null : (value as UnmaintainedCrmField));
    setPage(1);
  };

  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {t("unmaintainedFields.title")}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {t("unmaintainedFields.subtitle")}
      </p>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-sm"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder={t("unmaintainedFields.searchPlaceholder")}
            aria-label={t("unmaintainedFields.searchPlaceholder")}
          />
          <Combobox
            value={missingField ?? ALL_FIELDS}
            onValueChange={changeMissingField}
            ariaLabel={t("unmaintainedFields.filterByField")}
            className="h-9 w-[260px]"
            options={[
              { value: ALL_FIELDS, label: t("unmaintainedFields.allFields") },
              ...UNMAINTAINED_CRM_FIELDS.map((field) => ({
                value: field,
                label: t(`commissionDeals.unmaintainedFields.field.${field}`),
              })),
            ]}
          />
        </div>

        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <Skeleton className="h-64 w-full" />
        ) : q.data.rows.length === 0 ? (
          <EmptyState
            title={
              search || missingField
                ? t("unmaintainedFields.noMatch")
                : t("unmaintainedFields.empty")
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableColumnHeader
                    column="property_label"
                    sort={sort}
                    dir={ascending ? "asc" : "desc"}
                    onSort={sortBy}
                  >
                    {t("unmaintainedFields.column.property")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="notarised_on"
                    sort={sort}
                    dir={ascending ? "asc" : "desc"}
                    onSort={sortBy}
                  >
                    {t("unmaintainedFields.column.notarisedOn")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="missing_count"
                    sort={sort}
                    dir={ascending ? "asc" : "desc"}
                    onSort={sortBy}
                  >
                    {t("unmaintainedFields.column.missing")}
                  </SortableColumnHeader>
                  <TableHead>{t("unmaintainedFields.column.open")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.rows.map((row) => (
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

        {total > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            from={from}
            to={to}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
}
