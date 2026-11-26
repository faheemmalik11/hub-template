import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/documents/query-states";
import { InvoiceMailTemplatesPanel } from "@/components/invoice-settings/invoice-mail-templates-panel";
import {
  useAppUserNameByEmail,
  useInvoiceKindLabels,
  useInvoiceSettings,
  useSaveInvoiceKindLabels,
  useUpdateInvoiceSettings,
} from "@/data";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { Trans, useTranslation } from "@/lib/i18n";
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
  head: () => ({ meta: [{ title: pageTitle("Rechnungseinstellungen") }] }),
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
  const canEdit = can(PERMISSIONS.settingsManage);

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

      <div className="mt-6">
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
          <Tabs defaultValue="defaults">
            <TabsList>
              <TabsTrigger value="defaults">{t("invoiceSettings.tabs.defaults")}</TabsTrigger>
              <TabsTrigger value="mailTemplates">
                {t("invoiceSettings.tabs.mailTemplates")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="defaults" className="mt-4">
              <SettingsForm
                settings={settingsQuery.data}
                kindLabels={labelsQuery.data}
                canEdit={canEdit}
              />
            </TabsContent>
            <TabsContent value="mailTemplates" className="mt-4">
              <InvoiceMailTemplatesPanel canEdit={canEdit} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function SettingsRow({
  title,
  desc,
  children,
  wide,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="grid gap-4 border-b border-border/60 px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,240px)_1fr] sm:gap-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className={wide ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>{children}</div>
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
  const [buyerPaymentTermDays, setBuyerPaymentTermDays] = useState(
    settings.buyer_payment_term_days === null ? "" : String(settings.buyer_payment_term_days),
  );
  const [finaliseInLexware, setFinaliseInLexware] = useState(settings.finalise_in_lexware);
  const [paymentDueDateReminderDays, setPaymentDueDateReminderDays] = useState(
    String(settings.payment_due_date_reminder_days),
  );
  const [labels, setLabels] = useState<InvoiceKindLabel[]>(kindLabels);
  const [isSaving, setIsSaving] = useState(false);

  const lastChangedByNameQ = useAppUserNameByEmail(settings.updated_by);
  const lastChangedByName =
    lastChangedByNameQ.data ?? settings.updated_by ?? t("invoiceSettings.unknown");

  function resetToSaved() {
    setDefaultVatRate(String(settings.default_vat_rate));
    setCountryCode(settings.country_code);
    setInvoiceFallbackLabel(settings.invoice_fallback_label);
    setInvoiceUnitName(settings.invoice_unit_name);
    setDefaultPaymentMethod(settings.default_payment_method);
    setDocumentFallbackLabel(settings.document_fallback_label);
    setTimezone(settings.timezone);
    setPaymentTermDays(String(settings.payment_term_days));
    setBuyerPaymentTermDays(
      settings.buyer_payment_term_days === null ? "" : String(settings.buyer_payment_term_days),
    );
    setFinaliseInLexware(settings.finalise_in_lexware);
    setPaymentDueDateReminderDays(String(settings.payment_due_date_reminder_days));
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
  const parsedBuyerPaymentTermDays =
    buyerPaymentTermDays.trim() === "" ? null : parseDecimalInput(buyerPaymentTermDays);
  const buyerPaymentTermDaysInvalid =
    buyerPaymentTermDays.trim() !== "" &&
    (parsedBuyerPaymentTermDays === null ||
      Number.isNaN(parsedBuyerPaymentTermDays) ||
      !Number.isInteger(parsedBuyerPaymentTermDays) ||
      parsedBuyerPaymentTermDays < 0 ||
      parsedBuyerPaymentTermDays > 365);
  const parsedPaymentDueDateReminderDays = parseDecimalInput(paymentDueDateReminderDays);
  const paymentDueDateReminderDaysInvalid =
    parsedPaymentDueDateReminderDays === null ||
    Number.isNaN(parsedPaymentDueDateReminderDays) ||
    !Number.isInteger(parsedPaymentDueDateReminderDays) ||
    parsedPaymentDueDateReminderDays < 0 ||
    parsedPaymentDueDateReminderDays > 365;
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
    buyerPaymentTermDaysInvalid ||
    paymentDueDateReminderDaysInvalid ||
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
    parsedBuyerPaymentTermDays !== settings.buyer_payment_term_days ||
    finaliseInLexware !== settings.finalise_in_lexware ||
    parsedPaymentDueDateReminderDays !== Number(settings.payment_due_date_reminder_days) ||
    labelsChanged;

  const editingDisabled = !canEdit || isSaving;

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  async function save() {
    if (
      parsedVatRate === null ||
      parsedPaymentTermDays === null ||
      buyerPaymentTermDaysInvalid ||
      parsedPaymentDueDateReminderDays === null ||
      isSaving
    )
      return;
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
        buyer_payment_term_days: parsedBuyerPaymentTermDays,
        finalise_in_lexware: finaliseInLexware,
        payment_due_date_reminder_days: parsedPaymentDueDateReminderDays,
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
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("invoiceSettings.readOnlyHint")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {t("invoiceSettings.effectHint")}
        {settings.updated_at && (
          <Trans
            i18nKey="invoiceSettings.lastChangedBySuffix"
            values={{ who: lastChangedByName, when: formatDateTime(settings.updated_at) }}
            components={{ strong: <strong className="font-medium text-foreground" /> }}
          />
        )}
      </p>

      <div className="rounded-xl border border-border bg-card">
        <SettingsRow
          title={t("invoiceSettings.card.tax.title")}
          desc={t("invoiceSettings.card.tax.desc")}
        >
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
        </SettingsRow>

        <SettingsRow
          title={t("invoiceSettings.card.wording.title")}
          desc={t("invoiceSettings.card.wording.desc")}
        >
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
        </SettingsRow>

        <SettingsRow
          title={t("invoiceSettings.card.voucherRemark.title")}
          desc={t("invoiceSettings.card.voucherRemark.desc")}
        >
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
        </SettingsRow>

        <SettingsRow
          title={t("invoiceSettings.card.timezone.title")}
          desc={t("invoiceSettings.card.timezone.desc")}
        >
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
        </SettingsRow>

        <SettingsRow
          title={t("invoiceSettings.card.lexware.title")}
          desc={t("invoiceSettings.card.lexware.desc")}
        >
          <Field
            label={t("invoiceSettings.field.paymentTermDays")}
            value={paymentTermDays}
            onChange={(value) => setPaymentTermDays(sanitizeAmountInput(value))}
            disabled={editingDisabled}
            invalid={paymentTermDaysInvalid}
            errorText={t("invoiceSettings.paymentTermDaysInvalid")}
          />
          <div className="space-y-1">
            <Field
              label={t("invoiceSettings.field.buyerPaymentTermDays")}
              value={buyerPaymentTermDays}
              onChange={(value) => setBuyerPaymentTermDays(sanitizeAmountInput(value))}
              disabled={editingDisabled}
              invalid={buyerPaymentTermDaysInvalid}
              errorText={t("invoiceSettings.buyerPaymentTermDaysInvalid")}
            />
            <p className="text-xs text-muted-foreground">
              {t("invoiceSettings.buyerPaymentTermDaysHint")}
            </p>
          </div>
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
        </SettingsRow>

        <SettingsRow
          title={t("invoiceSettings.card.reminders.title")}
          desc={t("invoiceSettings.card.reminders.desc")}
        >
          <div className="space-y-1">
            <Field
              label={t("invoiceSettings.field.paymentDueDateReminderDays")}
              value={paymentDueDateReminderDays}
              onChange={(value) => setPaymentDueDateReminderDays(sanitizeAmountInput(value))}
              disabled={editingDisabled}
              invalid={paymentDueDateReminderDaysInvalid}
              errorText={t("invoiceSettings.paymentDueDateReminderDaysInvalid")}
            />
            <p className="text-xs text-muted-foreground">
              {t("invoiceSettings.paymentDueDateReminderDaysHint")}
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          title={t("invoiceSettings.card.kindLabels.title")}
          desc={t("invoiceSettings.card.kindLabels.desc")}
          wide
        >
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
              disabled={editingDisabled || labelsInvalid}
              onClick={() => setLabels([...labels, { kind: "", label: "" }])}
            >
              <Plus /> {t("invoiceSettings.kindLabels.add")}
            </Button>
          )}
        </SettingsRow>
      </div>

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
