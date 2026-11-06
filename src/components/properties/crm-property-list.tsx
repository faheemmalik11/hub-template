import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { usePropertyListings } from "@/data";
import type { ListedProperty } from "@/data";
import { PERMISSIONS } from "@/config/permissions";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, formatEUR } from "@/lib/data/format";
import { usePaginationLabels } from "@/lib/use-pagination-labels";
import { useTableView } from "@/lib/use-table-view";
import { TablePagination } from "@/kit/components/feedback/table-pagination";
import { useTranslation } from "@/lib/i18n";
import { listingTypeLabel } from "@/components/properties/listing-labels";
import { SyncPropertiesButton } from "@/components/properties/sync-properties-button";

const ALL_STATUSES = "__all__";

function latestSync(listings: ListedProperty[]): string | null {
  const syncedAt = listings.flatMap((listing) =>
    listing.crm_synced_at ? [listing.crm_synced_at] : [],
  );
  return syncedAt.length === 0
    ? null
    : syncedAt.reduce((latest, one) => (one > latest ? one : latest));
}

function matchesSearch(listing: ListedProperty, needle: string): boolean {
  if (!needle) return true;
  return [listing.name, listing.address, listing.broker_name, listing.external_id]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(needle));
}

function listingSortValue(listing: ListedProperty, key: string): string | number {
  return key === "name" ? listing.name : (listing.crm_updated_at ?? "");
}

export function CrmPropertyList() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const listingsQ = usePropertyListings();
  const [status, setStatus] = useState(ALL_STATUSES);
  const [search, setSearch] = useState("");

  const listings = useMemo(() => listingsQ.data ?? [], [listingsQ.data]);
  const statuses = useMemo(
    () =>
      [
        ...new Set(listings.map((listing) => listing.crm_status).filter(Boolean)),
      ].sort() as string[],
    [listings],
  );
  const visibleListings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return listings.filter(
      (listing) =>
        (status === ALL_STATUSES || listing.crm_status === status) &&
        matchesSearch(listing, needle),
    );
  }, [listings, status, search]);
  const lastSyncedAt = latestSync(listings);
  const view = useTableView(visibleListings, {
    sortValue: listingSortValue,
    initialSort: "updated",
    initialDir: "desc",
    resetKey: `${status}|${search}`,
  });
  const paginationLabels = usePaginationLabels();

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            data-tour="properties-header"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            {t("properties.list.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("propertyListings.subtitle")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {can(PERMISSIONS.masterDataWrite) && <SyncPropertiesButton />}
          <span className="text-xs text-muted-foreground">
            {lastSyncedAt
              ? t("propertyListings.lastSynced", { when: formatDateTime(lastSyncedAt) })
              : t("propertyListings.neverSynced")}
          </span>
        </div>
      </div>

      <div data-tour="properties-toolbar" className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("propertyListings.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>{t("propertyListings.allStatuses")}</SelectItem>
            {statuses.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t("propertyListings.count", { count: visibleListings.length, total: listings.length })}
        </span>
      </div>

      <div data-tour="properties-list" data-focus="list" className="mt-4">
        {listingsQ.isLoading ? (
          <TableSkeleton cols={7} />
        ) : listingsQ.error ? (
          <ErrorState error={listingsQ.error} onRetry={() => listingsQ.refetch()} />
        ) : listings.length === 0 ? (
          <EmptyState
            title={t("propertyListings.emptyTitle")}
            hint={t("propertyListings.emptyHint")}
          />
        ) : (
          <>
            <ListingsTable listings={view.pageRows} />
            {view.total > 0 && (
              <div className="mt-3">
                <TablePagination
                  page={view.page}
                  totalPages={view.totalPages}
                  pageSize={view.pageSize}
                  total={view.total}
                  from={view.from}
                  to={view.to}
                  onPage={view.setPage}
                  onPageSize={view.setPageSize}
                  labels={paginationLabels}
                  divider={false}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListingsTable({ listings }: { listings: ListedProperty[] }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("propertyListings.columns.property")}</TableHead>
            <TableHead>{t("propertyListings.columns.status")}</TableHead>
            <TableHead>{t("propertyListings.columns.type")}</TableHead>
            <TableHead className="text-right">{t("propertyListings.columns.price")}</TableHead>
            <TableHead>{t("propertyListings.columns.commission")}</TableHead>
            <TableHead>{t("propertyListings.columns.broker")}</TableHead>
            <TableHead>{t("propertyListings.columns.updated")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => (
            <TableRow key={listing.id}>
              <TableCell>
                <Link
                  to="/properties/$code"
                  params={{ code: listing.code }}
                  className="font-medium text-foreground hover:underline"
                >
                  {listing.name}
                </Link>
                {listing.address && listing.address !== listing.name && (
                  <div className="text-xs text-muted-foreground">{listing.address}</div>
                )}
              </TableCell>
              <TableCell>
                {listing.crm_status ? (
                  <Badge variant="secondary">{listing.crm_status}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {listing.archived_in_crm && (
                  <Badge variant="outline" className="ml-1">
                    {t("propertyListings.archived")}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {listingTypeLabel(t, listing.property_type, listing.marketing_type)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {listing.sold_price !== null ? (
                  <>
                    {formatEUR(listing.sold_price)}
                    <div className="text-xs text-muted-foreground">
                      {t("propertyListings.soldOn", { date: formatDate(listing.sold_on) })}
                    </div>
                  </>
                ) : listing.asking_price === null ? (
                  "—"
                ) : (
                  formatEUR(listing.asking_price)
                )}
              </TableCell>
              <TableCell className="text-sm">{listing.commission_note ?? "—"}</TableCell>
              <TableCell className="text-sm">{listing.broker_name ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(listing.crm_updated_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
