import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { NoAccess } from "@/components/layout/no-access";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
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

function sanitizeAmountInput(raw: string): string {
  const digitsAndSeparators = raw.replace(/[^0-9.,]/g, "");
  const separatorIndex = digitsAndSeparators.search(/[.,]/);
  if (separatorIndex === -1) return digitsAndSeparators;
  return (
    digitsAndSeparators.slice(0, separatorIndex + 1) +
    digitsAndSeparators.slice(separatorIndex + 1).replace(/[.,]/g, "")
  );
}

const KIND_SHAPE = /^[a-z][a-z0-9_]*$/;
const COUNTRY_CODE_SHAPE = /^[A-Z]{2}$/;
const TIMEZONE_OPTIONS = Intl.supportedValuesOf("timeZone").map((zone) => ({
  value: zone,
  label: zone,
}));

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

      <div className="mt-6 max-w-4xl">
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
            canEdit={can(PERMISSIONS.settingsManage)}
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
  const [timezone, setTimezone] = useState(settings.timezone);
  const [paymentTermDays, setPaymentTermDays] = useState(String(settings.payment_term_days));
  const [finaliseInLexware, setFinaliseInLexware] = useState(settings.finalise_in_lexware);
  const [labels, setLabels] = useState<InvoiceKindLabel[]>(kindLabels);
  const [isSaving, setIsSaving] = useState(false);

  function resetToSaved() {
    setDefaultVatRate(String(settings.default_vat_rate));
    setCountryCode(settings.country_code);
    setInvoiceFallbackLabel(settings.invoice_fallback_label);
    setInvoiceUnitName(settings.invoice_unit_name);
    setDefaultPaymentMethod(settings.default_payment_method);
    setDocumentFallbackLabel(settings.document_fallback_label);
    setTimezone(settings.timezone);
    setPaymentTermDays(String(settings.payment_term_days));
    setFinaliseInLexware(settings.finalise_in_lexware);
    setLabels(kindLabels);
  }

  useEffect(resetToSaved, [settings, kindLabels]);

  const parsedVatRate = parseDecimalInput(defaultVatRate);
  const vatRateInvalid =
    parsedVatRate === null ||
    Number.isNaN(parsedVatRate) ||
    parsedVatRate < 0 ||
    parsedVatRate > 100;
  const countryCodeInvalid = !COUNTRY_CODE_SHAPE.test(countryCode);
  const parsedPaymentTermDays = parseDecimalInput(paymentTermDays);
  const paymentTermDaysInvalid =
    parsedPaymentTermDays === null ||
    Number.isNaN(parsedPaymentTermDays) ||
    !Number.isInteger(parsedPaymentTermDays) ||
    parsedPaymentTermDays < 0 ||
    parsedPaymentTermDays > 365;
  const textInvalid =
    invoiceFallbackLabel.trim() === "" ||
    invoiceUnitName.trim() === "" ||
    defaultPaymentMethod.trim() === "" ||
    documentFallbackLabel.trim() === "";
  const timezoneInvalid = timezone.trim() === "";
  const duplicateKinds = new Set(
    labels
      .map((row) => row.kind)
      .filter((kind, index, all) => all.indexOf(kind) !== index && kind !== ""),
  );
  const labelsInvalid = labels.some(
    (row) => !KIND_SHAPE.test(row.kind) || row.label.trim() === "" || duplicateKinds.has(row.kind),
  );
  const invalid =
    vatRateInvalid ||
    countryCodeInvalid ||
    paymentTermDaysInvalid ||
    textInvalid ||
    timezoneInvalid ||
    labelsInvalid;

  const draftLabelByKind = new Map(labels.map((row) => [row.kind, row.label]));
  const labelsChanged =
    draftLabelByKind.size !== labels.length ||
    draftLabelByKind.size !== kindLabels.length ||
    kindLabels.some((stored) => draftLabelByKind.get(stored.kind) !== stored.label);
  const dirty =
    parsedVatRate !== Number(settings.default_vat_rate) ||
    countryCode !== settings.country_code ||
    invoiceFallbackLabel !== settings.invoice_fallback_label ||
    invoiceUnitName !== settings.invoice_unit_name ||
    defaultPaymentMethod !== settings.default_payment_method ||
    documentFallbackLabel !== settings.document_fallback_label ||
    timezone !== settings.timezone ||
    parsedPaymentTermDays !== Number(settings.payment_term_days) ||
    finaliseInLexware !== settings.finalise_in_lexware ||
    labelsChanged;

  const editingDisabled = !canEdit || isSaving;

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  async function save() {
    if (parsedVatRate === null || parsedPaymentTermDays === null || isSaving) return;
    setIsSaving(true);
    try {
      await updateSettings.mutateAsync({
        default_vat_rate: parsedVatRate,
        country_code: countryCode,
        invoice_fallback_label: invoiceFallbackLabel,
        invoice_unit_name: invoiceUnitName,
        default_payment_method: defaultPaymentMethod,
        document_fallback_label: documentFallbackLabel,
        timezone,
        payment_term_days: parsedPaymentTermDays,
        finalise_in_lexware: finaliseInLexware,
      });
      await saveKindLabels.mutateAsync(labels);
      toast.success(t("invoiceSettings.toast.saved"));
    } catch (error) {
      toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) }));
    } finally {
      setIsSaving(false);
    }
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col shadow-none">
          <CardHeader>
            <CardTitle>{t("invoiceSettings.card.tax.title")}</CardTitle>
            <CardDescription>{t("invoiceSettings.card.tax.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("invoiceSettings.field.defaultVatRate")}
              value={defaultVatRate}
              onChange={(value) => setDefaultVatRate(sanitizeAmountInput(value))}
              disabled={editingDisabled}
              invalid={vatRateInvalid}
              errorText={t("invoiceSettings.defaultVatRateInvalid")}
            />
            <Field
              label={t("invoiceSettings.field.countryCode")}
              value={countryCode}
              onChange={(value) => setCountryCode(value.toUpperCase())}
              disabled={editingDisabled}
              invalid={countryCodeInvalid}
              errorText={t("invoiceSettings.countryCodeInvalid")}
              maxLength={2}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col shadow-none">
          <CardHeader>
            <CardTitle>{t("invoiceSettings.card.wording.title")}</CardTitle>
            <CardDescription>{t("invoiceSettings.card.wording.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("invoiceSettings.field.invoiceFallbackLabel")}
              value={invoiceFallbackLabel}
              onChange={setInvoiceFallbackLabel}
              disabled={editingDisabled}
              invalid={invoiceFallbackLabel.trim() === ""}
              errorText={t("invoiceSettings.textRequired")}
            />
            <Field
              label={t("invoiceSettings.field.invoiceUnitName")}
              value={invoiceUnitName}
              onChange={setInvoiceUnitName}
              disabled={editingDisabled}
              invalid={invoiceUnitName.trim() === ""}
              errorText={t("invoiceSettings.textRequired")}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col shadow-none">
          <CardHeader>
            <CardTitle>{t("invoiceSettings.card.voucherRemark.title")}</CardTitle>
            <CardDescription>{t("invoiceSettings.card.voucherRemark.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("invoiceSettings.field.defaultPaymentMethod")}
              value={defaultPaymentMethod}
              onChange={setDefaultPaymentMethod}
              disabled={editingDisabled}
              invalid={defaultPaymentMethod.trim() === ""}
              errorText={t("invoiceSettings.textRequired")}
            />
            <Field
              label={t("invoiceSettings.field.documentFallbackLabel")}
              value={documentFallbackLabel}
              onChange={setDocumentFallbackLabel}
              disabled={editingDisabled}
              invalid={documentFallbackLabel.trim() === ""}
              errorText={t("invoiceSettings.textRequired")}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col shadow-none">
          <CardHeader>
            <CardTitle>{t("invoiceSettings.card.timezone.title")}</CardTitle>
            <CardDescription>{t("invoiceSettings.card.timezone.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("invoiceSettings.field.timezone")}
              </Label>
              <Combobox
                value={timezone}
                onValueChange={setTimezone}
                options={TIMEZONE_OPTIONS}
                disabled={editingDisabled}
                invalid={timezoneInvalid}
              />
              {timezoneInvalid && (
                <p className="text-xs text-amber-700">{t("invoiceSettings.timezoneInvalid")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col shadow-none">
          <CardHeader>
            <CardTitle>{t("invoiceSettings.card.lexware.title")}</CardTitle>
            <CardDescription>{t("invoiceSettings.card.lexware.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("invoiceSettings.field.paymentTermDays")}
              value={paymentTermDays}
              onChange={(value) => setPaymentTermDays(sanitizeAmountInput(value))}
              disabled={editingDisabled}
              invalid={paymentTermDaysInvalid}
              errorText={t("invoiceSettings.paymentTermDaysInvalid")}
            />
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Checkbox
                className="mt-0.5"
                checked={finaliseInLexware}
                onCheckedChange={(checked) => setFinaliseInLexware(checked === true)}
                disabled={editingDisabled}
              />
              <span>
                {t("invoiceSettings.field.finaliseInLexware")}
                <span className="block text-xs text-muted-foreground">
                  {t("invoiceSettings.finaliseInLexwareHint")}
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      <Card className="flex flex-col shadow-none">
        <CardHeader>
          <CardTitle>{t("invoiceSettings.card.kindLabels.title")}</CardTitle>
          <CardDescription>{t("invoiceSettings.card.kindLabels.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {labels.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("invoiceSettings.kindLabels.empty")}</p>
          )}
          {labels.map((row, index) => {
            const kindDuplicated = duplicateKinds.has(row.kind);
            const kindShapeWrong = !KIND_SHAPE.test(row.kind);
            return (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("invoiceSettings.field.kind")}
                  </Label>
                  <Input
                    value={row.kind}
                    disabled={editingDisabled}
                    aria-invalid={kindShapeWrong || kindDuplicated}
                    onChange={(event) =>
                      setLabels(
                        labels.map((one, position) =>
                          position === index ? { ...one, kind: event.target.value } : one,
                        ),
                      )
                    }
                  />
                  {kindShapeWrong ? (
                    <p className="text-xs text-amber-700">{t("invoiceSettings.kindInvalid")}</p>
                  ) : kindDuplicated ? (
                    <p className="text-xs text-amber-700">{t("invoiceSettings.kindDuplicate")}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t("invoiceSettings.field.kindLabel")}
                  </Label>
                  <Input
                    value={row.label}
                    disabled={editingDisabled}
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
                    disabled={editingDisabled}
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
              disabled={editingDisabled}
              onClick={() => setLabels([...labels, { kind: "", label: "" }])}
            >
              <Plus /> {t("invoiceSettings.kindLabels.add")}
            </Button>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Button variant="outline" onClick={resetToSaved} disabled={isSaving}>
              {t("invoiceSettings.discard")}
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || invalid || isSaving}>
            {isSaving ? t("invoiceSettings.saving") : t("invoiceSettings.save")}
          </Button>
        </div>
      )}

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoiceSettings.unsavedChanges.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoiceSettings.unsavedChanges.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.status === "blocked" && blocker.reset()}>
              {t("invoiceSettings.unsavedChanges.continueEditing")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blocker.status === "blocked" && blocker.proceed()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("invoiceSettings.unsavedChanges.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
