import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { FeldFehlerText, PflichtStern } from "@/components/ui/form-field";
import { feldFehler, kundeSchema } from "@/lib/forms/kunde-schema";
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
import { useCreateCustomer, useCustomers, useGesellschaften, useKundeRechnungSummen } from "@/data";
import { fehlerText, formatEUR } from "@/lib/data/format";
import { ErrorState, TableSkeleton } from "@/components/belege/query-states";
import { Skeleton } from "@/components/ui/skeleton";
import { GesellschaftChip } from "@/components/belege/badges";
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
const ALLE = "__alle";

export const Route = createFileRoute("/kunden/")({
  head: () => ({ meta: [{ title: pageTitle("Kunden") }] }),
  component: KundenPage,
});

function KundenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [suche, setSuche] = useState("");

  const [gesellschaft, setGesellschaft] = useState(ALLE);
  const [nurUeberfaellig, setNurUeberfaellig] = useState(false);
  const [nurOhneEmail, setNurOhneEmail] = useState(false);

  const kundenQ = useCustomers();
  const summenQ = useKundeRechnungSummen();
  const gesellschaftenQ = useGesellschaften();
  const gesellschaftById = useMemo(
    () => new Map((gesellschaftenQ.data ?? []).map((g) => [g.id, g])),
    [gesellschaftenQ.data],
  );

  // Totals arrive pre-aggregated from Postgres (view v_customer_invoice_totals) instead of being
  // grouped in the browser out of every outgoing invoice. The view applies this screen's own two
  // rules -- cancellations and drafts are not revenue, overdue means open and past due -- so they
  // are no longer re-derived here. `summenBereit` still gates the numbers: this query is separate
  // from the customer list the skeleton waits on, and a fabricated 0,00 EUR reads as settled fact.
  const summenBereit = summenQ.data !== undefined;
  const summen =
    summenQ.data ?? new Map<string, { summe: number; anzahl: number; ueberfaellig: number }>();

  // Search covers every column the table actually shows. It used to match the name only, so a
  // customer you could see by their e-mail address or their Gesellschaft code could not be found by
  // either -- you had to already know the name you were looking for.
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (kundenQ.data ?? []).filter((k) => {
      if (gesellschaft !== ALLE && gesellschaftById.get(k.company_id)?.code !== gesellschaft) {
        return false;
      }
      if (nurOhneEmail && k.email?.trim()) return false;
      // Overdue is a fact about the customer's invoices, so it comes from the totals view rather
      // than from the customer row. Until that query settles nothing is known to be overdue, and
      // filtering on an empty map would empty the list instead of narrowing it.
      if (nurUeberfaellig && (summen.get(k.id)?.ueberfaellig ?? 0) === 0) return false;
      if (!q) return true;
      return [k.name, k.email, gesellschaftById.get(k.company_id)?.code]
        .filter(Boolean)
        .some((feld) => String(feld).toLowerCase().includes(q));
    });
  }, [kundenQ.data, suche, gesellschaftById, gesellschaft, nurOhneEmail, nurUeberfaellig, summen]);

  const view = useTableView(gefiltert, {
    initialSort: "name",
    initialDir: "asc",
    resetKey: `${suche}|${gesellschaft}|${nurUeberfaellig}|${nurOhneEmail}`,
    sortValue: (k, key) => {
      const s = summen.get(k.id) ?? { summe: 0, anzahl: 0, ueberfaellig: 0 };
      switch (key) {
        case "gesellschaft":
          return gesellschaftById.get(k.company_id)?.code ?? "";
        case "summe":
          return s.summe;
        case "anzahl":
          return s.anzahl;
        case "ueberfaellig":
          return s.ueberfaellig;
        default:
          return k.name ?? "";
      }
    },
  });

  const sortColumns = [
    { value: "name", label: t("kunden.list.col.name") },
    { value: "gesellschaft", label: t("kunden.list.col.gesellschaft") },
    { value: "anzahl", label: t("kunden.list.col.rechnungen") },
    { value: "summe", label: t("kunden.list.col.betrag") },
    { value: "ueberfaellig", label: t("kunden.list.col.ueberfaellig") },
  ];

  // Every company that actually has a customer, so the filter offers the ones that can return a
  // row rather than the whole company list.
  const gesellschaftOptionen = useMemo(() => {
    const codes = new Set<string>();
    for (const k of kundenQ.data ?? []) {
      const code = gesellschaftById.get(k.company_id)?.code;
      if (code) codes.add(code);
    }
    return [...codes].sort((a, b) => a.localeCompare(b));
  }, [kundenQ.data, gesellschaftById]);

  const ueberfaelligGesamt = useMemo(
    () => (kundenQ.data ?? []).filter((k) => (summen.get(k.id)?.ueberfaellig ?? 0) > 0).length,
    [kundenQ.data, summen],
  );
  const ohneEmailGesamt = useMemo(
    () => (kundenQ.data ?? []).filter((k) => !k.email?.trim()).length,
    [kundenQ.data],
  );

  // -----------------------------------------------------------------------------------------
  // Filters, declared as data. FilterPopover itself knows nothing about customers, and the chips
  // below are fed from this same array so the two cannot drift apart.
  // -----------------------------------------------------------------------------------------
  const filterFields: FilterField[] = [
    {
      kind: "select",
      key: "gesellschaft",
      label: t("kunden.list.col.gesellschaft"),
      value: gesellschaft,
      defaultValue: ALLE,
      options: [
        { value: ALLE, label: t("kunden.list.filter.gesellschaftAlle") },
        ...gesellschaftOptionen.map((code) => ({ value: code, label: code })),
      ],
      onChange: setGesellschaft,
    },
    {
      kind: "toggle",
      key: "ueberfaellig",
      fieldLabel: t("kunden.list.col.ueberfaellig"),
      // Kept offered even at zero: inside the popover it costs no surface area, and a filter that
      // appears and disappears is harder to trust than one that comes back empty.
      label: t("kunden.list.filter.nurUeberfaellig", { count: ueberfaelligGesamt }),
      value: nurUeberfaellig,
      onChange: setNurUeberfaellig,
    },
    {
      kind: "toggle",
      key: "ohneEmail",
      fieldLabel: t("kunden.list.col.email"),
      // A customer with no address on file cannot be sent an invoice, which is the whole point of
      // the record, so this is a worklist rather than a curiosity.
      label: t("kunden.list.filter.ohneEmail", { count: ohneEmailGesamt }),
      value: nurOhneEmail,
      onChange: setNurOhneEmail,
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
          {t("kunden.list.title")}
        </h1>
        <ListToolbar
          dataTour="customers-toolbar"
          className="sm:ml-auto"
          value={suche}
          onValueChange={setSuche}
          placeholder={t("kunden.list.search")}
          actions={
            <>
              <FilterPopover
                fields={filterFields}
                labels={{
                  button: t("kunden.list.filter.button"),
                  title: t("kunden.list.filter.title"),
                  reset: t("kunden.list.filter.reset"),
                }}
                mobileExtra={mobileSortField}
              />
              <NeuerKundeDialog />
            </>
          }
        />
      </div>
      {/* What is narrowing the list, spelled out. The trigger's badge says how many filters are on
          but never which, and reading a list wrong because a filter was left set is the failure
          this prevents. */}
      <FilterPills className="mt-3" fields={filterFields} />

      {kundenQ.isError ? (
        <div className="mt-4">
          <ErrorState error={kundenQ.error} onRetry={() => kundenQ.refetch()} />
        </div>
      ) : kundenQ.isLoading ? (
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
                    {t("kunden.list.col.name")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="gesellschaft"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                  >
                    {t("kunden.list.col.gesellschaft")}
                  </SortableColumnHeader>
                  <TableHead>{t("kunden.list.col.email")}</TableHead>
                  <SortableColumnHeader
                    column="anzahl"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("kunden.list.col.rechnungen")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="summe"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("kunden.list.col.betrag")}
                  </SortableColumnHeader>
                  <SortableColumnHeader
                    column="ueberfaellig"
                    sort={view.sort}
                    dir={view.dir}
                    onSort={view.toggleSort}
                    align="right"
                  >
                    {t("kunden.list.col.ueberfaellig")}
                  </SortableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.pageRows.map((k) => {
                  const s = summen.get(k.id) ?? { summe: 0, anzahl: 0, ueberfaellig: 0 };
                  return (
                    <TableRow
                      key={k.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/kunden/$id", params: { id: k.id } })}
                    >
                      <TableCell className="min-w-[200px] font-medium text-foreground">
                        {k.name}
                      </TableCell>
                      <TableCell>
                        <GesellschaftChip code={gesellschaftById.get(k.company_id)?.code ?? null} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {summenBereit ? s.anzahl : <Skeleton className="ml-auto h-4 w-8" />}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {summenBereit ? (
                          formatEUR(s.summe)
                        ) : (
                          <Skeleton className="ml-auto h-4 w-24" />
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {!summenBereit ? (
                          <Skeleton className="ml-auto h-4 w-8" />
                        ) : s.ueberfaellig > 0 ? (
                          <span className="text-destructive">{s.ueberfaellig}</span>
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
                      {t("kunden.list.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {view.total === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                {t("kunden.list.empty")}
              </p>
            ) : (
              view.pageRows.map((k) => {
                const s = summen.get(k.id) ?? { summe: 0, anzahl: 0, ueberfaellig: 0 };
                return (
                  <div
                    key={k.id}
                    className="cursor-pointer rounded-xl border border-border bg-card p-4"
                    onClick={() => navigate({ to: "/kunden/$id", params: { id: k.id } })}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{k.name}</div>
                        <div className="mt-1.5">
                          <GesellschaftChip
                            code={gesellschaftById.get(k.company_id)?.code ?? null}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-medium tabular-nums text-foreground">
                          {summenBereit ? (
                            formatEUR(s.summe)
                          ) : (
                            <Skeleton className="ml-auto h-4 w-24" />
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                          {t("kunden.list.col.rechnungen")}:{" "}
                          {summenBereit ? s.anzahl : <Skeleton className="h-3 w-6" />}
                        </div>
                      </div>
                    </div>
                    {k.email && (
                      <p className="mt-2 truncate text-sm text-muted-foreground">{k.email}</p>
                    )}
                    {summenBereit && s.ueberfaellig > 0 && (
                      <p className="mt-2 text-xs text-destructive">
                        {t("kunden.list.col.ueberfaellig")}: {s.ueberfaellig}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {!kundenQ.isError && !kundenQ.isLoading && view.total > 0 && (
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

type NeuKunde = {
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

const LEER: NeuKunde = {
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

function NeuerKundeDialog() {
  const { t } = useTranslation();
  const gesellschaftenQ = useGesellschaften();
  const gesellschaften = gesellschaftenQ.data ?? [];
  const create = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NeuKunde>(LEER);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  // Clearing the message as the field is corrected, rather than only on the next submit: an error
  // that stays under a field you just fixed reads as "still wrong".
  const setF = <K extends keyof NeuKunde>(k: K, v: NeuKunde[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setFehler((prev) => (prev[k] ? { ...prev, [k]: "" } : prev));
  };

  function anlegen() {
    const geprueft = kundeSchema(t, { adressePflicht: false }).safeParse(form);
    if (!geprueft.success) {
      // Every message at once, each under its own field. The toast stays as a second signal
      // for anyone whose eyes are on the button rather than the form.
      setFehler(feldFehler(geprueft.error));
      toast.error(t("kunden.list.toast.formularUnvollstaendig"));
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
          toast.success(t("kunden.list.toast.angelegt"));
          setForm(LEER);
          setOpen(false);
        },
        onError: (e) =>
          toast.error(
            t("kunden.list.toast.anlegenFehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" /> {t("kunden.list.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("kunden.list.neu.title")}</DialogTitle>
          <DialogDescription>{t("kunden.list.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              {t("kunden.list.neu.gesellschaft")} <PflichtStern />
            </Label>
            {/* Marked like every other required field on this form. It is the first control and has
                no default, so it is the one most likely to be missing, and without the star and the
                message the submit toast pointed at fields marked in red while nothing was red. */}
            <Combobox
              value={form.companyId}
              onValueChange={(v) => setF("companyId", v)}
              options={gesellschaften.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` }))}
              placeholder={t("kunden.list.neu.gesellschaftPlaceholder")}
              invalid={!!fehler.companyId}
            />
            <FeldFehlerText text={fehler.companyId} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch
              checked={form.isCompany}
              onCheckedChange={(v) => setF("isCompany", v)}
              id="is-company"
            />
            <Label htmlFor="is-company" className="text-sm font-normal text-muted-foreground">
              {t("kunden.list.neu.istFirma")}
            </Label>
          </div>
          <NeuField
            label={t("kunden.detail.field.name")}
            value={form.name}
            onChange={(v) => setF("name", v)}
            required
            error={fehler.name}
            placeholder={t("kunden.detail.beispiel.name")}
            full
          />
          {form.isCompany && (
            <NeuField
              label={t("kunden.detail.field.ansprechpartner")}
              value={form.contactPerson}
              onChange={(v) => setF("contactPerson", v)}
              full
            />
          )}
          <NeuField
            label={t("kunden.detail.field.strasse")}
            value={form.addressStreet}
            onChange={(v) => setF("addressStreet", v)}
            error={fehler.addressStreet}
            placeholder={t("kunden.detail.beispiel.strasse")}
            full
          />
          <NeuField
            label={t("kunden.detail.field.plz")}
            value={form.addressZip}
            onChange={(v) => setF("addressZip", v)}
            error={fehler.addressZip}
            placeholder={t("kunden.detail.beispiel.plz")}
          />
          <NeuField
            label={t("kunden.detail.field.ort")}
            value={form.addressCity}
            onChange={(v) => setF("addressCity", v)}
            error={fehler.addressCity}
            placeholder={t("kunden.detail.beispiel.ort")}
          />
          <NeuField
            label={t("kunden.detail.field.ustId")}
            value={form.vatId}
            onChange={(v) => setF("vatId", v)}
          />
          <NeuField
            label={t("kunden.detail.field.telefon")}
            value={form.phone}
            onChange={(v) => setF("phone", v)}
          />
          <NeuField
            label={t("kunden.detail.field.email")}
            value={form.email}
            onChange={(v) => setF("email", v)}
            error={fehler.email}
            placeholder={t("kunden.detail.beispiel.email")}
            full
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("kunden.list.neu.cancel")}
          </Button>
          <Button onClick={anlegen} disabled={create.isPending}>
            {create.isPending ? t("kunden.list.neu.anlege") : t("kunden.list.neu.anlegen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NeuField({
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
        {label} {required && <PflichtStern />}
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
      <FeldFehlerText text={error} />
    </div>
  );
}
