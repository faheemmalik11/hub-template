import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { Plus, Repeat, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
import {
  useCostAnalysisCategories,
  useCreateManualBooking,
  useCompanies,
  useManualBookings,
  useManualBookingTemplates,
  useProperties,
  useSoftDeleteManualBooking,
  useUpdateManualBooking,
  type ManualBookingInput,
} from "@/data";
import { ErrorState, TableSkeleton } from "@/components/documents/query-states";
import { errorText, formatEUR, parseDecimalInput } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import type { CostAnalysisCategory, ManualBooking, Property } from "@/lib/data/types";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/manual-bookings/")({
  head: () => ({ meta: [{ title: pageTitle("Manuelle Buchungen") }] }),
  component: ManualBookingsPage,
});

const LEER = "__none";
const ALL_COMPANIES = "__alle";

// Bounds for every year input on this screen. Not cosmetic: the year is interpolated into a date
// literal (`${year}-01-01`), and Postgres rejects a 1- to 3-digit year outright, which surfaced to
// the user as a raw 22008 error. Generous on purpose — a booking may legitimately be backdated or
// planned ahead, this only excludes values that cannot be a year at all.
const YEAR_MIN = 1900;
const YEAR_MAX = 2999;

const SORT_KEYS = ["zeitraumAsc", "zeitraumDesc", "betragDesc", "betragAsc", "kategorie"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isValidYear(raw: string): boolean {
  const n = Number(raw);
  return /^\d{4}$/.test(raw) && n >= YEAR_MIN && n <= YEAR_MAX;
}

function monthYearToPeriod(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

// Cost-side only (Briefing Screen 11): revenue arrives automatically from uploaded outgoing
// invoices instead (migration 0085), and the catch-all / "belongs in no evaluation line" rows
// are not a real BWA line a manual item could ever belong to. Same two-level label style as
// zuordnungsregeln's category
// Combobox (a fine tag's label carries its coarse group), reused here as its own small hook since
// the filter (revenue/catchall/nicht_guv excluded) differs from that screen's.
function useManualCategoryOptions(categories: CostAnalysisCategory[]): ComboboxOption[] {
  return useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (
      categories
        // Revenue lines are offered too now. They used to be filtered out because "revenue arrives
        // automatically from uploaded outgoing invoices" — but only FULLY BANK-MATCHED outgoing
        // invoices reach the evaluation, and this Hub has none at all, which left the one screen
        // built for "the P&L item with no receipt and no transaction" refusing to record the
        // commonest example of one. Catch-all and non-P&L rows stay excluded: they are not BWA lines
        // a manual item could belong to.
        .filter((c) => c.is_active && !c.is_catchall && !c.excluded_from_profit_and_loss)
        .map((c) => {
          const parent = c.parent_id ? byId.get(c.parent_id) : null;
          const label = parent ? `${parent.name} › ${c.name}` : c.name;
          return { value: c.id, label, keywords: `${c.code} ${c.name_en}` };
        })
        .sort((a, b) => a.label.localeCompare(b.label))
    );
  }, [categories]);
}

function propertyOptions(properties: Property[], noLabel: string): ComboboxOption[] {
  return [
    { value: LEER, label: noLabel },
    ...properties.map((o) => ({
      value: o.id,
      label: o.name ? `${o.code} · ${o.name}` : o.code,
      keywords: o.name ?? "",
    })),
  ];
}

function ManualBookingsPage() {
  const { t } = useTranslation();
  const MONTHS = t("reports.monate", { returnObjects: true }) as string[];
  const companiesQ = useCompanies();
  const categoriesQ = useCostAnalysisCategories();
  const propertiesQ = useProperties();
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortKey>("zeitraumAsc");
  const [companyId, setCompanyId] = useState<string>(ALL_COMPANIES);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  // The text the user is typing, kept separate from the committed `year`. Every keystroke used to
  // become a date literal: retyping "2026" walked through 2, 25 and 202, and the server answered
  // each one with a raw Postgres error on screen — five HTTP 400s for one edit. The field also
  // could not be cleared, because Number("") is falsy and the old handler fell back to the
  // previous year on every empty string.
  const [yearInput, setYearInput] = useState<string>(String(new Date().getFullYear()));

  const companies = companiesQ.data ?? [];
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-01`;

  const bookingsQ = useManualBookings(
    companyId === ALL_COMPANIES ? null : companyId,
    fromDate,
    toDate,
  );
  const templatesQ = useManualBookingTemplates(companyId === ALL_COMPANIES ? null : companyId);

  const categoriesById = useMemo(
    () => new Map((categoriesQ.data ?? []).map((c) => [c.id, c])),
    [categoriesQ.data],
  );
  const propertiesById = useMemo(
    () => new Map((propertiesQ.data ?? []).map((o) => [o.id, o])),
    [propertiesQ.data],
  );
  const companiesById = useMemo(
    () => new Map((companiesQ.data ?? []).map((g) => [g.id, g])),
    [companiesQ.data],
  );
  const templatesById = useMemo(
    () => new Map((templatesQ.data ?? []).map((b) => [b.id, b])),
    [templatesQ.data],
  );

  const monthLabel = (period: string) => {
    const m = Number(period.slice(5, 7));
    return `${MONTHS[m - 1] ?? m} ${period.slice(0, 4)}`;
  };

  // #10: the list was period-ascending, full stop — no search over the note, no way to sort by
  // amount or category, on a table that with "Alle Gesellschaften" plus recurring bookings runs to
  // (companies x categories x 12) rows for a single year.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (bookingsQ.data ?? []).filter((r) => {
      if (!q) return true;
      const category = categoriesById.get(r.category_id)?.name ?? "";
      const property = r.property_id ? (propertiesById.get(r.property_id)?.code ?? "") : "";
      const company = companiesById.get(r.company_id)?.code ?? "";
      return [r.note ?? "", category, property, company, monthLabel(r.period)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sorting === "betragDesc") return Math.abs(b.amount) - Math.abs(a.amount);
      if (sorting === "betragAsc") return Math.abs(a.amount) - Math.abs(b.amount);
      if (sorting === "kategorie") {
        return (categoriesById.get(a.category_id)?.name ?? "").localeCompare(
          categoriesById.get(b.category_id)?.name ?? "",
        );
      }
      if (sorting === "zeitraumDesc") return b.period.localeCompare(a.period);
      return a.period.localeCompare(b.period);
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsQ.data, search, sorting, categoriesById, propertiesById, companiesById, MONTHS]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {t("manualBookings.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("manualBookings.subtitle")}</p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <div data-tour="manual-bookings-scope" className="w-full space-y-1.5 sm:w-[220px]">
            <Label>{t("manualBookings.feld.gesellschaft")}</Label>
            <Combobox
              value={companyId}
              onValueChange={setCompanyId}
              options={[
                { value: ALL_COMPANIES, label: t("manualBookings.alleGesellschaften") },
                ...companies.map((g) => ({
                  value: g.id,
                  label: `${g.code} · ${g.name}`,
                  keywords: g.name,
                })),
              ]}
            />
          </div>
          <div className="w-[100px] space-y-1.5">
            <Label>{t("manualBookings.feld.jahr")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={yearInput}
              onChange={(e) => {
                const raw = e.target.value;
                setYearInput(raw);
                // Only a plausible 4-digit year reaches the query; anything else leaves the last
                // good year in place so the list keeps showing something real.
                const n = Number(raw);
                if (/^\d{4}$/.test(raw) && n >= YEAR_MIN && n <= YEAR_MAX) setYear(n);
              }}
              onBlur={() => setYearInput(String(year))}
              aria-invalid={!isValidYear(yearInput)}
            />
            {!isValidYear(yearInput) && (
              <p className="text-xs text-amber-700">
                {t("manualBookings.jahrUngueltig", {
                  fromDate: YEAR_MIN,
                  toDate: YEAR_MAX,
                  year: year,
                })}
              </p>
            )}
          </div>
          <div data-tour="manual-bookings-create">
            <BookingDialog
              defaultCompanyId={companyId === ALL_COMPANIES ? undefined : companyId}
              categories={categoriesQ.data ?? []}
              properties={propertiesQ.data ?? []}
            />
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-3xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("manualBookings.hinweis")}
      </p>

      {/* #10: search over the note/category/object/company, and a sort that is not just
          period-ascending. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div
          data-tour="manual-bookings-search"
          className="relative w-full flex-1 sm:w-auto sm:min-w-[240px]"
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("manualBookings.suche")}
            className="pl-9"
          />
        </div>
        <Combobox
          value={sorting}
          onValueChange={(v) => setSorting(v as SortKey)}
          className="w-full sm:w-[220px]"
          options={SORT_KEYS.map((k) => ({ value: k, label: t(`manualBookings.sort.${k}`) }))}
        />
      </div>

      <div data-tour="manual-bookings-table">
        {bookingsQ.isLoading ? (
          <div className="mt-6">
            <TableSkeleton rows={5} cols={companyId === ALL_COMPANIES ? 7 : 6} />
          </div>
        ) : bookingsQ.isError ? (
          <div className="mt-6">
            <ErrorState error={bookingsQ.error} onRetry={() => bookingsQ.refetch()} />
          </div>
        ) : (
          <>
            {/* Desktop/tablet: real table. Below `sm`, replaced with one card per booking instead —
              same fields, laid out top-to-bottom rather than in up to 7 columns. */}
            <div className="mt-6 hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {companyId === ALL_COMPANIES && (
                      <TableHead>{t("manualBookings.col.gesellschaft")}</TableHead>
                    )}
                    <TableHead>{t("manualBookings.col.zeitraum")}</TableHead>
                    <TableHead>{t("manualBookings.col.kategorie")}</TableHead>
                    <TableHead>{t("manualBookings.col.objekt")}</TableHead>
                    <TableHead>{t("manualBookings.col.notiz")}</TableHead>
                    <TableHead className="text-right">{t("manualBookings.col.betrag")}</TableHead>
                    <TableHead className="text-right">{t("manualBookings.col.aktionen")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const category = categoriesById.get(r.category_id);
                    const property = r.property_id ? propertiesById.get(r.property_id) : null;
                    const template = templatesById.get(r.source_id);
                    const company = companiesById.get(r.company_id);
                    return (
                      <TableRow key={`${r.source_id}_${r.period}`}>
                        {companyId === ALL_COMPANIES && (
                          <TableCell className="text-muted-foreground">
                            {company?.code ?? "—"}
                          </TableCell>
                        )}
                        <TableCell className="font-medium text-foreground">
                          {monthLabel(r.period)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{category?.name ?? "—"}</span>
                            {r.is_recurring && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Repeat className="size-3" />
                                {t("manualBookings.wiederkehrend")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {property ? property.code : "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {r.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatEUR(r.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {template && (
                            <BookingActions
                              booking={template}
                              categories={categoriesQ.data ?? []}
                              properties={propertiesQ.data ?? []}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={companyId === ALL_COMPANIES ? 7 : 6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        {t("manualBookings.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-6 space-y-3 sm:hidden">
              {rows.map((r) => {
                const category = categoriesById.get(r.category_id);
                const property = r.property_id ? propertiesById.get(r.property_id) : null;
                const template = templatesById.get(r.source_id);
                const company = companiesById.get(r.company_id);
                return (
                  <div
                    key={`${r.source_id}_${r.period}`}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {monthLabel(r.period)}
                          </span>
                          {r.is_recurring && (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Repeat className="size-3" />
                              {t("manualBookings.wiederkehrend")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">
                          {category?.name ?? "—"}
                        </div>
                        {companyId === ALL_COMPANIES && (
                          <div className="text-xs text-muted-foreground">
                            {company?.code ?? "—"}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right font-medium tabular-nums">
                        {formatEUR(r.amount)}
                      </div>
                    </div>
                    {(property ?? r.note) && (
                      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {property && (
                          <div>
                            {t("manualBookings.col.objekt")}: {property.code}
                          </div>
                        )}
                        {r.note && <div className="truncate">{r.note}</div>}
                      </div>
                    )}
                    {template && (
                      <div className="mt-3 border-t border-border pt-2">
                        <BookingActions
                          booking={template}
                          categories={categoriesQ.data ?? []}
                          properties={propertiesQ.data ?? []}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="rounded-xl border border-border bg-card py-8 text-center text-sm text-muted-foreground">
                  {t("manualBookings.empty")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BookingDialog({
  defaultCompanyId,
  categories,
  properties,
}: {
  defaultCompanyId?: string;
  categories: CostAnalysisCategory[];
  properties: Property[];
}) {
  const { t } = useTranslation();
  const MONTHS = t("reports.monate", { returnObjects: true }) as string[];
  const companiesQ = useCompanies();
  const create = useCreateManualBooking();
  const categoryOptions = useManualCategoryOptions(categories);

  const now = new Date();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [propertyId, setPropertyId] = useState<string>(LEER);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [endMonth, setEndMonth] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);

  function reset() {
    setCompanyId(defaultCompanyId ?? "");
    setCategoryId("");
    setPropertyId(LEER);
    const n = new Date();
    setMonth(n.getMonth() + 1);
    setYear(n.getFullYear());
    setAmount("");
    setNote("");
    setRecurring(false);
    setEndMonth(null);
    setEndYear(null);
  }

  const amountNum = parseDecimalInput(amount) ?? 0;
  // An end month without an end year must block save, not silently fall back to open-ended —
  // the user explicitly picked a month, so a missing year is an incomplete entry, not "no end".
  const endMonthWithoutYear = recurring && !!endMonth && !endYear;
  // An end BEFORE the start expands to zero months in every year, so the booking would exist in the
  // table and appear on no screen — not editable, not deletable, counted by nothing. The database
  // refuses it outright now (manual_bookings_recurrence_until_after_period); this states the same
  // rule where the user can act on it, so the constraint stays a backstop.
  const endBeforeStart =
    recurring &&
    !!endMonth &&
    !!endYear &&
    monthYearToPeriod(endMonth, endYear) < monthYearToPeriod(month, year);
  const yearInvalid =
    !isValidYear(String(year)) || (recurring && !!endYear && !isValidYear(String(endYear)));
  const invalid =
    !companyId ||
    !categoryId ||
    !amount.trim() ||
    !Number.isFinite(amountNum) ||
    amountNum === 0 ||
    endMonthWithoutYear ||
    endBeforeStart ||
    yearInvalid;

  function submit() {
    if (invalid) return;
    const input: ManualBookingInput = {
      company_id: companyId,
      category_id: categoryId,
      property_id: propertyId === LEER ? null : propertyId,
      period: monthYearToPeriod(month, year),
      amount: amountNum,
      note: note.trim() === "" ? null : note.trim(),
      is_recurring: recurring,
      recurrence_until:
        recurring && endMonth && endYear ? monthYearToPeriod(endMonth, endYear) : null,
    };
    create.mutate(input, {
      onSuccess: () => {
        toast.success(t("manualBookings.toast.gespeichert"));
        setOpen(false);
        reset();
      },
      onError: (e) =>
        toast.error(
          t("manualBookings.toast.fehlgeschlagen", {
            error: errorText(e),
          }),
        ),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Reseed on OPEN as well as close. `companyId` was seeded from the prop with useState, which
        // reads it once — on page mount, when the filter is still "Alle Gesellschaften" and the prop
        // is undefined. Picking a company in the filter and then clicking "Neue Buchung" therefore
        // opened the dialog with an empty company.
        reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          {t("manualBookings.neu.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("manualBookings.neu.title")}</DialogTitle>
          <DialogDescription>{t("manualBookings.neu.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("manualBookings.feld.gesellschaft")}</Label>
            <Combobox
              value={companyId}
              onValueChange={setCompanyId}
              options={(companiesQ.data ?? []).map((g) => ({
                value: g.id,
                label: `${g.code} · ${g.name}`,
                keywords: g.name,
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("manualBookings.feld.kategorie")}</Label>
            <Combobox value={categoryId} onValueChange={setCategoryId} options={categoryOptions} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("manualBookings.feld.monat")}</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("manualBookings.feld.jahr")}</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || year)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("manualBookings.feld.objekt")}</Label>
            <Combobox
              value={propertyId}
              onValueChange={setPropertyId}
              options={propertyOptions(properties, t("manualBookings.keinObjekt"))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("manualBookings.feld.betrag")}</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
            {/* The sign rule was enforced but never stated: 0 is rejected, a negative is accepted
                and silently flips the line in the P&L. */}
            <p className="text-xs text-muted-foreground">{t("manualBookings.betragHinweis")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("manualBookings.feld.notiz")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("manualBookings.feld.wiederkehrend")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("manualBookings.feld.wiederkehrendHint")}
              </p>
            </div>
            <Switch checked={recurring} onCheckedChange={setRecurring} />
          </div>
          {recurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("manualBookings.feld.bisMonat")}</Label>
                <Select
                  value={endMonth ? String(endMonth) : LEER}
                  onValueChange={(v) => setEndMonth(v === LEER ? null : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEER}>{t("manualBookings.offenesEnde")}</SelectItem>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("manualBookings.feld.bisJahr")}</Label>
                <Input
                  type="number"
                  disabled={!endMonth}
                  value={endYear ?? ""}
                  onChange={(e) => setEndYear(Number(e.target.value) || null)}
                />
              </div>
            </div>
          )}
        </div>
        {endBeforeStart && (
          <p className="text-xs text-amber-700">{t("manualBookings.endeVorStart")}</p>
        )}
        {endMonthWithoutYear && (
          <p className="text-xs text-amber-700">{t("manualBookings.bisJahrFehlt")}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("assignmentRules.action.abbrechen")}
          </Button>
          <Button disabled={invalid || create.isPending} onClick={submit}>
            {t("manualBookings.neu.speichern")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingActions({
  booking,
  categories,
  properties,
}: {
  booking: ManualBooking;
  categories: CostAnalysisCategory[];
  properties: Property[];
}) {
  const { t } = useTranslation();
  const update = useUpdateManualBooking();
  const remove = useSoftDeleteManualBooking();
  const categoryOptions = useManualCategoryOptions(categories);

  const MONTHS = t("reports.monate", { returnObjects: true }) as string[];

  const [editOpen, setEditOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(booking.category_id);
  const [propertyId, setPropertyId] = useState(booking.property_id ?? LEER);
  const [amount, setAmount] = useState(String(booking.amount));
  const [note, setNote] = useState(booking.note ?? "");
  const [reason, setReason] = useState("");
  const reasonId = useId();
  // #6: the period and the recurrence were the two things this dialog could NOT change, which are
  // also the two most likely to be wrong.
  const [month, setMonth] = useState(Number(booking.period.slice(5, 7)));
  const [year, setYear] = useState(Number(booking.period.slice(0, 4)));
  const [recurring, setRecurring] = useState(booking.is_recurring);
  const [endMonth, setEndMonth] = useState<number | null>(
    booking.recurrence_until ? Number(booking.recurrence_until.slice(5, 7)) : null,
  );
  const [endYear, setEndYear] = useState<number | null>(
    booking.recurrence_until ? Number(booking.recurrence_until.slice(0, 4)) : null,
  );

  // #4: reseed every field from the row each time the dialog OPENS.
  //
  // These were seeded once with useState. A RECURRING booking is rendered as one row per covered
  // month, all sharing a source_id and each rendering its own copy of this component — and the row
  // key (`${source_id}_${period}`) does not change when the template does, so none of them remount.
  // Editing the amount via one month's row therefore left every other month's dialog holding the
  // OLD value, and pressing Speichern in any of them wrote that stale value back over the change,
  // with a success toast.
  function seedFromRow() {
    setCategoryId(booking.category_id);
    setPropertyId(booking.property_id ?? LEER);
    setAmount(String(booking.amount));
    setNote(booking.note ?? "");
    setMonth(Number(booking.period.slice(5, 7)));
    setYear(Number(booking.period.slice(0, 4)));
    setRecurring(booking.is_recurring);
    setEndMonth(booking.recurrence_until ? Number(booking.recurrence_until.slice(5, 7)) : null);
    setEndYear(booking.recurrence_until ? Number(booking.recurrence_until.slice(0, 4)) : null);
  }

  const amountNum = parseDecimalInput(amount) ?? 0;
  const endMonthWithoutYear = recurring && !!endMonth && !endYear;
  const endBeforeStart =
    recurring &&
    !!endMonth &&
    !!endYear &&
    monthYearToPeriod(endMonth, endYear) < monthYearToPeriod(month, year);
  const invalid =
    !amount.trim() ||
    !Number.isFinite(amountNum) ||
    amountNum === 0 ||
    !isValidYear(String(year)) ||
    (recurring && !!endYear && !isValidYear(String(endYear))) ||
    endMonthWithoutYear ||
    endBeforeStart;

  return (
    <div className="flex justify-end gap-1">
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (o) seedFromRow();
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            {t("manualBookings.action.bearbeiten")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("manualBookings.edit.title")}</DialogTitle>
            {booking.is_recurring && (
              <DialogDescription>{t("manualBookings.edit.wiederkehrendHint")}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("manualBookings.feld.kategorie")}</Label>
              <Combobox
                value={categoryId}
                onValueChange={setCategoryId}
                options={categoryOptions}
              />
            </div>
            {/* Period is editable now: a booking filed under the wrong month used to mean delete
                and re-create, which also threw away created_by/created_at. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("manualBookings.feld.monat")}</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("manualBookings.feld.jahr")}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={YEAR_MIN}
                  max={YEAR_MAX}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("manualBookings.feld.objekt")}</Label>
              <Combobox
                value={propertyId}
                onValueChange={setPropertyId}
                options={propertyOptions(properties, t("manualBookings.keinObjekt"))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("manualBookings.feld.betrag")}</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("manualBookings.feld.notiz")}</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("manualBookings.feld.wiederkehrend")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("manualBookings.feld.wiederkehrendHint")}
                </p>
              </div>
              <Switch checked={recurring} onCheckedChange={setRecurring} />
            </div>
            {recurring && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("manualBookings.feld.bisMonat")}</Label>
                  <Select
                    value={endMonth ? String(endMonth) : LEER}
                    onValueChange={(v) => setEndMonth(v === LEER ? null : Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LEER}>{t("manualBookings.offenesEnde")}</SelectItem>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("manualBookings.feld.bisJahr")}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={YEAR_MIN}
                    max={YEAR_MAX}
                    disabled={!endMonth}
                    value={endYear ?? ""}
                    onChange={(e) => setEndYear(Number(e.target.value) || null)}
                  />
                </div>
              </div>
            )}
            {/* Say WHY save is disabled. A greyed-out button with no reason is the same dead end
                as the silent revert this dialog used to produce. */}
            {endBeforeStart && (
              <p className="text-xs text-amber-700">{t("manualBookings.endeVorStart")}</p>
            )}
            {endMonthWithoutYear && (
              <p className="text-xs text-amber-700">{t("manualBookings.bisJahrFehlt")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("assignmentRules.action.abbrechen")}
            </Button>
            <Button
              disabled={invalid || update.isPending}
              onClick={() =>
                update.mutate(
                  {
                    id: booking.id,
                    changes: {
                      category_id: categoryId,
                      property_id: propertyId === LEER ? null : propertyId,
                      amount: amountNum,
                      note: note.trim() === "" ? null : note.trim(),
                      period: monthYearToPeriod(month, year),
                      is_recurring: recurring,
                      recurrence_until:
                        recurring && endMonth && endYear
                          ? monthYearToPeriod(endMonth, endYear)
                          : null,
                    },
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("manualBookings.toast.gespeichert"));
                      setEditOpen(false);
                    },
                    onError: (e) =>
                      toast.error(
                        t("manualBookings.toast.fehlgeschlagen", {
                          error: errorText(e),
                        }),
                      ),
                  },
                )
              }
            >
              {t("manualBookings.edit.speichern")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("manualBookings.loeschen.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {booking.is_recurring
                ? t("manualBookings.loeschen.descWiederkehrend")
                : t("manualBookings.loeschen.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Labelled, like every other field here. A placeholder disappears the moment you type
              and is not a label for a screen reader — and this field fills the "Grund" column on
              /papierkorb, which is empty for half the records in it. */}
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>{t("manualBookings.feld.grund")}</Label>
            <Input
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("assignmentRules.action.grundPlaceholder")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("assignmentRules.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(
                  { id: booking.id, reason: reason.trim() },
                  {
                    onSuccess: () => toast.success(t("manualBookings.toast.geloescht")),
                    onError: (e) =>
                      toast.error(
                        t("manualBookings.toast.fehlgeschlagen", {
                          error: errorText(e),
                        }),
                      ),
                  },
                )
              }
            >
              {t("manualBookings.loeschen.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
