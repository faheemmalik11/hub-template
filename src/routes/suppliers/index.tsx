import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Merge, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateSupplier,
  useSupplierDocumentTotals,
  useSuppliers,
  useMergeSuppliers,
  useSupplierDuplicates,
  useSupplierBankAccounts,
} from "@/data";
import {
  recogniseTaxIds,
  isPayableIBAN,
  type TaxId,
  errorText,
  formatDate,
  formatEUR,
  formatIBAN,
} from "@/lib/data/format";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { TablePagination } from "@/components/data-table/table-pagination";
import { SupplierLink } from "@/components/suppliers/supplier-link";
import { InvoiceSummaryCell } from "@/components/records/invoice-summary-cell";
import { MergeSuggestions } from "@/components/suppliers/merge-suggestions";
import { SupplierIbanCell } from "@/components/suppliers/supplier-iban-cell";
import { ListToolbar } from "@/components/records/list-toolbar";
import { BankAccountDrafts } from "@/components/suppliers/bank-account-drafts";
import type { BankAccountDraft } from "@/components/suppliers/bank-account-draft";
import type { MergeSuggestion } from "@/components/suppliers/types";
import { useTableView } from "@/lib/use-table-view";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";
import type { Supplier, SupplierBankAccount, SupplierDuplicateGroup } from "@/lib/data/types";

export const Route = createFileRoute("/suppliers/")({
  head: () => ({ meta: [{ title: pageTitle("Lieferanten") }] }),
  component: SuppliersPage,
});

/**
 * The status axis of the filter popover.
 *
 * "aktiv" and "geloescht" are the two states the old pair of switches could express, unchanged:
 * deleted suppliers are either out of the way or they ARE the list, because mixed in, a deleted row
 * is a dimmed row among all the others and the list stops being a usable answer to either
 * question.
 * "alle" is the one addition. With both other options behind the same control, the case for
 * refusing to show both at once got weaker than the case for being able to.
 */
type StatusFilter = "aktiv" | "geloescht" | "alle";
const STATUS_DEFAULT: StatusFilter = "aktiv";

function SuppliersPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>(STATUS_DEFAULT);
  const [onlyWithoutAddress, setOnlyWithoutAddress] = useState(false);
  const suppliersQ = useSuppliers({ includeDeleted: status !== "aktiv" });
  const totalsQ = useSupplierDocumentTotals();
  const duplicatesQ = useSupplierDuplicates();
  // Unscoped, same reason as the history query above: one request feeds every row's default account
  // instead of one query per supplier.
  const bankAccountsQ = useSupplierBankAccounts();
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);

  // Totals AND the invoice frequency now come pre-aggregated from Postgres (view
  // v_supplier_invoice_totals). This screen used to pull every invoice in the system for two
  // reasons: to sum per supplier, and to keep the raw rows so computeInvoiceFrequency() could read
  // their dates. The view computes both, so neither reason survives.
  const totalsReady = totalsQ.data !== undefined;
  // useMemo, not a bare `??`: the fallback Map is a new identity on every render, so a
  // useMemo depending on it re-ran every time even when nothing had changed.
  const totals = useMemo(
    () =>
      totalsQ.data ?? new Map<string, { total: number; count: number; avgDays: number | null }>(),
    [totalsQ.data],
  );

  // The invoice frequency (v_supplier_invoice_totals.avg_days_between, still carried by `summen`) is no
  // longer a column here. Most suppliers have one invoice or none, so the column was mostly
  // "zu wenig Daten", noise in every row to serve the few that had a number. It stays where it
  // can be read in context, on the supplier detail page, which computes its own.

  // Most recent IBAN change per supplier, within the "recently changed" window. This is what
  // turns a row's IBAN amber (briefing Screen 12: "show the previous and new IBAN side by side",
  // now said in the hover text rather than by a second badge).

  // The account each supplier is actually paid on, read from the flag rather than re-derived by
  // comparing suppliers.iban against every account row (migration 20260827170000). The count of
  // OTHER accounts a supplier bills from is deliberately not shown: the column states the default
  // and nothing more, and the rest are read on the supplier detail page.
  const defaultAccounts = useMemo(() => {
    const map = new Map<string, SupplierBankAccount>();
    for (const account of bankAccountsQ.data ?? []) {
      if (account.is_default) map.set(account.supplier_id, account);
    }
    return map;
  }, [bankAccountsQ.data]);

  // Suppliers carrying an account nobody has vouched for yet. This replaces the old "IBAN
  // geändert" warning, which was derived from the history table: it fired on a swap that may have
  // been made deliberately in the Hub months ago, and stayed silent when the pipeline brought in
  // an account off an invoice, which is the case actually worth looking at.
  const mitNewAccount = useMemo(() => {
    const set = new Set<string>();
    for (const account of bankAccountsQ.data ?? []) {
      if (account.is_active && !account.confirmed_at) set.add(account.supplier_id);
    }
    return set;
  }, [bankAccountsQ.data]);

  // How many suppliers have no address at all. Most of them do not, and until now that was only
  // visible as a column full of "—" with no way to see the size of it or work through them.
  const withoutAddressTotal = useMemo(
    () => suppliers.filter((l) => !l.address?.trim()).length,
    [suppliers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((l) => {
      if (status === "geloescht" && !l.deleted_at) return false;
      if (onlyWithoutAddress && l.address?.trim()) return false;
      return !q || `${l.name} ${l.address ?? ""}`.toLowerCase().includes(q);
    });
  }, [suppliers, search, onlyWithoutAddress, status]);

  const view = useTableView(filtered, {
    // BY NAME, not by last-updated. Duplicate suppliers are the thing this screen is most often
    // scanned for, and two rows for the same company are created at different times — so a
    // recency sort is precisely the order that keeps them apart. Sorted by name they land next to
    // each other, which is the fallback for whatever the automatic detection still misses.
    initialSort: "name",
    initialDir: "asc",
    resetKey: `${search}|${onlyWithoutAddress}|${status}`,
    sortValue: (l, key) => {
      const s = totals.get(l.id) ?? { total: 0, count: 0 };
      switch (key) {
        case "summe":
          return s.total;
        case "createdAt":
          return l.created_at ?? "";
        case "updatedAt":
          return l.updated_at ?? l.created_at ?? "";
        default:
          return l.name ?? "";
      }
    },
  });

  // The sortable columns, named once. The table headers below and the mobile sort control inside
  // the filter sheet both read this list, so the two can't offer different columns.
  const sortColumns = [
    { value: "name", label: t("suppliers.list.col.name") },
    { value: "summe", label: t("suppliers.list.col.verbucht") },
    { value: "createdAt", label: t("suppliers.list.col.createdAt") },
    { value: "updatedAt", label: t("suppliers.list.col.updatedAt") },
  ];

  // ---------------------------------------------------------------------------------------------
  // Filters, declared as data. This array is the repository-specific half of the filter feature.
  // FilterPopover itself knows nothing about suppliers, and a sibling hub replaces this list.
  // ---------------------------------------------------------------------------------------------
  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "status",
      label: t("suppliers.list.filter.status"),
      value: status,
      defaultValue: STATUS_DEFAULT,
      options: [
        { value: "alle", label: t("suppliers.list.filter.statusAlle") },
        { value: "aktiv", label: t("suppliers.list.filter.statusAktiv") },
        { value: "geloescht", label: t("suppliers.list.filter.statusGeloescht") },
      ],
      onChange: (v) => setStatus(v as StatusFilter),
    },
    {
      kind: "toggle",
      key: "ohneAdresse",
      fieldLabel: t("suppliers.list.filter.adresse"),
      // Kept offered even at zero, unlike the old switch: inside the popover it costs no surface
      // area, and a filter that appears and disappears is harder to trust than one that comes back
      // empty.
      label: t("suppliers.list.filter.ohneAdresse", { count: withoutAddressTotal }),
      value: onlyWithoutAddress,
      onChange: setOnlyWithoutAddress,
    },
  ];

  // Sorting is a table-header affordance and the table is desktop-only, so without this the mobile
  // card list could not be sorted at all. Same columns the headers expose.
  const mobileSortField = (
    <div className="grid grid-cols-1 gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{t("common.sort.label")}</span>
        <Combobox
          value={view.sort}
          onValueChange={view.setSort}
          className="w-full"
          ariaLabel={t("common.sort.label")}
          options={sortColumns}
        />
      </label>
      <button
        type="button"
        onClick={() => view.setDir(view.dir === "asc" ? "desc" : "asc")}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
      >
        {view.dir === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
        {view.dir === "asc" ? t("common.sort.asc") : t("common.sort.desc")}
      </button>
    </div>
  );

  // Derived once per row and shared by both the desktop table and the mobile cards below, so a
  // future change to one of these lookups can't drift between the two renderings.
  const rows = useMemo(
    () =>
      view.pageRows.map((l) => {
        const iban = defaultAccounts.get(l.id)?.iban ?? l.iban;
        // Amber when an account is waiting to be vouched for, wherever on this supplier it sits:
        // the row is a prompt to open the supplier, not a statement about this one number.
        const ibanWarning = mitNewAccount.has(l.id)
          ? t("suppliers.detail.bankkonten.neu.hinweis")
          : undefined;
        return {
          supplier: l,
          iban,
          total: totals.get(l.id)?.total ?? 0,
          count: totals.get(l.id)?.count ?? 0,
          ibanWarning,
          deleted: !!l.deleted_at,
        };
      }),
    [view.pageRows, totals, mitNewAccount, defaultAccounts, t],
  );

  return (
    <div>
      {/* Title, search and every control on ONE row. The heading used to sit in its own block
          with a sentence of description under it and the search on a row below that, so three rows
          of chrome stood between the reader and the table. Below `sm` the row still stacks. */}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h1
          data-tour="suppliers-header"
          className="shrink-0 text-2xl font-semibold tracking-tight text-foreground"
        >
          {t("suppliers.list.title")}
        </h1>
        <ListToolbar
          dataTour="suppliers-toolbar"
          className="sm:ml-auto"
          value={search}
          onValueChange={setSearch}
          placeholder={t("suppliers.list.search")}
          actions={
            <>
              <SuppliersMergeSuggestions
                duplicates={duplicatesQ.data ?? []}
                suppliers={suppliers}
              />
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("suppliers.list.filter.button"),
                  title: t("suppliers.list.filter.title"),
                  reset: t("suppliers.list.filter.reset"),
                }}
                mobileExtra={mobileSortField}
              />
              <NewerSupplierDialog />
            </>
          }
        />
      </div>

      {suppliersQ.isError ? (
        <div className="mt-4">
          <ErrorState error={suppliersQ.error} onRetry={() => suppliersQ.refetch()} />
        </div>
      ) : suppliersQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={7} />
        </div>
      ) : (
        <div data-tour="suppliers-list" className="mt-4">
          {/* Below `sm`, cards replace the 8-column table entirely rather than relying on any
            horizontal scroll -- table-internal or page-level. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {/* Sorting moved off the toolbar and onto the headers, where the column being
                      sorted and the control that sorts it are the same thing. */}
                  <SortableColumnHeader
                    column="name"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="min-w-[200px]"
                  >
                    {t("suppliers.list.col.name")}
                  </SortableColumnHeader>
                  <TableHead>{t("suppliers.list.col.adresse")}</TableHead>
                  <TableHead className="w-[220px]">{t("suppliers.list.col.iban")}</TableHead>
                  <TableHead>{t("suppliers.list.col.ustId")}</TableHead>
                  <SortableColumnHeader
                    column="summe"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("suppliers.list.col.verbucht")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="createdAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[120px]"
                  >
                    {t("suppliers.list.col.createdAt")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="updatedAt"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="w-[130px]"
                  >
                    {t("suppliers.list.col.updatedAt")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ supplier: l, iban, total, count, ibanWarning, deleted }) => {
                  return (
                    <TableRow
                      key={l.id}
                      className={`cursor-pointer ${deleted ? "opacity-50" : ""}`}
                      onClick={() => navigate({ to: "/suppliers/$id", params: { id: l.id } })}
                    >
                      <TableCell className="min-w-[200px] font-medium text-foreground">
                        {l.name}
                        {deleted && (
                          <span className="ml-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t("suppliers.list.geloescht")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words text-sm text-muted-foreground">
                        {l.address ?? "—"}
                      </TableCell>
                      <TableCell className="w-[240px] whitespace-nowrap text-foreground">
                        <SupplierIbanCell
                          iban={iban ? formatIBAN(iban) : null}
                          warning={ibanWarning}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <TaxIdCell vatId={l.vat_id} />
                      </TableCell>
                      <TableCell>
                        <InvoiceSummaryCell
                          count={count}
                          amount={total}
                          formatAmount={formatEUR}
                          formatCount={(count) => t("suppliers.list.belegeCount", { count })}
                          loading={!totalsReady}
                        />
                      </TableCell>
                      <TableCell className="w-[120px] whitespace-normal text-sm text-muted-foreground">
                        {formatDate(l.created_at)}
                      </TableCell>
                      <TableCell className="w-[130px] whitespace-normal text-sm text-muted-foreground">
                        {formatDate(l.updated_at ?? l.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      {t("suppliers.list.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 sm:hidden">
            {rows.map(({ supplier: l, iban, total, count, ibanWarning, deleted }) => {
              return (
                <div
                  key={l.id}
                  className={cn(
                    "cursor-pointer rounded-xl border border-border bg-card p-4",
                    deleted && "opacity-50",
                  )}
                  onClick={() => navigate({ to: "/suppliers/$id", params: { id: l.id } })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {l.name}
                        {deleted && (
                          <span className="ml-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t("suppliers.list.geloescht")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{l.address ?? "—"}</div>
                    </div>
                    <InvoiceSummaryCell
                      className="shrink-0"
                      count={count}
                      amount={total}
                      formatAmount={formatEUR}
                      formatCount={(count) => t("suppliers.list.belegeCount", { count })}
                      loading={!totalsReady}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <SupplierIbanCell
                      iban={iban ? formatIBAN(iban) : null}
                      warning={ibanWarning}
                      className={ibanWarning ? undefined : "text-muted-foreground"}
                    />
                    {l.vat_id && <TaxIdCell vatId={l.vat_id} />}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                    <span>
                      {t("suppliers.list.col.createdAt")} {formatDate(l.created_at)}
                    </span>
                    <span>
                      {t("suppliers.list.col.updatedAt")} {formatDate(l.updated_at ?? l.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
            {view.total === 0 && (
              <p className="rounded-xl border border-border bg-card px-5 py-12 text-center text-muted-foreground">
                {t("suppliers.list.empty")}
              </p>
            )}
          </div>
        </div>
      )}

      {!suppliersQ.isError && !suppliersQ.isLoading && view.total > 0 && (
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

// The supplier's own fields. Bank details are no longer among them: an account is a record of its
// own, a supplier can have several, and three loose fields in this grid could only ever describe
// one. They live in BankAccountDrafts below.
type NewSupplier = {
  name: string;
  address: string;
  vat_id: string;
  phone: string;
  email: string;
  contact_person: string;
};

const LEER: NewSupplier = {
  name: "",
  address: "",
  vat_id: "",
  phone: "",
  email: "",
  contact_person: "",
};

function NewerSupplierDialog() {
  const { t } = useTranslation();
  const create = useCreateSupplier();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewSupplier>(LEER);
  const [accounts, setAccounts] = useState<BankAccountDraft[]>([]);
  const setF = (k: keyof NewSupplier, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  // Anything typed into an IBAN has to be payable before the form will submit. The accounts table
  // refuses the rest with a CHECK error, and by then the supplier already exists.
  const invalidIban = accounts.some((k) => k.iban.trim() !== "" && !isPayableIBAN(k.iban));

  function reset() {
    setForm(LEER);
    setAccounts([]);
  }

  function submit() {
    const name = form.name.trim();
    if (!name) {
      toast.error(t("suppliers.list.toast.namePflicht"));
      return;
    }
    if (invalidIban) {
      toast.error(t("suppliers.list.neu.ibanUngueltig"));
      return;
    }
    // Only the name is required; empty optional fields become null.
    const clean = (v: string) => (v.trim() === "" ? null : v.trim());
    const filled = accounts.filter((k) => k.iban.trim() !== "");
    const standard = filled.find((k) => k.isDefault) ?? filled[0] ?? null;
    create.mutate(
      {
        name,
        address: clean(form.address),
        vat_id: clean(form.vat_id),
        // The default account is what `suppliers.iban` holds, because that column is still what the
        // payment path reads. The others are written as account rows by the mutation.
        iban: standard ? clean(standard.iban) : null,
        bic: standard ? clean(standard.bic) : null,
        bank_name: standard ? clean(standard.bank_name) : null,
        phone: clean(form.phone),
        email: clean(form.email),
        contact_person: clean(form.contact_person),
        bankAccounts: filled
          .filter((k) => k !== standard)
          .map((k) => ({ iban: k.iban, bic: clean(k.bic), bank_name: clean(k.bank_name) })),
      },
      {
        onSuccess: () => {
          toast.success(t("suppliers.list.toast.angelegt"));
          reset();
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            t("suppliers.list.toast.anlegenFehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full gap-2 sm:w-auto">
          <Plus className="size-4" /> {t("suppliers.list.neu.button")}
        </Button>
      </DialogTrigger>
      {/* Radix focuses the first field when a dialog opens, which drops a caret into the
          IBAN before anyone has decided to type there. Focus goes to the panel instead,
          so Escape and Tab still work and no field looks half filled in. */}
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("suppliers.list.neu.title")}</DialogTitle>
          <DialogDescription>{t("suppliers.list.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("suppliers.list.neu.stammdaten")}
            </span>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <NewField
                label={t("suppliers.detail.field.name")}
                value={form.name}
                onChange={(v) => setF("name", v)}
                full
              />
              <NewField
                label={t("suppliers.detail.field.adresse")}
                value={form.address}
                onChange={(v) => setF("address", v)}
                full
              />
              <NewField
                label={t("suppliers.detail.field.ustId")}
                value={form.vat_id}
                onChange={(v) => setF("vat_id", v)}
              />
              <NewField
                label={t("suppliers.detail.field.telefon")}
                value={form.phone}
                onChange={(v) => setF("phone", v)}
              />
              <NewField
                label={t("suppliers.detail.field.email")}
                value={form.email}
                onChange={(v) => setF("email", v)}
              />
              <NewField
                label={t("suppliers.detail.field.ansprechpartner")}
                value={form.contact_person}
                onChange={(v) => setF("contact_person", v)}
                full
              />
            </div>
          </div>
          <BankAccountDrafts
            drafts={accounts}
            onChange={setAccounts}
            isPayable={isPayableIBAN}
            labels={{
              section: t("suppliers.detail.section.bankkonten"),
              hint: t("suppliers.list.neu.bankHinweis"),
              add: t("suppliers.list.neu.bankHinzufuegen"),
              iban: t("suppliers.detail.field.iban"),
              bic: t("suppliers.detail.field.bic"),
              bank: t("suppliers.detail.field.bank"),
              makeDefault: t("suppliers.list.neu.alsStandard"),
              isDefault: t("suppliers.detail.bankkonten.standard"),
              remove: t("suppliers.list.neu.bankEntfernen"),
              invalidIban: t("suppliers.list.neu.ibanUngueltig"),
              accountNumber: (n) => t("suppliers.list.neu.bankNummer", { number: n }),
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("suppliers.list.neu.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending || invalidIban}>
            {create.isPending ? t("suppliers.list.neu.anlege") : t("suppliers.list.neu.anlegen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewField({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * The "USt-IdNr" cell.
 *
 * The column promises a VAT id; the field holds whatever was extracted near it. Rather than print
 * the raw string as though it were all one thing, show the identifier that was actually recognised,
 * say which kind it is when it is not a VAT id, and mark a value that matches nothing so it is not
 * mistaken for a verified number. See erkenneSteuerId() for the recognition itself.
 */
/**
 * One recognised identifier, as a chip. Shared by the cell and by the popover behind "+N".
 *
 * The explanation is the app's own tooltip, not the browser's `title`. A native tooltip looks
 * different from every other explanation in the Hub, waits about a second before appearing, and
 * cannot be styled or wrapped. Same treatment as the IBAN warning in the column beside it.
 */
function TaxIdChip({ id }: { id: TaxId }) {
  const { t } = useTranslation();
  const [chip, explanation] =
    id.art === "verdaechtig"
      ? [
          <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 font-mono text-xs font-medium text-amber-800">
            <TriangleAlert className="size-3 shrink-0" />
            {id.value}
          </span>,
          t("suppliers.list.steuerId.unbekanntTitle"),
        ]
      : id.art === "unbekannt"
        ? [
            // A real identifier of some other kind. Shown plainly, without claiming it is a VAT id.
            <span className="inline-flex w-fit items-center whitespace-nowrap rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {id.value}
            </span>,
            t("suppliers.list.steuerId.andereTitle"),
          ]
        : [
            <span className="inline-flex w-fit items-center whitespace-nowrap rounded-md bg-brand-wash px-2 py-0.5 font-mono text-xs font-medium text-brand-dark">
              {id.art === "steuernummer" && (
                <span className="me-1 font-sans font-normal text-muted-foreground">
                  {t("suppliers.list.steuerId.steuernummerKurz")}
                </span>
              )}
              {id.value}
            </span>,
            id.art === "ust"
              ? t("suppliers.list.steuerId.ustTitle")
              : t("suppliers.list.steuerId.steuernummerTitle"),
          ];
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent className="max-w-[18rem]">{explanation}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The "USt-IdNr" cell.
 *
 * The column promises a VAT id; the field holds whatever was extracted near it. Rather than print
 * the raw string as though it were all one thing, show the identifiers that were actually
 * recognised, say which kind each is when it is not a VAT id, and mark a value that matches nothing
 * so it is not mistaken for a verified number. See erkenneSteuerIds() for the recognition itself.
 *
 * A field routinely holds two identifiers (an Italian VAT id and a Polish one, a VAT id and a
 * Steuernummer). The second one used to be squeezed onto a 0.65rem line under the chip, which made
 * the row two lines tall and was barely readable. Now the first is the chip and the rest are behind
 * a "+N" that opens them, so every row is one line high whatever the field holds.
 */
function TaxIdCell({ vatId }: { vatId: string | null }) {
  const ids = useMemo(() => recogniseTaxIds(vatId), [vatId]);
  if (ids.length === 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <TaxIdChip id={ids[0]} />
      {ids.length > 1 && <FurtherTaxIds ids={ids} />}
    </div>
  );
}

/** The "+N" chip and the popover listing every identifier the field holds. */
function FurtherTaxIds({ ids }: { ids: TaxId[] }) {
  const { t } = useTranslation();
  return (
    // `modal`: the row underneath navigates on click, and a non-modal popover lets the click that
    // dismisses it fall straight through to that row, so closing the list opened the supplier.
    // A modal popover consumes the dismissing click, which is the whole behaviour wanted here.
    <Popover modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The row navigates on click; this must not.
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-pointer rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("suppliers.list.steuerId.weitere", { count: ids.length - 1 })}
        >
          +{ids.length - 1}
        </button>
      </PopoverTrigger>
      {/* Portalled, so a click inside never reaches the row underneath. */}
      <PopoverContent align="start" className="w-auto min-w-[12rem] p-2">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t("suppliers.list.steuerId.alleTitle")}
        </p>
        <div className="flex flex-col items-start gap-1.5">
          {ids.map((id, i) => (
            <TaxIdChip key={`${id.art}-${id.value}-${i}`} id={id} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * This hub's binding of `v_supplier_duplicates` (migration 0040) to the portable MergeSuggestions
 * band. Briefing Screen 12, "merge duplicate supplier records": groups sharing a name, VAT id or
 * tax number are offered for merging, never merged automatically.
 *
 * Everything repository-shaped lives here and nowhere in the component: the view's row shape, how a
 * match reason is worded, which record is proposed as the survivor, and the merge dialog itself.
 */
function SuppliersMergeSuggestions({
  duplicates,
  suppliers,
  className,
}: {
  duplicates: SupplierDuplicateGroup[];
  suppliers: Supplier[];
  className?: string;
}) {
  const { t } = useTranslation();

  // Resolved here rather than while rendering, so the count in the collapsed header and the rows
  // behind it are the same set. They were not before: the header counted every group the view
  // returned, while a group whose records are not in the current list (deleted ones, with the
  // status filter on "Aktiv") rendered as nothing, so "7 possible duplicates" sat over five rows.
  const groups = useMemo(() => {
    const byId = new Map(suppliers.map((l) => [l.id, l]));
    const keyLabel = new Map<SupplierDuplicateGroup["key_type"], string>([
      ["name", t("suppliers.list.duplicates.keyName")],
      ["vat_id", t("suppliers.list.duplicates.keyVatId")],
      ["steuernummer", t("suppliers.list.duplicates.keySteuernummer")],
    ]);
    const out: { suggestion: MergeSuggestion; members: Supplier[] }[] = [];
    for (const group of duplicates) {
      const members = group.ids.map((id) => byId.get(id)).filter((l): l is Supplier => !!l);
      if (members.length < 2) continue;
      out.push({
        members,
        suggestion: {
          id: `${group.key_type}-${group.key_value}`,
          suppliers: members.map((m) => ({ id: m.id, name: m.name })),
          reason: t("suppliers.list.duplicates.matchedBy", {
            key: keyLabel.get(group.key_type),
            value: group.key_value,
          }),
        },
      });
    }
    return out;
  }, [duplicates, suppliers, t]);

  const membersById = useMemo(
    () => new Map(groups.map((g) => [g.suggestion.id, g.members])),
    [groups],
  );

  return (
    <MergeSuggestions
      className={className}
      suggestions={groups.map((g) => g.suggestion)}
      labels={{
        title: t("suppliers.list.mergeSuggestions.title"),
        description: t("suppliers.list.mergeSuggestions.desc"),
      }}
      supplierLink={SupplierLink}
      renderAction={(suggestion) => {
        const members = membersById.get(suggestion.id) ?? [];
        // The FIRST record is proposed as the survivor and the second is the one merged away,
        // unchanged from the panel this replaces.
        const [first, ...rest] = members;
        if (!first || !rest[0]) return null;
        return <MergeConfirmation keep={first} merge={rest[0]} />;
      }}
    />
  );
}

/**
 * Merging asks first.
 *
 * Merge used to open the target picker, which is a form, not a question: from the suggestions list
 * the pair is already decided, so the picker asked you to re-choose what the row had just told you.
 * This states what will happen to which record and asks for a yes. The picker still exists for the
 * supplier detail page, where the other record genuinely has to be chosen.
 */
function MergeConfirmation({ keep, merge }: { keep: Supplier; merge: Supplier }) {
  const { t } = useTranslation();
  const mergeSuppliers = useMergeSuppliers();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Merge className="size-3.5" />
          {t("suppliers.list.duplicates.merge")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("suppliers.merge.confirm.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("suppliers.merge.confirm.desc", { fromDate: merge.name, target: keep.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("suppliers.merge.confirm.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              mergeSuppliers.mutate(
                { keepId: keep.id, mergeId: merge.id },
                {
                  onSuccess: () =>
                    toast.success(
                      t("suppliers.merge.toast.erfolgreich", {
                        name: merge.name,
                        target: keep.name,
                      }),
                    ),
                  onError: (e) =>
                    toast.error(t("suppliers.merge.toast.fehlgeschlagen", { error: errorText(e) })),
                },
              )
            }
          >
            {t("suppliers.merge.confirm.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
