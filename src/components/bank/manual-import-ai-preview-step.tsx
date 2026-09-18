import { useMemo, useState } from "react";
import { AlertTriangle, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AiExtractedRow, ExtractionField } from "@/lib/api/bank-statement-ai.functions";
import { findSuspectedDuplicates } from "@/lib/bank-import/duplicates";
import type { NormalizedRow } from "@/lib/bank-import/types";
import { formatDate, formatSignedEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const REQUIRED_FIELDS: readonly ExtractionField[] = ["booking_date", "amount"];

function toNormalizedRow(row: AiExtractedRow): NormalizedRow {
  return {
    booking_date: row.booking_date ?? "",
    value_date: row.value_date,
    amount: row.amount ?? 0,
    currency: row.currency,
    counterparty_holder: row.counterparty_holder,
    counterparty_iban: row.counterparty_iban,
    payment_reference: row.payment_reference,
    booking_text: row.booking_text,
    provider_ref: null,
  };
}

/**
 * Preview step for the AI/PDF path — unlike the read-only CSV/XLSX preview, this one is editable:
 * the model can genuinely fail to find a required field (missingFields, see
 * bank-statement-ai.functions.ts), and rather than import a blank/guessed value, the row is
 * blocked from import until a human fills the gap in here.
 */
export function ManualImportAiPreviewStep({
  rows,
  notes,
  onBack,
  onImport,
  importing,
}: {
  rows: AiExtractedRow[];
  notes: string[];
  onBack: () => void;
  onImport: (rows: NormalizedRow[]) => void;
  importing: boolean;
}) {
  const { t } = useTranslation();
  const [edited, setEdited] = useState<AiExtractedRow[]>(rows);

  function removeRow(index: number) {
    setEdited((prev) => prev.filter((_, i) => i !== index));
  }

  function setField(index: number, field: ExtractionField, raw: string) {
    setEdited((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const value = raw.trim();
        const parsed: string | number | null =
          value === "" ? null : field === "amount" ? Number(value.replace(",", ".")) : value;
        const isValid = parsed !== null && !(typeof parsed === "number" && Number.isNaN(parsed));
        return {
          ...row,
          [field]: parsed,
          // Filled in (validly) -> no longer missing. Cleared again -> back to missing.
          missingFields: isValid
            ? row.missingFields.filter((f) => f !== field)
            : row.missingFields.includes(field)
              ? row.missingFields
              : [...row.missingFields, field],
        };
      }),
    );
  }

  const rowsMissingRequired = useMemo(
    () =>
      edited
        .map((r, i) => (REQUIRED_FIELDS.some((f) => r.missingFields.includes(f)) ? i : -1))
        .filter((i) => i >= 0),
    [edited],
  );
  const lowConfidenceIndexes = useMemo(
    () => new Set(edited.map((r, i) => (r.confidence === "low" ? i : -1)).filter((i) => i >= 0)),
    [edited],
  );
  const optionalMissingIndexes = useMemo(
    () =>
      new Set(
        edited
          .map((r, i) => (r.missingFields.some((f) => !REQUIRED_FIELDS.includes(f)) ? i : -1))
          .filter((i) => i >= 0),
      ),
    [edited],
  );
  const duplicates = useMemo(() => findSuspectedDuplicates(edited.map(toNormalizedRow)), [edited]);

  const sum = useMemo(() => edited.reduce((acc, r) => acc + (r.amount ?? 0), 0), [edited]);
  const canImport = rowsMissingRequired.length === 0 && edited.length > 0 && !importing;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-violet-300/60 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-200">
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p>{t("bank.manualImport.preview.aiWarning")}</p>
          {notes.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4">
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        {t("bank.manualImport.preview.summaryShort", {
          count: edited.length,
          sum: formatSignedEUR(sum),
        })}
      </div>

      {rowsMissingRequired.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("bank.manualImport.preview.missingRequiredWarning", {
            count: rowsMissingRequired.length,
          })}
        </div>
      )}

      {(lowConfidenceIndexes.size > 0 || optionalMissingIndexes.size > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("bank.manualImport.preview.lowConfidenceWarning", {
            count: new Set([...lowConfidenceIndexes, ...optionalMissingIndexes]).size,
          })}
        </div>
      )}

      {duplicates.size > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("bank.manualImport.preview.duplicateWarning", { count: duplicates.size })}
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <Table containerClassName="max-h-[400px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("bank.manualImport.preview.col.datum")}</TableHead>
              <TableHead className="text-right">
                {t("bank.manualImport.preview.col.betrag")}
              </TableHead>
              <TableHead>{t("bank.manualImport.preview.col.gegenkonto")}</TableHead>
              <TableHead>{t("bank.manualImport.preview.col.verwendungszweck")}</TableHead>
              <TableHead className="w-9" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {edited.map((row, i) => {
              const missingRequired = REQUIRED_FIELDS.some((f) => row.missingFields.includes(f));
              const flagged =
                missingRequired ||
                duplicates.has(i) ||
                row.confidence === "low" ||
                row.missingFields.length > 0;
              return (
                <TableRow
                  key={i}
                  className={cn(
                    flagged && "bg-amber-50 dark:bg-amber-950/20",
                    missingRequired && "bg-destructive/10 hover:bg-destructive/10",
                  )}
                >
                  <TableCell>
                    <EditableCell
                      value={row.booking_date}
                      displayValue={row.booking_date === null ? null : formatDate(row.booking_date)}
                      missing={row.missingFields.includes("booking_date")}
                      type="date"
                      placeholder={t("bank.manualImport.preview.fillIn")}
                      onChange={(v) => setField(i, "booking_date", v)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={row.amount === null ? "" : String(row.amount)}
                      displayValue={row.amount === null ? null : formatSignedEUR(row.amount)}
                      missing={row.missingFields.includes("amount")}
                      type="text"
                      align="right"
                      placeholder={t("bank.manualImport.preview.fillIn")}
                      onChange={(v) => setField(i, "amount", v)}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      value={row.counterparty_holder}
                      missing={row.missingFields.includes("counterparty_holder")}
                      type="text"
                      placeholder={t("bank.manualImport.preview.fillIn")}
                      onChange={(v) => setField(i, "counterparty_holder", v)}
                    />
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <EditableCell
                      value={row.payment_reference}
                      missing={row.missingFields.includes("payment_reference")}
                      type="text"
                      placeholder={t("bank.manualImport.preview.fillIn")}
                      onChange={(v) => setField(i, "payment_reference", v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      title={t("bank.manualImport.preview.removeRow")}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} type="button">
          {t("bank.manualImport.preview.back")}
        </Button>
        <Button disabled={!canImport} onClick={() => onImport(edited.map(toNormalizedRow))}>
          {importing
            ? t("bank.manualImport.preview.importing")
            : t("bank.manualImport.preview.import")}
        </Button>
      </div>
    </div>
  );
}

function EditableCell({
  value,
  displayValue,
  missing,
  type,
  align,
  placeholder,
  onChange,
}: {
  value: string | null;
  /** Formatted read-only rendering (e.g. formatSignedEUR); falls back to `value` if omitted. */
  displayValue?: string | null;
  missing: boolean;
  type: "text" | "date";
  align?: "right";
  placeholder: string;
  onChange: (value: string) => void;
}) {
  if (!missing) {
    return (
      <span className={cn("text-sm", align === "right" && "tabular-nums")}>
        {displayValue ?? value ?? "—"}
      </span>
    );
  }
  // Dates go through the shared picker here too, so a missing booking date is filled in with the
  // same control as everywhere else rather than the browser's native one.
  if (type === "date") {
    return (
      <DatePicker
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        className="h-8 border-destructive/50"
      />
    );
  }
  return (
    <Input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 border-destructive/50", align === "right" && "text-right")}
    />
  );
}
