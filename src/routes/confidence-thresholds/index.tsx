import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { NoAccess } from "@/components/layout/no-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/documents/query-states";
import {
  useConfidenceSettings,
  useUpdateConfidenceSettings,
  type ConfidenceSettings,
} from "@/data/confidence-settings";
import { useEmployees } from "@/data/team/team";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { errorText, formatDateTime } from "@/lib/data/format";
import { pageTitle } from "@/config/brand";

const PAGE_CONFIDENCE_THRESHOLDS = "page.confidence_thresholds";

export const Route = createFileRoute("/confidence-thresholds/")({
  head: () => ({ meta: [{ title: pageTitle("Erkennungsschwellen") }] }),
  staticData: { titleKey: "confidenceThresholds" },
  component: ConfidenceThresholdsGuard,
});

function ConfidenceThresholdsGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PAGE_CONFIDENCE_THRESHOLDS)) return <NoAccess />;
  return <ConfidenceThresholdsPage />;
}

function toPercent(fraction: number): number {
  return Math.round(fraction * 100);
}
function toFraction(percent: number): number {
  return percent / 100;
}

function ConfidenceThresholdsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const q = useConfidenceSettings();

  return (
    <div>
      <div data-tour="thresholds-header">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("confidenceThresholds.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("confidenceThresholds.subtitle")}
        </p>
      </div>

      <div data-tour="thresholds-values" className="mt-6 max-w-xl">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <SettingsForm settings={q.data} canEdit={can(PAGE_CONFIDENCE_THRESHOLDS)} />
        )}
      </div>
    </div>
  );
}

function SettingsForm({ settings, canEdit }: { settings: ConfidenceSettings; canEdit: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateConfidenceSettings();
  const employeesQ = useEmployees();
  const namesByEmail = new Map(
    (employeesQ.data ?? [])
      .filter((e) => e.name)
      .map((e) => [e.email.toLowerCase(), e.name as string]),
  );

  const [green, setGreen] = useState(toPercent(settings.ampel_green_min));
  const [yellow, setYellow] = useState(toPercent(settings.ampel_yellow_min));
  const [relevance, setRelevance] = useState(toPercent(settings.relevance_min_konfidenz));
  const [nonInvoiceMax, setNonInvoiceMax] = useState(
    toPercent(settings.relevance_noninvoice_max_konfidenz),
  );

  useEffect(() => {
    setGreen(toPercent(settings.ampel_green_min));
    setYellow(toPercent(settings.ampel_yellow_min));
    setRelevance(toPercent(settings.relevance_min_konfidenz));
    setNonInvoiceMax(toPercent(settings.relevance_noninvoice_max_konfidenz));
  }, [settings]);

  const orderInvalid = !(green >= yellow && yellow >= relevance);
  const rangeInvalid = [green, yellow, relevance, nonInvoiceMax].some((v) => v <= 0 || v > 100);
  const invalid = orderInvalid || rangeInvalid;

  const dirty =
    green !== toPercent(settings.ampel_green_min) ||
    yellow !== toPercent(settings.ampel_yellow_min) ||
    relevance !== toPercent(settings.relevance_min_konfidenz) ||
    nonInvoiceMax !== toPercent(settings.relevance_noninvoice_max_konfidenz);

  function save() {
    update.mutate(
      {
        ampel_green_min: toFraction(green),
        ampel_yellow_min: toFraction(yellow),
        relevance_min_konfidenz: toFraction(relevance),
        relevance_noninvoice_max_konfidenz: toFraction(nonInvoiceMax),
      },
      {
        onSuccess: () => toast.success(t("confidenceThresholds.toast.saved")),
        onError: (e) =>
          toast.error(t("confidenceThresholds.toast.failed", { error: errorText(e) })),
      },
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("confidenceThresholds.readOnlyHint")}
        </p>
      )}

      {settings.updated_at && (
        <p className="text-xs text-muted-foreground">
          {t("confidenceThresholds.lastChanged", {
            who:
              (settings.updated_by && namesByEmail.get(settings.updated_by.toLowerCase())) ||
              settings.updated_by ||
              t("confidenceThresholds.unknown"),
            when: formatDateTime(settings.updated_at),
          })}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("confidenceThresholds.card.routing.title")}</CardTitle>
          <CardDescription>{t("confidenceThresholds.card.routing.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PercentField
            label={t("confidenceThresholds.field.relevance")}
            hint={t("confidenceThresholds.field.relevanceHint")}
            value={relevance}
            disabled={!canEdit}
            onChange={setRelevance}
          />
          <PercentField
            label={t("confidenceThresholds.field.nonInvoiceMax")}
            hint={t("confidenceThresholds.field.nonInvoiceMaxHint")}
            value={nonInvoiceMax}
            disabled={!canEdit}
            onChange={setNonInvoiceMax}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("confidenceThresholds.card.trafficLight.title")}</CardTitle>
          <CardDescription>{t("confidenceThresholds.card.trafficLight.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PercentField
            label={t("confidenceThresholds.field.green")}
            value={green}
            disabled={!canEdit}
            onChange={setGreen}
          />
          <PercentField
            label={t("confidenceThresholds.field.yellow")}
            value={yellow}
            disabled={!canEdit}
            onChange={setYellow}
          />
          {orderInvalid && (
            <p className="text-xs text-amber-700">{t("confidenceThresholds.orderInvalid")}</p>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || invalid || update.isPending}>
            {update.isPending ? t("confidenceThresholds.saving") : t("confidenceThresholds.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function PercentField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
