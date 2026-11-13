import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { NoAccess } from "@/components/layout/no-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/documents/query-states";
import {
  useInvoiceKindLabels,
  useInvoiceSettings,
  useSaveInvoiceKindLabels,
  useUpdateInvoiceSettings,
} from "@/data";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import type { InvoiceKindLabel, InvoiceSettings } from "@/lib/data/types";
import { pageTitle } from "@/config/brand";
import { errorText, formatDateTime, parseDecimalInput } from "@/lib/data/format";

const KIND_SHAPE = /^[a-z][a-z0-9_]*$/;
const COUNTRY_CODE_SHAPE = /^[A-Z]{2}$/;

export const Route = createFileRoute("/invoice-settings/")({
  head: () => ({ meta: [{ title: pageTitle("Rechnungsvorgaben") }] }),
  staticData: { titleKey: "invoiceSettings" },
  component: InvoiceSettingsGuard,
});

function InvoiceSettingsGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageInvoiceSettings)) return <NoAccess />;
  return <InvoiceSettingsPage />;
}

function InvoiceSettingsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const settingsQuery = useInvoiceSettings();
  const labelsQuery = useInvoiceKindLabels();

  const failed = settingsQuery.isError ? settingsQuery : labelsQuery.isError ? labelsQuery : null;

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("invoiceSettings.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("invoiceSettings.subtitle")}
        </p>
      </div>

      <div className="mt-6 max-w-3xl">
        {failed ? (
          <ErrorState
            error={failed.error}
            onRetry={() => {
              void settingsQuery.refetch();
              void labelsQuery.refetch();
            }}
          />
        ) : !settingsQuery.data || !labelsQuery.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <SettingsForm
            settings={settingsQuery.data}
            kindLabels={labelsQuery.data}
            canEdit={can(PERMISSIONS.pageInvoiceSettings)}
          />
        )}
      </div>
    </div>
  );
}

function SettingsForm({
  settings,
  kindLabels,
  canEdit,
}: {
  settings: InvoiceSettings;
  kindLabels: InvoiceKindLabel[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const updateSettings = useUpdateInvoiceSettings();
  const saveKindLabels = useSaveInvoiceKindLabels();

  const [defaultVatRate, setDefaultVatRate] = useState(String(settings.default_vat_rate));
  const [countryCode, setCountryCode] = useState(settings.country_code);
  const [invoiceFallbackLabel, setInvoiceFallbackLabel] = useState(settings.invoice_fallback_label);
  const [invoiceUnitName, setInvoiceUnitName] = useState(settings.invoice_unit_name);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState(settings.default_payment_method);
  const [documentFallbackLabel, setDocumentFallbackLabel] = useState(
    settings.document_fallback_label,
  );
  const [labels, setLabels] = useState<InvoiceKindLabel[]>(kindLabels);

  useEffect(() => {
    setDefaultVatRate(String(settings.default_vat_rate));
    setCountryCode(settings.country_code);
    setInvoiceFallbackLabel(settings.invoice_fallback_label);
    setInvoiceUnitName(settings.invoice_unit_name);
    setDefaultPaymentMethod(settings.default_payment_method);
    setDocumentFallbackLabel(settings.document_fallback_label);
  }, [settings]);

  useEffect(() => {
    setLabels(kindLabels);
  }, [kindLabels]);

  const parsedVatRate = parseDecimalInput(defaultVatRate);
  const vatRateInvalid =
    parsedVatRate === null ||
    Number.isNaN(parsedVatRate) ||
    parsedVatRate < 0 ||
    parsedVatRate > 100;
  const countryCodeInvalid = !COUNTRY_CODE_SHAPE.test(countryCode);
  const textInvalid =
    invoiceFallbackLabel.trim() === "" ||
    invoiceUnitName.trim() === "" ||
    defaultPaymentMethod.trim() === "" ||
    documentFallbackLabel.trim() === "";
  const labelsInvalid = labels.some(
    (row, index) =>
      !KIND_SHAPE.test(row.kind) ||
      row.label.trim() === "" ||
      labels.findIndex((other) => other.kind === row.kind) !== index,
  );
  const invalid = vatRateInvalid || countryCodeInvalid || textInvalid || labelsInvalid;

  const labelsChanged =
    labels.length !== kindLabels.length ||
    labels.some((row, index) => {
      const stored = kindLabels[index];
      return !stored || stored.kind !== row.kind || stored.label !== row.label;
    });
  const dirty =
    parsedVatRate !== Number(settings.default_vat_rate) ||
    countryCode !== settings.country_code ||
    invoiceFallbackLabel !== settings.invoice_fallback_label ||
    invoiceUnitName !== settings.invoice_unit_name ||
    defaultPaymentMethod !== settings.default_payment_method ||
    documentFallbackLabel !== settings.document_fallback_label ||
    labelsChanged;

  const saving = updateSettings.isPending || saveKindLabels.isPending;

  function save() {
    if (parsedVatRate === null) return;
    updateSettings.mutate(
      {
        default_vat_rate: parsedVatRate,
        country_code: countryCode,
        invoice_fallback_label: invoiceFallbackLabel,
        invoice_unit_name: invoiceUnitName,
        default_payment_method: defaultPaymentMethod,
        document_fallback_label: documentFallbackLabel,
      },
      {
        onSuccess: () =>
          saveKindLabels.mutate(labels, {
            onSuccess: () => toast.success(t("invoiceSettings.toast.saved")),
            onError: (error) =>
              toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) })),
          }),
        onError: (error) =>
          toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) })),
      },
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("invoiceSettings.readOnlyHint")}
        </p>
      )}

      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {t("invoiceSettings.effectHint")}
      </p>

      {settings.updated_at && (
        <p className="text-xs text-muted-foreground">
          {t("invoiceSettings.lastChangedBy", {
            who: settings.updated_by ?? t("invoiceSettings.unknown"),
            when: formatDateTime(settings.updated_at),
          })}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("invoiceSettings.card.tax.title")}</CardTitle>
          <CardDescription>{t("invoiceSettings.card.tax.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("invoiceSettings.field.defaultVatRate")}
            value={defaultVatRate}
            onChange={setDefaultVatRate}
            disabled={!canEdit}
            invalid={vatRateInvalid}
            errorText={t("invoiceSettings.defaultVatRateInvalid")}
          />
          <Field
            label={t("invoiceSettings.field.countryCode")}
            value={countryCode}
            onChange={(value) => setCountryCode(value.toUpperCase())}
            disabled={!canEdit}
            invalid={countryCodeInvalid}
            errorText={t("invoiceSettings.countryCodeInvalid")}
            maxLength={2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoiceSettings.card.wording.title")}</CardTitle>
          <CardDescription>{t("invoiceSettings.card.wording.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("invoiceSettings.field.invoiceFallbackLabel")}
            value={invoiceFallbackLabel}
            onChange={setInvoiceFallbackLabel}
            disabled={!canEdit}
            invalid={invoiceFallbackLabel.trim() === ""}
            errorText={t("invoiceSettings.textRequired")}
          />
          <Field
            label={t("invoiceSettings.field.invoiceUnitName")}
            value={invoiceUnitName}
            onChange={setInvoiceUnitName}
            disabled={!canEdit}
            invalid={invoiceUnitName.trim() === ""}
            errorText={t("invoiceSettings.textRequired")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoiceSettings.card.voucherRemark.title")}</CardTitle>
          <CardDescription>{t("invoiceSettings.card.voucherRemark.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("invoiceSettings.field.defaultPaymentMethod")}
            value={defaultPaymentMethod}
            onChange={setDefaultPaymentMethod}
            disabled={!canEdit}
            invalid={defaultPaymentMethod.trim() === ""}
            errorText={t("invoiceSettings.textRequired")}
          />
          <Field
            label={t("invoiceSettings.field.documentFallbackLabel")}
            value={documentFallbackLabel}
            onChange={setDocumentFallbackLabel}
            disabled={!canEdit}
            invalid={documentFallbackLabel.trim() === ""}
            errorText={t("invoiceSettings.textRequired")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoiceSettings.card.kindLabels.title")}</CardTitle>
          <CardDescription>{t("invoiceSettings.card.kindLabels.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {labels.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("invoiceSettings.kindLabels.empty")}</p>
          )}
          {labels.map((row, index) => {
            const kindInvalid =
              !KIND_SHAPE.test(row.kind) ||
              labels.findIndex((other) => other.kind === row.kind) !== index;
            return (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("invoiceSettings.field.kind")}
                  </Label>
                  <Input
                    value={row.kind}
                    disabled={!canEdit}
                    aria-invalid={kindInvalid}
                    onChange={(event) =>
                      setLabels(
                        labels.map((one, position) =>
                          position === index ? { ...one, kind: event.target.value } : one,
                        ),
                      )
                    }
                  />
                  {kindInvalid && (
                    <p className="text-xs text-amber-700">{t("invoiceSettings.kindInvalid")}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("invoiceSettings.field.kindLabel")}
                  </Label>
                  <Input
                    value={row.label}
                    disabled={!canEdit}
                    aria-invalid={row.label.trim() === ""}
                    onChange={(event) =>
                      setLabels(
                        labels.map((one, position) =>
                          position === index ? { ...one, label: event.target.value } : one,
                        ),
                      )
                    }
                  />
                  {row.label.trim() === "" && (
                    <p className="text-xs text-amber-700">{t("invoiceSettings.textRequired")}</p>
                  )}
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("invoiceSettings.kindLabels.remove")}
                    onClick={() => setLabels(labels.filter((_, position) => position !== index))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            );
          })}
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => setLabels([...labels, { kind: "", label: "" }])}
            >
              <Plus /> {t("invoiceSettings.kindLabels.add")}
            </Button>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || invalid || saving}>
            {saving ? t("invoiceSettings.saving") : t("invoiceSettings.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  invalid,
  errorText,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  errorText: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid && <p className="text-xs text-amber-700">{errorText}</p>}
    </div>
  );
}
