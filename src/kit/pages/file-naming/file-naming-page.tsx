import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Skeleton } from "../../ui/skeleton";
import { Switch } from "../../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { ErrorState, readableErrorMessage } from "../../components/feedback/query-states";
import { englishFormatters, type Formatters } from "../../lib/formatters";
import type {
  FileNamingAdapter,
  FileNamingDescriptionSource,
  FileNamingSettings,
  FileNamingSettingsInput,
} from "../../adapters/file-naming";
import { buildSuggestedFilename, UNSAFE_FILENAME_CHARS } from "./build-filename";
import { englishFileNamingLabels, type FileNamingLabels } from "./labels";

const DESCRIPTION_SOURCES: FileNamingDescriptionSource[] = [
  "service_description",
  "cost_category",
  "none",
];

export interface FileNamingPageProps {
  adapter: FileNamingAdapter;
  canEdit: boolean;
  labels?: FileNamingLabels;
  formatters?: Formatters;
}

export function FileNamingPage({
  adapter,
  canEdit,
  labels = englishFileNamingLabels,
  formatters = englishFormatters,
}: FileNamingPageProps) {
  const settingsQuery = adapter.useSettings();

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="mt-6">
        {settingsQuery.isError ? (
          <ErrorState error={settingsQuery.error} onRetry={settingsQuery.refetch} />
        ) : settingsQuery.isLoading || !settingsQuery.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <SettingsForm
            settings={settingsQuery.data}
            canEdit={canEdit}
            adapter={adapter}
            labels={labels}
            formatters={formatters}
          />
        )}
      </div>
    </div>
  );
}

function SettingsForm({
  settings,
  canEdit,
  adapter,
  labels,
  formatters,
}: {
  settings: FileNamingSettings;
  canEdit: boolean;
  adapter: FileNamingAdapter;
  labels: FileNamingLabels;
  formatters: Formatters;
}) {
  const [separator, setSeparator] = useState(settings.separator);
  const [vatSuffix, setVatSuffix] = useState(settings.vatSuffix);
  const [includeVatSuffix, setIncludeVatSuffix] = useState(settings.includeVatSuffix);
  const [includeAmount, setIncludeAmount] = useState(settings.includeAmount);
  const [includeProperty, setIncludeProperty] = useState(settings.includeProperty);
  const [descriptionSource, setDescriptionSource] = useState(settings.descriptionSource);
  const [transliterateUmlauts, setTransliterateUmlauts] = useState(settings.transliterateUmlauts);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync local state whenever the stored settings change underneath us.
  useEffect(() => {
    setSeparator(settings.separator);
    setVatSuffix(settings.vatSuffix);
    setIncludeVatSuffix(settings.includeVatSuffix);
    setIncludeAmount(settings.includeAmount);
    setIncludeProperty(settings.includeProperty);
    setDescriptionSource(settings.descriptionSource);
    setTransliterateUmlauts(settings.transliterateUmlauts);
  }, [settings]);

  const draft: FileNamingSettingsInput = {
    separator,
    vatSuffix,
    includeVatSuffix,
    includeAmount,
    includeProperty,
    descriptionSource,
    transliterateUmlauts,
  };

  const previews = useMemo(
    () => [
      { key: "complete", name: buildSuggestedFilename(adapter.previewInvoices.complete, draft) },
      {
        key: "withoutPropertyOrDescription",
        name: buildSuggestedFilename(adapter.previewInvoices.withoutPropertyOrDescription, draft),
      },
      { key: "minimal", name: buildSuggestedFilename(adapter.previewInvoices.minimal, draft) },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [
      adapter.previewInvoices,
      separator,
      vatSuffix,
      includeVatSuffix,
      includeAmount,
      includeProperty,
      descriptionSource,
      transliterateUmlauts,
    ],
  );

  const standard = adapter.standardSettings;
  const driftedFromStandard =
    settings.separator !== standard.separator ||
    settings.vatSuffix !== standard.vatSuffix ||
    settings.includeVatSuffix !== standard.includeVatSuffix ||
    settings.includeAmount !== standard.includeAmount ||
    settings.includeProperty !== standard.includeProperty ||
    settings.descriptionSource !== standard.descriptionSource ||
    settings.transliterateUmlauts !== standard.transliterateUmlauts;

  function restoreStandard() {
    setSeparator(standard.separator);
    setVatSuffix(standard.vatSuffix);
    setIncludeVatSuffix(standard.includeVatSuffix);
    setIncludeAmount(standard.includeAmount);
    setIncludeProperty(standard.includeProperty);
    setDescriptionSource(standard.descriptionSource);
    setTransliterateUmlauts(standard.transliterateUmlauts);
  }

  // Both free-text fields feed straight into the file name, and unsafe characters are only
  // stripped after joining — so an unsafe separator has already done its damage by then.
  const separatorInvalid = separator.length === 0 || UNSAFE_FILENAME_CHARS.test(separator);
  const vatSuffixInvalid =
    includeVatSuffix && (vatSuffix.trim().length === 0 || UNSAFE_FILENAME_CHARS.test(vatSuffix));
  const invalid = separatorInvalid || vatSuffixInvalid;

  const dirty =
    separator !== settings.separator ||
    vatSuffix !== settings.vatSuffix ||
    includeVatSuffix !== settings.includeVatSuffix ||
    includeAmount !== settings.includeAmount ||
    includeProperty !== settings.includeProperty ||
    descriptionSource !== settings.descriptionSource ||
    transliterateUmlauts !== settings.transliterateUmlauts;

  // Leaving the page must not silently throw away unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  async function save() {
    setIsSaving(true);
    try {
      await adapter.saveSettings(draft);
      toast.success(labels.saved);
    } catch (error) {
      toast.error(labels.saveFailed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {!canEdit && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {labels.readOnlyHint}
          </p>
        )}

        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {labels.forwardOnlyHint}
        </p>

        {settings.updatedAt && (
          <p className="text-xs text-muted-foreground">
            {labels.lastChanged(
              settings.updatedBy ?? labels.unknownPerson,
              formatters.formatDateTime(settings.updatedAt),
            )}
          </p>
        )}

        {driftedFromStandard && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-foreground">
            <span>{labels.driftedFromStandard}</span>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={restoreStandard}>
                {labels.restoreStandard}
              </Button>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{labels.structureCard.title}</CardTitle>
            <CardDescription>{labels.structureCard.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.separatorField}</Label>
              <Input
                value={separator}
                disabled={!canEdit}
                onChange={(event) => setSeparator(event.target.value)}
                maxLength={3}
                aria-invalid={separatorInvalid}
              />
              {separatorInvalid && (
                <p className="text-xs text-warning">{labels.separatorInvalid}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{labels.vatSuffixField}</Label>
              <Input
                value={vatSuffix}
                disabled={!canEdit}
                onChange={(event) => setVatSuffix(event.target.value)}
                maxLength={12}
                aria-invalid={vatSuffixInvalid}
              />
              {vatSuffixInvalid && (
                <p className="text-xs text-warning">{labels.vatSuffixInvalid}</p>
              )}
              <p className="text-xs text-muted-foreground">{labels.vatSuffixJoinerHint}</p>
            </div>

            <ToggleRow
              label={labels.includeVatSuffix}
              checked={includeVatSuffix}
              disabled={!canEdit}
              onCheckedChange={setIncludeVatSuffix}
            />
            <ToggleRow
              label={labels.includeAmount}
              checked={includeAmount}
              disabled={!canEdit}
              onCheckedChange={setIncludeAmount}
            />
            <ToggleRow
              label={labels.includeProperty}
              checked={includeProperty}
              disabled={!canEdit}
              onCheckedChange={setIncludeProperty}
            />
            <ToggleRow
              label={labels.transliterateUmlauts}
              checked={transliterateUmlauts}
              disabled={!canEdit}
              onCheckedChange={setTransliterateUmlauts}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{labels.descriptionCard.title}</CardTitle>
            <CardDescription>{labels.descriptionCard.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 sm:max-w-xs">
              <Label className="text-xs text-muted-foreground">
                {labels.descriptionSourceField}
              </Label>
              <Select
                value={descriptionSource}
                disabled={!canEdit}
                onValueChange={(value) =>
                  setDescriptionSource(value as FileNamingDescriptionSource)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DESCRIPTION_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {labels.descriptionSource[source]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || invalid || isSaving}>
              {isSaving ? labels.saving : labels.save}
            </Button>
          </div>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{labels.previewCard.title}</CardTitle>
          <CardDescription>{labels.previewCard.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm break-all text-foreground">
            {previews[0]?.name ?? labels.previewEmpty}
          </p>
          <div className="mt-3 space-y-3">
            {previews.slice(1).map((preview) => (
              <div key={preview.key} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {preview.key === "withoutPropertyOrDescription"
                    ? labels.previewCase.withoutPropertyOrDescription
                    : labels.previewCase.minimal}
                </p>
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm break-all text-foreground">
                  {preview.name ?? labels.previewEmpty}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{labels.previewTypeHint}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
