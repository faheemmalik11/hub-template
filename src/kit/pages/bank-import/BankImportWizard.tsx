import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Combobox } from "../../ui/combobox";
import { Label } from "../../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { readableErrorMessage } from "../../components/feedback/query-states";
import { cn } from "../../lib/class-names";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import {
  detectFormat,
  findSuspectedDuplicates,
  guessColumnMapping,
  loadStoredMapping,
  normalizeTable,
  parseBankFile,
  saveMapping,
  type ColumnMapping,
  type NormalizedRow,
  type NormalizeResult,
  type ParsedTable,
  type SingleTargetField,
} from "../../lib/bank-import";
import type { BankReconciliationAdapter } from "../../adapters/bank-reconciliation";
import { englishBankImportLabels, type BankImportLabels } from "./labels";

type Step = "account" | "upload" | "mapping" | "preview" | "result";
const STEPS: Step[] = ["account", "upload", "mapping", "preview", "result"];

const OPTIONAL_FIELDS: SingleTargetField[] = [
  "value_date",
  "currency",
  "counterparty_holder",
  "counterparty_iban",
  "payment_reference",
  "booking_text",
];

export interface BankImportWizardProps {
  adapter: Pick<BankReconciliationAdapter, "import" | "formatMoney" | "formatDate">;
  labels?: BankImportLabels;
  formatters?: Formatters;
}

export function BankImportWizard({
  adapter,
  labels = englishBankImportLabels,
  formatters = englishFormatters,
}: BankImportWizardProps) {
  if (!adapter.import) return null;
  return (
    <BankImportWizardForCapability
      importCapability={adapter.import}
      labels={labels}
      formatters={formatters}
    />
  );
}

function BankImportWizardForCapability({
  importCapability,
  labels,
  formatters,
}: {
  importCapability: NonNullable<BankImportWizardProps["adapter"]["import"]>;
  labels: NonNullable<BankImportWizardProps["labels"]>;
  formatters: NonNullable<BankImportWizardProps["formatters"]>;
}) {
  const accountOptionsQuery = importCapability.useAccountOptions();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("account");
  const [accountId, setAccountId] = useState("");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [filename, setFilename] = useState("");
  const [normalized, setNormalized] = useState<NormalizeResult | null>(null);
  const [rows, setRows] = useState<NormalizedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    duplicates: number;
  } | null>(null);

  function reset() {
    setStep("account");
    setAccountId("");
    setTable(null);
    setFilename("");
    setNormalized(null);
    setRows([]);
    setResult(null);
  }

  async function runImport() {
    setImporting(true);
    try {
      const outcome = await importCapability.importRows(accountId, filename, rows);
      setResult(outcome);
      setStep("result");
    } catch (error) {
      toast.error(labels.importFailed(readableErrorMessage(error, "")));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="size-4" />
          {labels.button}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{labels.dialogTitle}</DialogTitle>
          <DialogDescription>{labels.dialogDescription}</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={cn("flex items-center gap-1", s === step && "font-medium text-foreground")}
            >
              <span>{i + 1}.</span>
              {
                {
                  account: labels.stepAccount,
                  upload: labels.stepUpload,
                  mapping: labels.stepMapping,
                  preview: labels.stepPreview,
                  result: labels.stepResult,
                }[s]
              }
            </li>
          ))}
        </ol>

        {step === "account" && (
          <div className="space-y-3">
            <Combobox
              value={accountId}
              onValueChange={setAccountId}
              options={accountOptionsQuery.data.map((a) => ({ value: a.id, label: a.label }))}
              placeholder={labels.accountPlaceholder}
            />
            <div className="flex justify-end">
              <Button disabled={!accountId} onClick={() => setStep("upload")}>
                {labels.continueButton}
              </Button>
            </div>
          </div>
        )}

        {step === "upload" && (
          <UploadStep
            labels={labels}
            onParsed={(t, name) => {
              setTable(t);
              setFilename(name);
              setStep("mapping");
            }}
            onBack={() => setStep("account")}
          />
        )}

        {step === "mapping" && table && (
          <MappingStep
            table={table}
            labels={labels}
            onBack={() => setStep("upload")}
            onConfirm={(mapping) => {
              const result = normalizeTable(table, mapping);
              setNormalized(result);
              setRows(result.rows);
              setStep("preview");
            }}
          />
        )}

        {step === "preview" && normalized && (
          <PreviewStep
            normalized={normalized}
            rows={rows}
            onRowsChange={setRows}
            labels={labels}
            formatters={formatters}
            importing={importing}
            onBack={() => setStep("mapping")}
            onImport={runImport}
          />
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {labels.resultSummary(result.imported, result.skipped, result.duplicates)}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>{labels.close}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadStep({
  labels,
  onParsed,
  onBack,
}: {
  labels: BankImportLabels;
  onParsed: (table: ParsedTable, filename: string) => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (detectFormat(file) === "pdf") {
      setError(labels.pdfNotSupported);
      return;
    }
    setBusy(true);
    try {
      const { table } = await parseBankFile(file);
      onParsed(table, file.name);
    } catch (e) {
      setError(readableErrorMessage(e, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-10 text-center",
          dragOver && "border-brand bg-brand-wash",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <Upload className="size-6 text-muted-foreground" />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? labels.uploadBusy : labels.uploadPrompt}
        </Button>
        <p className="text-xs text-muted-foreground">{labels.uploadHint}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex justify-start">
        <Button variant="ghost" onClick={onBack}>
          {labels.backButton}
        </Button>
      </div>
    </div>
  );
}

function MappingStep({
  table,
  labels,
  onConfirm,
  onBack,
}: {
  table: ParsedTable;
  labels: BankImportLabels;
  onConfirm: (mapping: ColumnMapping) => void;
  onBack: () => void;
}) {
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [splitAmount, setSplitAmount] = useState(false);

  useEffect(() => {
    const stored = loadStoredMapping(table.headers);
    const initial = stored ?? guessColumnMapping(table.headers);
    setMapping(initial);
    setSplitAmount(!!(initial.amountDebit || initial.amountCredit));
  }, [table.headers]);

  const columnOptions = [
    { value: "", label: labels.notMapped },
    ...table.headers.map((h) => ({ value: h, label: h })),
  ];
  const fieldLabel: Record<SingleTargetField, string> = {
    booking_date: labels.fieldBookingDate,
    value_date: labels.fieldValueDate,
    amount: labels.fieldAmount,
    currency: labels.fieldCurrency,
    counterparty_holder: labels.fieldCounterpartyHolder,
    counterparty_iban: labels.fieldCounterpartyIban,
    payment_reference: labels.fieldPaymentReference,
    booking_text: labels.fieldBookingText,
  };

  function setField(field: SingleTargetField | "amountDebit" | "amountCredit", value: string) {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  }

  const hasAmount = splitAmount ? mapping.amountDebit || mapping.amountCredit : !!mapping.amount;
  const canContinue = !!mapping.booking_date && hasAmount;

  function confirm() {
    const finalMapping = splitAmount
      ? { ...mapping, amount: undefined }
      : { ...mapping, amountDebit: undefined, amountCredit: undefined };
    saveMapping(table.headers, finalMapping);
    onConfirm(finalMapping);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{labels.mappingHint}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <MappingField
          label={`${labels.fieldBookingDate} *`}
          value={mapping.booking_date ?? ""}
          onChange={(v) => setField("booking_date", v)}
          options={columnOptions}
        />
        {!splitAmount && (
          <MappingField
            label={`${labels.fieldAmount} *`}
            value={mapping.amount ?? ""}
            onChange={(v) => setField("amount", v)}
            options={columnOptions}
          />
        )}
        {OPTIONAL_FIELDS.map((field) => (
          <MappingField
            key={field}
            label={fieldLabel[field]}
            value={mapping[field] ?? ""}
            onChange={(v) => setField(field, v)}
            options={columnOptions}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={splitAmount} onCheckedChange={(v) => setSplitAmount(v === true)} />
        <span className="text-muted-foreground">{labels.useSplitAmount}</span>
      </label>
      {splitAmount && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <MappingField
            label={`${labels.fieldAmountDebit} *`}
            value={mapping.amountDebit ?? ""}
            onChange={(v) => setField("amountDebit", v)}
            options={columnOptions}
          />
          <MappingField
            label={`${labels.fieldAmountCredit} *`}
            value={mapping.amountCredit ?? ""}
            onChange={(v) => setField("amountCredit", v)}
            options={columnOptions}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {labels.backButton}
        </Button>
        <Button disabled={!canContinue} onClick={confirm}>
          {labels.continueButton}
        </Button>
      </div>
    </div>
  );
}

function MappingField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Combobox value={value} onValueChange={onChange} options={options} className="w-full" />
    </div>
  );
}

function PreviewStep({
  normalized,
  rows,
  onRowsChange,
  labels,
  formatters,
  importing,
  onBack,
  onImport,
}: {
  normalized: NormalizeResult;
  rows: NormalizedRow[];
  onRowsChange: (rows: NormalizedRow[]) => void;
  labels: BankImportLabels;
  formatters: Formatters;
  importing: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const duplicates = findSuspectedDuplicates(rows);
  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  const dates = rows.map((r) => r.booking_date).sort();

  function removeRow(index: number) {
    onRowsChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        {labels.previewSummary(
          rows.length,
          formatters.formatDate(dates[0]),
          formatters.formatDate(dates[dates.length - 1]),
          formatters.formatMoney(sum),
        )}
      </div>
      {normalized.issues.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {labels.issuesWarning(normalized.issues.length)}
        </p>
      )}
      {duplicates.size > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {labels.duplicateWarning(duplicates.size)}
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-border">
        <Table containerClassName="max-h-[360px]">
          <TableHeader>
            <TableRow>
              <TableHead>{labels.columnDate}</TableHead>
              <TableHead className="text-right">{labels.columnAmount}</TableHead>
              <TableHead>{labels.columnCounterparty}</TableHead>
              <TableHead>{labels.columnReference}</TableHead>
              <TableHead className="w-9" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((row, i) => (
              <TableRow key={i} className={cn(duplicates.has(i) && "bg-amber-50")}>
                <TableCell>{formatters.formatDate(row.booking_date)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatters.formatMoney(row.amount)}
                </TableCell>
                <TableCell>{row.counterparty_holder ?? "—"}</TableCell>
                <TableCell className="max-w-[280px] truncate">
                  {row.payment_reference ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    title={labels.removeRow}
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} type="button">
          {labels.backButton}
        </Button>
        <Button disabled={rows.length === 0 || importing} onClick={onImport}>
          {importing ? labels.importing : labels.importButton}
        </Button>
      </div>
    </div>
  );
}
