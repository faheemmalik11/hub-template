import { AlertTriangle } from "lucide-react";

import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BANK_ACCOUNT_PRODUCT_TYPES,
  isCardType,
  type BankAccountField,
  type BankAccountRules,
} from "@/lib/data/bank-account-fields";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BankAccountForm } from "./use-bank-account-form";

const NO_COMPANY = "";

const DEFAULT_FIELDS: BankAccountField[] = [
  "iban",
  "bic",
  "bankName",
  "holder",
  "productType",
  "currency",
];

type TextField = Extract<BankAccountField, "iban" | "bic" | "bankName" | "holder" | "currency">;

export interface BankAccountCompanyOption {
  id: string;
  code: string;
  name: string;
}

export function BankAccountFormFields({
  form,
  companies,
  fields = DEFAULT_FIELDS,
  rules = {},
  idPrefix = "bank-account",
  namePlaceholder,
  companyPlaceholder,
}: {
  form: BankAccountForm;
  companies: BankAccountCompanyOption[];
  fields?: BankAccountField[];
  rules?: BankAccountRules;
  idPrefix?: string;
  namePlaceholder?: string;
  companyPlaceholder?: string;
}) {
  const { t } = useTranslation();
  const { values, setField, markTouched, showError, errors } = form;

  const message = (field: BankAccountField) =>
    showError(field) ? t(`bankAccountForm.invalid.${errors[field]}`) : null;

  const required: Partial<Record<BankAccountField, boolean>> = {
    accountName: true,
    companyId: rules.requireCompany,
    iban: rules.requireIban && !isCardType(values.productType),
    holder: rules.requireHolder,
    productType: rules.requireProductType,
    currency: rules.requireCurrency,
  };

  const label = (field: BankAccountField, text: string) => (
    <Label htmlFor={`${idPrefix}-${field}`}>
      {text}
      {required[field] && <span aria-hidden="true"> *</span>}
    </Label>
  );

  const textField = (field: TextField, text: string) => {
    const error = message(field);
    return (
      <div key={field} className="space-y-1.5">
        {label(field, text)}
        <Input
          id={`${idPrefix}-${field}`}
          value={values[field] ?? ""}
          onChange={(e) => setField(field, e.target.value)}
          onBlur={() => markTouched(field)}
          className={cn(error && "border-destructive")}
          aria-invalid={!!error || undefined}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  const productTypeField = () => {
    const error = message("productType");
    const current = values.productType?.trim();
    const known = BANK_ACCOUNT_PRODUCT_TYPES as readonly string[];
    const options = [
      ...known.map((v) => ({ value: v, label: v })),
      ...(current && !known.includes(current) ? [{ value: current, label: current }] : []),
    ];
    return (
      <div key="productType" className="space-y-1.5">
        {label("productType", t("bankAccountForm.field.art"))}
        <Combobox
          id={`${idPrefix}-productType`}
          value={current ?? ""}
          onValueChange={(v) => {
            setField("productType", v || null);
            markTouched("productType");
          }}
          options={options}
          placeholder={t("bankAccountForm.field.artPlaceholder")}
          invalid={!!error}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  const labels: Record<TextField, string> = {
    iban: t("bankAccountForm.field.iban"),
    bic: t("bankAccountForm.field.bic"),
    bankName: t("bankAccountForm.field.bank"),
    holder: t("bankAccountForm.field.holder"),
    currency: t("bankAccountForm.field.waehrung"),
  };

  const companyError = message("companyId");
  const nameError = message("accountName");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {label("accountName", t("bankAccountForm.field.name"))}
        <Input
          id={`${idPrefix}-accountName`}
          value={values.accountName}
          onChange={(e) => setField("accountName", e.target.value)}
          onBlur={() => markTouched("accountName")}
          placeholder={namePlaceholder}
          className={cn(nameError && "border-destructive")}
          aria-invalid={!!nameError || undefined}
        />
        {nameError && <p className="text-xs text-destructive">{nameError}</p>}
      </div>

      <div className="space-y-1.5">
        {label("companyId", t("bankAccountForm.field.gesellschaft"))}
        <Combobox
          id={`${idPrefix}-companyId`}
          value={values.companyId ?? NO_COMPANY}
          onValueChange={(v) => {
            setField("companyId", v === NO_COMPANY ? null : v);
            markTouched("companyId");
          }}
          placeholder={companyPlaceholder}
          invalid={!!companyError}
          options={[
            ...(rules.requireCompany
              ? []
              : [{ value: NO_COMPANY, label: t("bankAccountForm.field.gesellschaftKeine") }]),
            ...companies.map((c) => ({
              value: c.id,
              label: `${c.code} · ${c.name}`,
              keywords: c.name,
            })),
          ]}
        />
        {companyError && <p className="text-xs text-destructive">{companyError}</p>}
        {!rules.requireCompany && values.companyId === null && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            {t("bankAccountForm.field.gesellschaftWarnung")}
          </p>
        )}
      </div>

      {fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            if (field === "accountName" || field === "companyId") return null;
            if (field === "productType") return productTypeField();
            return textField(field, labels[field as TextField]);
          })}
        </div>
      )}
    </div>
  );
}
