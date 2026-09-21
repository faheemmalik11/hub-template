import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { FieldErrorText, RequiredStern } from "@/components/ui/form-field";
import { fieldError, customerSchema } from "@/lib/forms/customer-schema";
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
import { useCreateCustomer, useCustomers, useCompanies, useCustomerInvoiceTotals } from "@/data";
import { errorText, formatEUR } from "@/lib/data/format";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyChip } from "@/components/documents/badges";
import { type FilterField } from "@/components/data-table/filter-fields";
import { FilterPills } from "@/components/data-table/filter-pills";
import { FilterPopover } from "@/components/data-table/filter-popover";
import { SortableColumnHeader } from "@/components/data-table/sortable-column-header";
import { ListToolbar } from "@/components/records/list-toolbar";
import { TablePagination } from "@/components/data-table/table-pagination";
import { useTableView } from "@/lib/use-table-view";
import { useTranslation } from "@/lib/i18n";
import { pageTitle } from "@/config/brand";

/** "Any company", the neutral value of the company filter. */
const ALL = "__alle";

export const Route = createFileRoute("/customers/")({
  head: () => ({ meta: [{ title: pageTitle("Kunden") }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const [company, setCompany] = useState(ALL);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyWithoutEmail, setOnlyWithoutEmail] = useState(false);

  const customersQ = useCustomers();
  const totalsQ = useCustomerInvoiceTotals();
  const companiesQ = useCompanies();
  const companyById = useMemo(
    () => new Map((companiesQ.data ?? []).map((g) => [g.id, g])),
    [companiesQ.data],
  );

  // Totals arrive pre-aggregated from Postgres (view v_customer_invoice_totals) instead of being
  // grouped in the browser out of every outgoing invoice. The view applies this screen's own two
  // rules -- cancellations and drafts are not revenue, overdue means open and past due -- so they
  // are no longer re-derived here. `summenBereit` still gates the numbers: this query is separate
  // from the customer list the skeleton waits on, and a fabricated 0,00 EUR reads as settled fact.
  const totalsReady = totalsQ.data !== undefined;
  const totals =
    totalsQ.data ?? new Map<string, { total: number; count: number; overdue: number }>();

  // Search covers every column the table actually shows. It used to match the name only, so a
  // customer you could see by their e-mail address or their Gesellschaft code could not be found by
  // either -- you had to already know the name you were looking for.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (customersQ.data ?? []).filter((k) => {
      if (company !== ALL && companyById.get(k.company_id)?.code !== company) {
        return false;
      }
      if (onlyWithoutEmail && k.email?.trim()) return false;
      // Overdue is a fact about the customer's invoices, so it comes from the totals view rather
      // than from the customer row. Until that query settles nothing is known to be overdue, and
      // filtering on an empty map would empty the list instead of narrowing it.
      if (onlyOverdue && (totals.get(k.id)?.overdue ?? 0) === 0) return false;
      if (!q) return true;
      return [k.name, k.email, companyById.get(k.company_id)?.code]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [customersQ.data, search, companyById, company, onlyWithoutEmail, onlyOverdue, totals]);

  const view = useTableView(filtered, {
    initialSort: "name",
    initialDir: "asc",
    resetKey: `${search}|${company}|${onlyOverdue}|${onlyWithoutEmail}`,
    sortValue: (k, key) => {
      const s = totals.get(k.id) ?? { total: 0, count: 0, overdue: 0 };
      switch (key) {
        case "gesellschaft":
          return companyById.get(k.company_id)?.code ?? "";
        case "summe":
          return s.total;
        case "anzahl":
          return s.count;
        case "ueberfaellig":
          return s.overdue;
        default:
          return k.name ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "name", label: t("customers.list.col.name") },
    { value: "gesellschaft", label: t("customers.list.col.gesellschaft") },
    { value: "anzahl", label: t("customers.list.col.rechnungen") },
    { value: "summe", label: t("customers.list.col.betrag") },
    { value: "ueberfaellig", label: t("customers.list.col.ueberfaellig") },
  ];

  // Every company that actually has a customer, so the filter offers the ones that can return a
  // row rather than the whole company list.
  const companyOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const k of customersQ.data ?? []) {
      const code = companyById.get(k.company_id)?.code;
      if (code) codes.add(code);
    }
    return [...codes].sort((a, b) => a.localeCompare(b));
  }, [customersQ.data, companyById]);

  const overdueTotal = useMemo(
    () => (customersQ.data ?? []).filter((k) => (totals.get(k.id)?.overdue ?? 0) > 0).length,
    [customersQ.data, totals],
  );
  const withoutEmailTotal = useMemo(
    () => (customersQ.data ?? []).filter((k) => !k.email?.trim()).length,
    [customersQ.data],
  );

  // -----------------------------------------------------------------------------------------
  // Filters, declared as data. FilterPopover itself knows nothing about customers, and the chips
  // below are fed from this same array so the two cannot drift apart.
  // -----------------------------------------------------------------------------------------
  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "gesellschaft",
      label: t("customers.list.col.gesellschaft"),
      value: company,
      defaultValue: ALL,
      options: [
        { value: ALL, label: t("customers.list.filter.gesellschaftAlle") },
        ...companyOptions.map((code) => ({ value: code, label: code })),
      ],
      onChange: setCompany,
    },
    {
      kind: "toggle",
      key: "ueberfaellig",
      fieldLabel: t("customers.list.col.ueberfaellig"),
      // Kept offered even at zero: inside the popover it costs no surface area, and a filter that
      // appears and disappears is harder to trust than one that comes back empty.
      label: t("customers.list.filter.nurUeberfaellig", { count: overdueTotal }),
      value: onlyOverdue,
      onChange: setOnlyOverdue,
    },
    {
      kind: "toggle",
      key: "ohneEmail",
      fieldLabel: t("customers.list.col.email"),
      // A customer with no address on file cannot be sent an invoice, which is the whole point of
      // the record, so this is a worklist rather than a curiosity.
      label: t("customers.list.filter.ohneEmail", { count: withoutEmailTotal }),
      value: onlyWithoutEmail,
      onChange: setOnlyWithoutEmail,
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

  return (
    <div>
      {/* Title, search and every control on ONE row, the same header the other master-data lists
          carry. The heading used to sit in its own block with a sentence of description under it
          and the search on a row below that. Below `sm` the row still stacks. */}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <h1
          data-tour="customers-header"
          className="shrink-0 text-2xl font-semibold tracking-tight text-foreground"
        >
          {t("customers.list.title")}
        </h1>
        <ListToolbar
          dataTour="customers-toolbar"
          className="sm:ml-auto"
          value={search}
          onValueChange={setSearch}
          placeholder={t("customers.list.search")}
          actions={
            <>
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("customers.list.filter.button"),
                  title: t("customers.list.filter.title"),
                  reset: t("customers.list.filter.reset"),
                }}
                mobileExtra={mobileSortField}
              />
              <NewerCustomerDialog />
            </>
          }
        />
      </div>
      {/* What is narrowing the list, spelled out. The trigger's badge says how many filters are on
          but never which, and reading a list wrong because a filter was left set is the failure
          this prevents. */}
      <FilterPills className="mt-3" fields={filterFields} />

      {customersQ.isError ? (
        <div className="mt-4">
          <ErrorState error={customersQ.error} onRetry={() => customersQ.refetch()} />
        </div>
      ) : customersQ.isLoading ? (
        <div className="mt-4">
          <TableSkeleton rows={8} cols={5} />
        </div>
      ) : (
        <div data-tour="customers-list">
          {/* Desktop/tablet: real table. Below `sm`, replaced with one card per customer instead —
              same fields, laid out top-to-bottom rather than across 6 columns. */}
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {/* Sorting sits on the headers, where the column being sorted and the control
                      that sorts it are the same thing, rather than in a separate toolbar widget. */}
                  <SortableColumnHeader
                    column="name"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    className="min-w-[200px]"
                  >
                    {t("customers.list.col.name")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="gesellschaft"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                  >
                    {t("customers.list.col.gesellschaft")}
                  </SortableColumnHeader>
                  <TableHead>{t("customers.list.col.email")}</TableHead>
                  <SortableColumnHeader
                    column="anzahl"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("customers.list.col.rechnungen")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="summe"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("customers.list.col.betrag")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="ueberfaellig"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("customers.list.col.ueberfaellig")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((k) => {
                  const s = totals.get(k.id) ?? { total: 0, count: 0, overdue: 0 };
                  return (
                    <TableRow
                      key={k.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/customers/$id", params: { id: k.id } })}
                    >
                      <TableCell className="min-w-[200px] font-medium text-foreground">
                        {k.name}
                      </TableCell>
                      <TableCell>
                        <CompanyChip code={companyById.get(k.company_id)?.code ?? null} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {totalsReady ? s.count : <Skeleton className="ml-auto h-4 w-8" />}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {totalsReady ? (
                          formatEUR(s.total)
                        ) : (
                          <Skeleton className="ml-auto h-4 w-24" />
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {!totalsReady ? (
                          <Skeleton className="ml-auto h-4 w-8" />
                        ) : s.overdue > 0 ? (
                          <span className="text-destructive">{s.overdue}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {view.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {t("customers.list.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {view.total === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {t("customers.list.empty")}
              </p>
            ) : (
              view.pageRows.map((k) => {
                const s = totals.get(k.id) ?? { total: 0, count: 0, overdue: 0 };
                return (
                  <div
                    key={k.id}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={() => navigate({ to: "/customers/$id", params: { id: k.id } })}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{k.name}</div>
                        <div className="mt-1.5">
                          <CompanyChip code={companyById.get(k.company_id)?.code ?? null} />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-medium tabular-nums text-foreground">
                          {totalsReady ? (
                            formatEUR(s.total)
                          ) : (
                            <Skeleton className="ml-auto h-4 w-24" />
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                          {t("customers.list.col.rechnungen")}:{" "}
                          {totalsReady ? s.count : <Skeleton className="h-3 w-6" />}
                        </div>
                      </div>
                    </div>
                    {k.email && (
                      <p className="mt-2 truncate text-sm text-muted-foreground">{k.email}</p>
                    )}
                    {totalsReady && s.overdue > 0 && (
                      <p className="mt-2 text-xs text-destructive">
                        {t("customers.list.col.ueberfaellig")}: {s.overdue}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {!customersQ.isError && !customersQ.isLoading && view.total > 0 && (
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

type NewCustomer = {
  companyId: string;
  isCompany: boolean;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressZip: string;
  addressCity: string;
  vatId: string;
};

const LEER: NewCustomer = {
  companyId: "",
  isCompany: true,
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  addressStreet: "",
  addressZip: "",
  addressCity: "",
  vatId: "",
};

function NewerCustomerDialog() {
  const { t } = useTranslation();
  const companiesQ = useCompanies();
  const companies = companiesQ.data ?? [];
  const create = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewCustomer>(LEER);
  const [error, setError] = useState<Record<string, string>>({});
  // Clearing the message as the field is corrected, rather than only on the next submit: an error
  // that stays under a field you just fixed reads as "still wrong".
  const setF = <K extends keyof NewCustomer>(k: K, v: NewCustomer[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setError((prev) => (prev[k] ? { ...prev, [k]: "" } : prev));
  };

  function submit() {
    const checked = customerSchema(t, { addressRequired: false }).safeParse(form);
    if (!checked.success) {
      // Every message at once, each under its own field. The toast stays as a second signal
      // for anyone whose eyes are on the button rather than the form.
      setError(fieldError(checked.error));
      toast.error(t("customers.list.toast.formularUnvollstaendig"));
      return;
    }
    const name = form.name.trim();
    const clean = (v: string) => (v.trim() === "" ? null : v.trim());
    create.mutate(
      {
        companyId: form.companyId,
        isCompany: form.isCompany,
        name,
        contactPerson: clean(form.contactPerson),
        email: clean(form.email),
        phone: clean(form.phone),
        addressStreet: clean(form.addressStreet),
        addressZip: clean(form.addressZip),
        addressCity: clean(form.addressCity),
        vatId: clean(form.vatId),
      },
      {
        onSuccess: () => {
          toast.success(t("customers.list.toast.angelegt"));
          setForm(LEER);
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            t("customers.list.toast.anlegenFehlgeschlagen", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {t("customers.list.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("customers.list.neu.title")}</DialogTitle>
          <DialogDescription>{t("customers.list.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              {t("customers.list.neu.gesellschaft")} <RequiredStern />
            </Label>
            {/* Marked like every other required field on this form. It is the first control and has
                no default, so it is the one most likely to be missing, and without the star and the
                message the submit toast pointed at fields marked in red while nothing was red. */}
            <Combobox
              value={form.companyId}
              onValueChange={(v) => setF("companyId", v)}
              options={companies.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` }))}
              placeholder={t("customers.list.neu.gesellschaftPlaceholder")}
              invalid={!!error.companyId}
            />
            <FieldErrorText text={error.companyId} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              checked={form.isCompany}
              onCheckedChange={(v) => setF("isCompany", v)}
              id="is-company"
            />
            <Label htmlFor="is-company" className="text-sm font-normal text-muted-foreground">
              {t("customers.list.neu.istFirma")}
            </Label>
          </div>
          <NewField
            label={t("customers.detail.field.name")}
            value={form.name}
            onChange={(v) => setF("name", v)}
            required
            error={error.name}
            placeholder={t("customers.detail.beispiel.name")}
            full
          />
          {form.isCompany && (
            <NewField
              label={t("customers.detail.field.ansprechpartner")}
              value={form.contactPerson}
              onChange={(v) => setF("contactPerson", v)}
              full
            />
          )}
          <NewField
            label={t("customers.detail.field.strasse")}
            value={form.addressStreet}
            onChange={(v) => setF("addressStreet", v)}
            error={error.addressStreet}
            placeholder={t("customers.detail.beispiel.strasse")}
            full
          />
          <NewField
            label={t("customers.detail.field.plz")}
            value={form.addressZip}
            onChange={(v) => setF("addressZip", v)}
            error={error.addressZip}
            placeholder={t("customers.detail.beispiel.plz")}
          />
          <NewField
            label={t("customers.detail.field.ort")}
            value={form.addressCity}
            onChange={(v) => setF("addressCity", v)}
            error={error.addressCity}
            placeholder={t("customers.detail.beispiel.ort")}
          />
          <NewField
            label={t("customers.detail.field.ustId")}
            value={form.vatId}
            onChange={(v) => setF("vatId", v)}
          />
          <NewField
            label={t("customers.detail.field.telefon")}
            value={form.phone}
            onChange={(v) => setF("phone", v)}
          />
          <NewField
            label={t("customers.detail.field.email")}
            value={form.email}
            onChange={(v) => setF("email", v)}
            error={error.email}
            placeholder={t("customers.detail.beispiel.email")}
            full
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("customers.list.neu.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("customers.list.neu.anlege") : t("customers.list.neu.anlegen")}
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
  required,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
  required?: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className={full ? "space-y-1 sm:col-span-2" : "space-y-1"}>
      <Label className="text-xs text-muted-foreground">
        {label} {required && <RequiredStern />}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-required={required}
        aria-invalid={!!error}
        // A red outline as well as the message: the message answers "what is wrong", the outline
        // answers "where", which is the half a toast could never do.
        className={error ? "border-destructive focus-visible:ring-destructive/30" : undefined}
      />
      <FieldErrorText text={error} />
    </div>
  );
}
