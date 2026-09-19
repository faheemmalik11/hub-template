import { useMemo, useState } from "react";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Combobox } from "../../ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { TablePagination } from "../../components/feedback/table-pagination";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type { SupplierListAdapter, SupplierListRow } from "../../adapters/supplier-list";
import { SortControl } from "./sort-control";
import { useTableView } from "./use-table-view";
import { englishSupplierListLabels, type SupplierListLabels } from "./labels";

const STATUS_ACTIVE = "active";
const STATUS_DELETED = "deleted";
const STATUS_ALL = "all";

export interface SupplierListPageProps {
  adapter: SupplierListAdapter;
  labels?: SupplierListLabels;
  formatters?: Formatters;
}

function formatIban(iban: string | null): string {
  if (!iban) return "—";
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export function SupplierListPage({
  adapter,
  labels = englishSupplierListLabels,
  formatters = englishFormatters,
}: SupplierListPageProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(STATUS_ACTIVE);
  const [missingAddressOnly, setMissingAddressOnly] = useState(false);

  const suppliersQuery = adapter.useSuppliers(status !== STATUS_ACTIVE);
  const suppliers = useMemo(() => suppliersQuery.data ?? [], [suppliersQuery.data]);

  const missingAddressCount = useMemo(
    () => suppliers.filter((s) => !s.address?.trim()).length,
    [suppliers],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (status === STATUS_DELETED && !s.deleted_at) return false;
      if (status === STATUS_ACTIVE && s.deleted_at) return false;
      if (missingAddressOnly && s.address?.trim()) return false;
      return !term || `${s.name} ${s.address ?? ""}`.toLowerCase().includes(term);
    });
  }, [suppliers, search, status, missingAddressOnly]);

  const view = useTableView(filtered, {
    initialSort: "name",
    initialDirection: "asc",
    resetKey: `${search}|${status}|${missingAddressOnly}`,
    sortValue: (row, key) => {
      switch (key) {
        case "bookedTotal":
          return row.bookedTotal;
        case "createdAt":
          return row.created_at ?? "";
        default:
          return row.name ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "name", label: labels.columnName },
    { value: "bookedTotal", label: labels.columnBooked },
    { value: "createdAt", label: "Created" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        {adapter.canCreate && <NewSupplierDialog adapter={adapter} labels={labels} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
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
          value={status}
          onValueChange={setStatus}
          className="w-full sm:w-40"
          options={[
            { value: STATUS_ACTIVE, label: labels.statusActive },
            { value: STATUS_DELETED, label: labels.statusDeleted },
            { value: STATUS_ALL, label: labels.statusAll },
          ]}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={missingAddressOnly}
            onChange={(event) => setMissingAddressOnly(event.target.checked)}
            className="size-4"
          />
          {labels.missingAddressToggle(missingAddressCount)}
        </label>
        <SortControl
          columns={sortColumns}
          sort={view.sort}
          direction={view.direction}
          onSort={view.setSort}
          onDirection={view.setDirection}
          labels={labels}
        />
      </div>

      {suppliersQuery.error ? (
        <div className="mt-4">
          <ErrorState error={suppliersQuery.error} onRetry={() => {}} />
        </div>
      ) : suppliersQuery.loading ? (
        <div className="mt-4">
          <TableSkeleton rows={6} columns={5} />
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden overflow-x-auto rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{labels.columnName}</TableHead>
                  <TableHead>{labels.columnAddress}</TableHead>
                  <TableHead>{labels.columnIban}</TableHead>
                  <TableHead className="text-right">{labels.columnBooked}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((supplier) => (
                  <SupplierRow
                    key={supplier.id}
                    supplier={supplier}
                    adapter={adapter}
                    labels={labels}
                    formatters={formatters}
                  />
                ))}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                      {labels.empty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {view.total === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {labels.empty}
              </p>
            ) : (
              view.pageRows.map((supplier) => (
                <div
                  key={supplier.id}
                  className="cursor-pointer rounded-xl border border-border bg-card p-4"
                  onClick={() => adapter.openSupplier(supplier.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{supplier.name}</div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {supplier.address?.trim() || labels.noAddress}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-medium tabular-nums text-foreground">
                      {formatters.formatMoney(supplier.bookedTotal)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {!suppliersQuery.error && !suppliersQuery.loading && view.total > 0 && (
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

function SupplierRow({
  supplier,
  adapter,
  labels,
  formatters,
}: {
  supplier: SupplierListRow;
  adapter: SupplierListAdapter;
  labels: SupplierListLabels;
  formatters: Formatters;
}) {
  return (
    <TableRow
      className={cn("cursor-pointer", supplier.deleted_at && "opacity-60")}
      onClick={() => adapter.openSupplier(supplier.id)}
    >
      <TableCell className="font-medium text-foreground">
        <span className="inline-flex items-center gap-1.5">
          {supplier.name}
          {supplier.deleted_at && (
            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {labels.deletedBadge}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell
        className={cn(
          "text-sm",
          supplier.address?.trim() ? "text-muted-foreground" : "text-amber-700",
        )}
      >
        {supplier.address?.trim() || labels.noAddress}
      </TableCell>
      <TableCell className="font-mono text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {formatIban(supplier.iban)}
          {supplier.hasUnconfirmedAccount && (
            <TriangleAlert
              className="size-3.5 shrink-0 text-amber-600"
              aria-label={labels.unconfirmedAccount}
            />
          )}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="font-medium tabular-nums text-foreground">
          {formatters.formatMoney(supplier.bookedTotal)}
        </div>
        <div className="text-xs text-muted-foreground">
          {labels.columnInvoiceCount(supplier.invoiceCount)}
        </div>
      </TableCell>
    </TableRow>
  );
}

function NewSupplierDialog({
  adapter,
  labels,
}: {
  adapter: SupplierListAdapter;
  labels: SupplierListLabels;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function create() {
    if (!name.trim()) {
      setError(labels.nameRequired);
      return;
    }
    setError("");
    setIsCreating(true);
    try {
      const created = await adapter.createSupplier({ name: name.trim() });
      toast.success(labels.createdToast);
      setName("");
      setOpen(false);
      adapter.openSupplier(created.id);
    } catch (e) {
      toast.error(labels.createFailedToast(readableErrorMessage(e, "")));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {labels.newSupplierButton}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.newSupplierTitle}</DialogTitle>
          <DialogDescription>{labels.newSupplierDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{labels.nameFieldLabel}</Label>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            placeholder={labels.nameFieldPlaceholder}
            aria-invalid={!!error}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button onClick={create} disabled={isCreating}>
            {isCreating ? labels.creating : labels.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
