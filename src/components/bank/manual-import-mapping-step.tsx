import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { guessColumnMapping } from "@/lib/bank-import/column-guess";
import { loadStoredMapping, saveMapping } from "@/lib/bank-import/mapping-storage";
import type { ColumnMapping, ParsedTable, SingleTargetField } from "@/lib/bank-import/types";
import { useTranslation } from "@/lib/i18n";

const OPTIONAL_FIELDS: SingleTargetField[] = [
  "value_date",
  "currency",
  "counterparty_holder",
  "counterparty_iban",
  "payment_reference",
  "booking_text",
];

export function ManualImportMappingStep({
  table,
  onConfirm,
}: {
  table: ParsedTable;
  onConfirm: (mapping: ColumnMapping) => void;
}) {
  const { t } = useTranslation();
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [splitAmount, setSplitAmount] = useState(false);

  useEffect(() => {
    const stored = loadStoredMapping(table.headers);
    const initial = stored ?? guessColumnMapping(table.headers);
    setMapping(initial);
    setSplitAmount(!!(initial.amountDebit || initial.amountCredit));
  }, [table.headers]);

  const columnOptions = [
    { value: "", label: t("bank.manualImport.mapping.notMapped") },
    ...table.headers.map((h) => ({ value: h, label: h })),
  ];

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
      <p className="text-sm text-muted-foreground">{t("bank.manualImport.mapping.hint")}</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <MappingField
          label={`${t("bank.manualImport.mapping.field.booking_date")} *`}
          value={mapping.booking_date ?? ""}
          onChange={(v) => setField("booking_date", v)}
          options={columnOptions}
        />

        {!splitAmount && (
          <MappingField
            label={`${t("bank.manualImport.mapping.field.amount")} *`}
            value={mapping.amount ?? ""}
            onChange={(v) => setField("amount", v)}
            options={columnOptions}
          />
        )}

        {OPTIONAL_FIELDS.map((field) => (
          <MappingField
            key={field}
            label={t(`bank.manualImport.mapping.field.${field}`)}
            value={mapping[field] ?? ""}
            onChange={(v) => setField(field, v)}
            options={columnOptions}
          />
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={splitAmount} onCheckedChange={(v) => setSplitAmount(v === true)} />
        <span className="text-muted-foreground">
          {t("bank.manualImport.mapping.useSplitAmount")}
        </span>
      </label>

      {splitAmount && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <MappingField
            label={`${t("bank.manualImport.mapping.amountDebit")} *`}
            value={mapping.amountDebit ?? ""}
            onChange={(v) => setField("amountDebit", v)}
            options={columnOptions}
          />
          <MappingField
            label={`${t("bank.manualImport.mapping.amountCredit")} *`}
            value={mapping.amountCredit ?? ""}
            onChange={(v) => setField("amountCredit", v)}
            options={columnOptions}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={confirm}>
          {t("bank.manualImport.mapping.continue")}
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
