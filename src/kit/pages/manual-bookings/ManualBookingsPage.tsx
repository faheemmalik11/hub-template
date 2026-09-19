import { useMemo, useState } from "react";
import { Plus, Repeat, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Switch } from "../../ui/switch";
import { Badge } from "../../ui/badge";
import { Combobox } from "../../ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
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
} from "../../ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  ErrorState,
  TableSkeleton,
  readableErrorMessage,
} from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import type {
  ManualBookingRecord,
  ManualBookingsAdapter,
  NewManualBooking,
} from "../../adapters/manual-bookings";
import { englishManualBookingsLabels, type ManualBookingsLabels } from "./labels";

const ALL = "__all";
const NONE = "__none";
const YEAR_MIN = 1900;
const YEAR_MAX = 2999;

type SortKey = "periodAsc" | "periodDesc" | "amountDesc" | "amountAsc" | "category";

function isValidYear(raw: string): boolean {
  const n = Number(raw);
  return /^\d{4}$/.test(raw) && n >= YEAR_MIN && n <= YEAR_MAX;
}

function periodOf(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export interface ManualBookingsPageProps {
  adapter: ManualBookingsAdapter;
  labels?: ManualBookingsLabels;
}

export function ManualBookingsPage({
  adapter,
  labels = englishManualBookingsLabels,
}: ManualBookingsPageProps) {
  const companyOptionsQuery = adapter.useCompanyOptions();
  const categoryOptionsQuery = adapter.useCategoryOptions();
  const propertyOptionsQuery = adapter.usePropertyOptions();

  const [companyId, setCompanyId] = useState(ALL);
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("periodAsc");
  const [dialogState, setDialogState] = useState<"new" | ManualBookingRecord | null>(null);

  const from = `${year}-01-01`;
  const to = `${year}-12-01`;
  const bookingsQuery = adapter.useBookings(companyId === ALL ? null : companyId, from, to);

  const companyById = useMemo(
    () => new Map(companyOptionsQuery.data.map((c) => [c.id, c])),
    [companyOptionsQuery.data],
  );
  const categoryById = useMemo(
    () => new Map(categoryOptionsQuery.data.map((c) => [c.id, c])),
    [categoryOptionsQuery.data],
  );
  const propertyById = useMemo(
    () => new Map(propertyOptionsQuery.data.map((p) => [p.id, p])),
    [propertyOptionsQuery.data],
  );

  function monthLabel(period: string): string {
    const m = Number(period.slice(5, 7));
    return `${adapter.monthLabels[m - 1] ?? m} ${period.slice(0, 4)}`;
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = bookingsQuery.data.filter((row) => {
      if (!term) return true;
      const category = categoryById.get(row.categoryId)?.label ?? "";
      const property = row.propertyId ? (propertyById.get(row.propertyId)?.code ?? "") : "";
      const company = companyById.get(row.companyId)?.code ?? "";
      return [row.note ?? "", category, property, company, monthLabel(row.period)]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "amountDesc") return Math.abs(b.amount) - Math.abs(a.amount);
      if (sort === "amountAsc") return Math.abs(a.amount) - Math.abs(b.amount);
      if (sort === "category")
        return (categoryById.get(a.categoryId)?.label ?? "").localeCompare(
          categoryById.get(b.categoryId)?.label ?? "",
        );
      if (sort === "periodDesc") return b.period.localeCompare(a.period);
      return a.period.localeCompare(b.period);
    });
    return sorted;
  }, [bookingsQuery.data, search, sort, categoryById, propertyById, companyById]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <div className="w-full space-y-1.5 sm:w-[220px]">
            <Label>{labels.companyLabel}</Label>
            <Combobox
              value={companyId}
              onValueChange={setCompanyId}
              options={[
                { value: ALL, label: labels.companyAll },
                ...companyOptionsQuery.data.map((c) => ({
                  value: c.id,
                  label: `${c.code} · ${c.name}`,
                })),
              ]}
            />
          </div>
          <div className="w-[100px] space-y-1.5">
            <Label>{labels.yearLabel}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={yearInput}
              onChange={(event) => {
                const raw = event.target.value;
                setYearInput(raw);
                if (isValidYear(raw)) setYear(Number(raw));
              }}
              onBlur={() => setYearInput(String(year))}
              aria-invalid={!isValidYear(yearInput)}
            />
            {!isValidYear(yearInput) && (
              <p className="text-xs text-amber-700">
                {labels.yearInvalid(YEAR_MIN, YEAR_MAX, year)}
              </p>
            )}
          </div>
          <Button className="gap-2" onClick={() => setDialogState("new")}>
            <Plus className="size-4" /> {labels.newBookingButton}
          </Button>
        </div>
      </div>

      <p className="mt-4 max-w-3xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {labels.hint}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full flex-1 sm:w-auto sm:min-w-[240px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="pl-9"
          />
        </div>
        <Combobox
          value={sort}
          onValueChange={(v) => setSort(v as SortKey)}
          className="w-full sm:w-[220px]"
          options={[
            { value: "periodAsc", label: labels.sortPeriodAsc },
            { value: "periodDesc", label: labels.sortPeriodDesc },
            { value: "amountDesc", label: labels.sortAmountDesc },
            { value: "amountAsc", label: labels.sortAmountAsc },
            { value: "category", label: labels.sortCategory },
          ]}
        />
      </div>

      {bookingsQuery.error ? (
        <div className="mt-6">
          <ErrorState error={bookingsQuery.error} onRetry={() => {}} />
        </div>
      ) : bookingsQuery.loading ? (
        <div className="mt-6">
          <TableSkeleton rows={5} columns={companyId === ALL ? 7 : 6} />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {companyId === ALL && <TableHead>{labels.columnCompany}</TableHead>}
                <TableHead>{labels.columnPeriod}</TableHead>
                <TableHead>{labels.columnCategory}</TableHead>
                <TableHead>{labels.columnProperty}</TableHead>
                <TableHead>{labels.columnNote}</TableHead>
                <TableHead className="text-right">{labels.columnAmount}</TableHead>
                <TableHead className="text-right">{labels.columnActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {companyId === ALL && (
                    <TableCell className="text-muted-foreground">
                      {companyById.get(row.companyId)?.code ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-foreground">
                    {monthLabel(row.period)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{categoryById.get(row.categoryId)?.label ?? "—"}</span>
                      {row.isRecurring && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Repeat className="size-3" /> {labels.recurringBadge}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.propertyId ? (propertyById.get(row.propertyId)?.code ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {row.note ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      row.amount < 0 && "text-destructive",
                    )}
                  >
                    {adapter.formatMoney(row.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => setDialogState(row)}
                      >
                        {labels.editButton}
                      </button>
                      <DeleteBookingButton booking={row} adapter={adapter} labels={labels} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={companyId === ALL ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {labels.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogState && (
        <BookingDialog
          booking={dialogState === "new" ? null : dialogState}
          defaultCompanyId={companyId === ALL ? undefined : companyId}
          adapter={adapter}
          labels={labels}
          onClose={() => setDialogState(null)}
        />
      )}
    </div>
  );
}

function DeleteBookingButton({
  booking,
  adapter,
  labels,
}: {
  booking: ManualBookingRecord;
  adapter: ManualBookingsAdapter;
  labels: ManualBookingsLabels;
}) {
  const [open, setOpen] = useState(false);

  async function confirm() {
    try {
      await adapter.deleteBooking(booking.id);
      toast.success(labels.deletedToast);
      setOpen(false);
    } catch (error) {
      toast.error(readableErrorMessage(error, ""));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title={labels.deleteButton}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.deleteDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>{labels.deleteDialogDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.deleteCancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {labels.deleteConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BookingDialog({
  booking,
  defaultCompanyId,
  adapter,
  labels,
  onClose,
}: {
  booking: ManualBookingRecord | null;
  defaultCompanyId?: string;
  adapter: ManualBookingsAdapter;
  labels: ManualBookingsLabels;
  onClose: () => void;
}) {
  const companyOptionsQuery = adapter.useCompanyOptions();
  const categoryOptionsQuery = adapter.useCategoryOptions();
  const propertyOptionsQuery = adapter.usePropertyOptions();
  const now = new Date();

  const [companyId, setCompanyId] = useState(booking?.companyId ?? defaultCompanyId ?? "");
  const [categoryId, setCategoryId] = useState(booking?.categoryId ?? "");
  const [propertyId, setPropertyId] = useState(booking?.propertyId ?? NONE);
  const [month, setMonth] = useState(
    booking ? Number(booking.period.slice(5, 7)) : now.getMonth() + 1,
  );
  const [year, setYear] = useState(
    booking ? Number(booking.period.slice(0, 4)) : now.getFullYear(),
  );
  const [amount, setAmount] = useState(booking ? String(booking.amount) : "");
  const [note, setNote] = useState(booking?.note ?? "");
  const [recurring, setRecurring] = useState(booking?.isRecurring ?? false);
  const [endMonth, setEndMonth] = useState<number | null>(
    booking?.recurrenceUntil ? Number(booking.recurrenceUntil.slice(5, 7)) : null,
  );
  const [endYear, setEndYear] = useState<number | null>(
    booking?.recurrenceUntil ? Number(booking.recurrenceUntil.slice(0, 4)) : null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const amountNum = Number(amount.replace(",", "."));
  const endMonthWithoutYear = recurring && !!endMonth && !endYear;
  const endBeforeStart =
    recurring && !!endMonth && !!endYear && periodOf(endMonth, endYear) < periodOf(month, year);
  const invalid =
    !companyId ||
    !categoryId ||
    !amount.trim() ||
    !Number.isFinite(amountNum) ||
    amountNum === 0 ||
    endMonthWithoutYear ||
    endBeforeStart ||
    !isValidYear(String(year));

  async function save() {
    if (endMonthWithoutYear) {
      setError(labels.endMonthNeedsYear);
      return;
    }
    if (endBeforeStart) {
      setError(labels.endBeforeStart);
      return;
    }
    if (invalid) return;
    setError("");
    const input: NewManualBooking = {
      companyId,
      categoryId,
      propertyId: propertyId === NONE ? null : propertyId,
      period: periodOf(month, year),
      amount: amountNum,
      note: note.trim() === "" ? null : note.trim(),
      isRecurring: recurring,
      recurrenceUntil: recurring && endMonth && endYear ? periodOf(endMonth, endYear) : null,
    };
    setIsSaving(true);
    try {
      if (booking) await adapter.updateBooking(booking.id, input);
      else await adapter.createBooking(input);
      toast.success(labels.savedToast);
      onClose();
    } catch (e) {
      toast.error(labels.saveFailed(readableErrorMessage(e, "")));
    } finally {
      setIsSaving(false);
    }
  }

  const monthOptions = adapter.monthLabels.map((label, i) => ({ value: String(i + 1), label }));

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{booking ? labels.editDialogTitle : labels.newDialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldCompany}</Label>
            <Combobox
              value={companyId}
              onValueChange={setCompanyId}
              options={companyOptionsQuery.data.map((c) => ({
                value: c.id,
                label: `${c.code} · ${c.name}`,
              }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldCategory}</Label>
            <Combobox
              value={categoryId}
              onValueChange={setCategoryId}
              options={categoryOptionsQuery.data.map((c) => ({ value: c.id, label: c.label }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldProperty}</Label>
            <Combobox
              value={propertyId}
              onValueChange={setPropertyId}
              options={[
                { value: NONE, label: labels.propertyNone },
                ...propertyOptionsQuery.data.map((p) => ({
                  value: p.id,
                  label: p.name ? `${p.code} · ${p.name}` : p.code,
                })),
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fieldMonth}</Label>
              <Combobox
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
                options={monthOptions}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.fieldYear}</Label>
              <Input
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value) || year)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldAmount}</Label>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{labels.fieldNote}</Label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Switch checked={recurring} onCheckedChange={setRecurring} />
            {labels.fieldRecurring}
          </label>
          {recurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {labels.fieldRecurringUntil}
                </Label>
                <Combobox
                  value={endMonth ? String(endMonth) : ""}
                  onValueChange={(v) => setEndMonth(v ? Number(v) : null)}
                  options={[{ value: "", label: labels.recurringUntilNone }, ...monthOptions]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">&nbsp;</Label>
                <Input
                  type="number"
                  value={endYear ?? ""}
                  onChange={(event) =>
                    setEndYear(event.target.value ? Number(event.target.value) : null)
                  }
                />
              </div>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button onClick={save} disabled={invalid || isSaving}>
            {isSaving ? labels.saving : labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
