import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { NoAccess } from "@/components/layout/no-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/documents/query-states";
import { useFilenameSettings, useUpdateFilenameSettings } from "@/data";
import { buildSuggestedFilename } from "@/lib/filename";
import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { useTranslation } from "@/lib/i18n";
import type { Document, FilenameDescriptionSource, FilenameSettings } from "@/lib/data/types";
import { pageTitle } from "@/config/brand";
import { errorText, formatDateTime } from "@/lib/data/format";

/**
 * The USt-Kennzeichen controls are hidden (Saskia, a client meeting 09.09.2026, 30:16).
 *
 * She did not know what the field was for, and for this client the answer never varies: here there is
 * always VAT, at the other companies never, so the choice only ever produced a decision nobody was
 * equipped to make. The COLUMNS and the filename logic stay -- other real-estate clients do want
 * the suffix -- so re-enabling this is one boolean, not a migration back.
 */
const SHOW_VAT_MARKER = false;

export const Route = createFileRoute("/file-naming/")({
  head: () => ({ meta: [{ title: pageTitle("Dateibenennung") }] }),
  component: FileNamingGuard,
});

// A page hidden from a role in the nav must not be reachable by URL either. This screen sits in the
// admin-only Verwaltung group (`roles: ADMIN_ROLES`), but nothing enforced it on the route — an
// assistant who typed /dateibenennung got the whole form. It rendered read-only, so nothing could be
// changed, but "cannot edit it" is not "may not see it", and the naming convention is configuration.
function FileNamingGuard() {
  const { ready, can } = useAuth();
  if (!ready) return null;
  if (!can(PERMISSIONS.pageFileNaming)) return <NoAccess />;
  return <FileNamingPage />;
}

// A representative example — used to preview the pattern live as settings change. Only the
// fields buildSuggestedFilename reads are set; the rest are irrelevant here.
const PREVIEW_DOCUMENT = {
  document_date: "2026-03-15",
  company_code: "STAY",
  issuer: "Müller Sanitärinstallation",
  service_description: "Sanitär",
  cost_category: "Instandhaltung",
  amount_gross: 4850,
  property_code: "P-01",
  vat_rate: 19,
  vat_treatment: "taxable",
} as unknown as Document;

// The exact set buildSuggestedFilename strips from the joined name (filename.ts's UNSAFE_CHARS).
const UNSAFE_FILENAME_CHARS = /[\\\\/:*?"<>|]/;

// A receipt with no property and no service description — common, and the shape the single
// "everything populated" example never showed.
const PREVIEW_WITHOUT_PROPERTY = {
  ...PREVIEW_DOCUMENT,
  property_code: null,
  service_description: null,
} as unknown as Document;

// Only what the AI reliably extracts first; buildSuggestedFilename returns null below this.
const PREVIEW_MINIMAL = {
  document_date: "2026-03-15",
  company_code: "IMKO",
} as unknown as Document;

const DESCRIPTION_SOURCES: FilenameDescriptionSource[] = [
  "service_description",
  "cost_category",
  "none",
];

function FileNamingPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const q = useFilenameSettings();

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("fileNaming.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("fileNaming.subtitle")}</p>
      </div>

      <div className="mt-6">
        {q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <SettingsForm settings={q.data} canEdit={can(PERMISSIONS.pageFileNaming)} />
        )}
      </div>
    </div>
  );
}

function SettingsForm({ settings, canEdit }: { settings: FilenameSettings; canEdit: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateFilenameSettings();

  const [separator, setSeparator] = useState(settings.separator);
  const [vatSuffix, setVatSuffix] = useState(settings.vat_suffix);
  const [includeVatSuffix, setIncludeVatSuffix] = useState(settings.include_vat_suffix);
  const [includeAmount, setIncludeAmount] = useState(settings.include_amount);
  const [includeProperty, setIncludeProperty] = useState(settings.include_property);
  const [descriptionSource, setDescriptionSource] = useState(settings.description_source);
  const [transliterateUmlauts, setTransliterateUmlauts] = useState(settings.transliterate_accents);

  // Re-sync local state whenever the server row changes underneath us (e.g. another admin saved).
  useEffect(() => {
    setSeparator(settings.separator);
    setVatSuffix(settings.vat_suffix);
    setIncludeVatSuffix(settings.include_vat_suffix);
    setIncludeAmount(settings.include_amount);
    setIncludeProperty(settings.include_property);
    setDescriptionSource(settings.description_source);
    setTransliterateUmlauts(settings.transliterate_accents);
  }, [settings]);

  const previews = useMemo(() => {
    const draft: FilenameSettings = {
      ...settings,
      separator,
      vat_suffix: vatSuffix,
      include_vat_suffix: includeVatSuffix,
      include_amount: includeAmount,
      include_property: includeProperty,
      description_source: descriptionSource,
      transliterate_accents: transliterateUmlauts,
    };
    // #6: three shapes, not one — the settings' effect on incomplete data was invisible.
    return [
      { key: "vollstaendig", name: buildSuggestedFilename(PREVIEW_DOCUMENT, draft) },
      { key: "ohneObjekt", name: buildSuggestedFilename(PREVIEW_WITHOUT_PROPERTY, draft) },
      { key: "minimal", name: buildSuggestedFilename(PREVIEW_MINIMAL, draft) },
    ];
  }, [
    settings,
    separator,
    vatSuffix,
    includeVatSuffix,
    includeAmount,
    includeProperty,
    descriptionSource,
    transliterateUmlauts,
  ]);

  // The convention the briefing specifies, mirrored from the migration's own column defaults.
  const STANDARD = {
    separator: " ",
    vat_suffix: "UST",
    include_vat_suffix: true,
    include_amount: true,
    include_property: true,
    description_source: "service_description" as FilenameDescriptionSource,
    transliterate_accents: true,
  };
  const differsFromStandard =
    settings.separator !== STANDARD.separator ||
    settings.vat_suffix !== STANDARD.vat_suffix ||
    settings.include_vat_suffix !== STANDARD.include_vat_suffix ||
    settings.include_amount !== STANDARD.include_amount ||
    settings.include_property !== STANDARD.include_property ||
    settings.description_source !== STANDARD.description_source ||
    settings.transliterate_accents !== STANDARD.transliterate_accents;

  function resetToDefault() {
    setSeparator(STANDARD.separator);
    setVatSuffix(STANDARD.vat_suffix);
    setIncludeVatSuffix(STANDARD.include_vat_suffix);
    setIncludeAmount(STANDARD.include_amount);
    setIncludeProperty(STANDARD.include_property);
    setDescriptionSource(STANDARD.description_source);
    setTransliterateUmlauts(STANDARD.transliterate_accents);
  }

  // #1/#9: both free-text fields feed straight into a filename, and buildSuggestedFilename strips
  // unsafe characters only AFTER joining — so an unsafe separator is removed once it has already
  // done its job, gluing every part together. The preview showed the damage; nothing said why.
  const separatorInvalid = separator.length === 0 || UNSAFE_FILENAME_CHARS.test(separator);
  // Only while the field is on screen: a hidden control that cannot be corrected must never be
  // the reason Save is dead.
  const vatSuffixInvalid =
    SHOW_VAT_MARKER &&
    includeVatSuffix &&
    (vatSuffix.trim().length === 0 || UNSAFE_FILENAME_CHARS.test(vatSuffix));
  const invalid = separatorInvalid || vatSuffixInvalid;

  const dirty =
    separator !== settings.separator ||
    vatSuffix !== settings.vat_suffix ||
    includeVatSuffix !== settings.include_vat_suffix ||
    includeAmount !== settings.include_amount ||
    includeProperty !== settings.include_property ||
    descriptionSource !== settings.description_source ||
    transliterateUmlauts !== settings.transliterate_accents;

  // #4: leaving the page threw the edits away silently. The `dirty` flag already existed for the
  // save button; nothing ever used it to protect the work.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save() {
    update.mutate(
      {
        separator,
        vat_suffix: vatSuffix,
        include_vat_suffix: includeVatSuffix,
        include_amount: includeAmount,
        include_property: includeProperty,
        description_source: descriptionSource,
        transliterate_accents: transliterateUmlauts,
      },
      {
        onSuccess: () => toast.success(t("fileNaming.toast.saved")),
        onError: (e) =>
          toast.error(
            t("fileNaming.toast.failed", {
              error: errorText(e),
            }),
          ),
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {!canEdit && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("fileNaming.readOnlyHint")}
          </p>
        )}

        {/* #5 + #7: forward-only, and one convention for the whole Hub rather than per company. */}
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("fileNaming.wirkungHinweis")}
        </p>

        {/* #3: updated_by/updated_at were collected on every save and shown nowhere. */}
        {settings.updated_at && (
          <p className="text-xs text-muted-foreground">
            {t("fileNaming.zuletztGeaendert", {
              who: settings.updated_by ?? t("fileNaming.unbekannt"),
              when: formatDateTime(settings.updated_at),
            })}
          </p>
        )}

        {/* #2: the stored convention had drifted from the specified one, silently and irreversibly. */}
        {differsFromStandard && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>{t("fileNaming.abweichung")}</span>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={resetToDefault}>
                {t("fileNaming.standardWiederherstellen")}
              </Button>
            )}
          </div>
        )}

        <Card data-tour="filename-structure">
          <CardHeader>
            <CardTitle>{t("fileNaming.card.structure.title")}</CardTitle>
            <CardDescription>{t("fileNaming.card.structure.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t("fileNaming.field.separator")}
              </Label>
              <Input
                value={separator}
                disabled={!canEdit}
                onChange={(e) => setSeparator(e.target.value)}
                maxLength={3}
                aria-invalid={separatorInvalid}
              />
              {separatorInvalid && (
                <p className="text-xs text-amber-700">{t("fileNaming.trennzeichenUngueltig")}</p>
              )}
            </div>
            {SHOW_VAT_MARKER && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t("fileNaming.field.vatSuffix")}
                </Label>
                <Input
                  value={vatSuffix}
                  disabled={!canEdit}
                  onChange={(e) => setVatSuffix(e.target.value)}
                  maxLength={12}
                  aria-invalid={vatSuffixInvalid}
                />
                {vatSuffixInvalid && (
                  <p className="text-xs text-amber-700">
                    {t("fileNaming.ustKennzeichenUngueltig")}
                  </p>
                )}
                {/* #8: the joiner is a hardcoded "_", not the separator above. */}
                <p className="text-xs text-muted-foreground">
                  {t("fileNaming.ustKennzeichenHinweis")}
                </p>
              </div>
            )}

            {SHOW_VAT_MARKER && (
              <ToggleRow
                label={t("fileNaming.field.includeVatSuffix")}
                checked={includeVatSuffix}
                disabled={!canEdit}
                onCheckedChange={setIncludeVatSuffix}
              />
            )}
            <ToggleRow
              label={t("fileNaming.field.includeAmount")}
              checked={includeAmount}
              disabled={!canEdit}
              onCheckedChange={setIncludeAmount}
            />
            <ToggleRow
              label={t("fileNaming.field.includeProperty")}
              checked={includeProperty}
              disabled={!canEdit}
              onCheckedChange={setIncludeProperty}
            />
            <ToggleRow
              label={t("fileNaming.field.transliterateUmlauts")}
              checked={transliterateUmlauts}
              disabled={!canEdit}
              onCheckedChange={setTransliterateUmlauts}
            />
          </CardContent>
        </Card>

        <Card data-tour="filename-description">
          <CardHeader>
            <CardTitle>{t("fileNaming.card.description.title")}</CardTitle>
            <CardDescription>{t("fileNaming.card.description.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 sm:max-w-xs">
              <Label className="text-xs text-muted-foreground">
                {t("fileNaming.field.descriptionSource")}
              </Label>
              <Select
                value={descriptionSource}
                disabled={!canEdit}
                onValueChange={(v) => setDescriptionSource(v as FilenameDescriptionSource)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DESCRIPTION_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`fileNaming.descriptionSource.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || invalid || update.isPending}>
              {update.isPending ? t("fileNaming.saving") : t("fileNaming.save")}
            </Button>
          </div>
        )}
      </div>

      <Card data-tour="filename-preview" className="h-fit">
        <CardHeader>
          <CardTitle>{t("fileNaming.preview.title")}</CardTitle>
          <CardDescription>{t("fileNaming.preview.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
            {previews[0]?.name ?? t("fileNaming.preview.empty")}
          </p>
          <div className="mt-3 space-y-3">
            {previews.slice(1).map((p) => (
              <div key={p.key} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t(`fileNaming.preview.fall.${p.key}`)}
                </p>
                <p className="break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
                  {p.name ?? t("fileNaming.preview.empty")}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("fileNaming.preview.typeHint")}</p>
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
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
