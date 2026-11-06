import { useMemo, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { readableErrorMessage } from "../feedback/query-states";
import { firstAddressText, rankPropertiesForAddress } from "../../lib/property-address-match";
import { Button, Combobox, type ComboboxOption, Switch } from "../../ui";

const NO_SELECTION = "__none";

export interface ConfirmationCardCompany {
  id: string;
  code: string;
  name: string;
}

export interface ConfirmationCardProperty {
  id: string;
  code: string;
  name: string | null;
  address: string | null;
}

export interface ConfirmationCardPropertyCompanyLink {
  propertyId: string;
  companyId: string;
}

export interface ConfirmationCardDocument {
  companyCode: string | null;
  propertyCode: string | null;
  documentType: string | null;
  isInvoice: boolean;
  companyConfirmedByHuman: boolean;
  propertyConfirmedByHuman: boolean;
  documentTypeConfirmedByHuman: boolean;
  isInvoiceConfirmedByHuman: boolean;
  extractedAddressCandidates: (string | null | undefined)[];
}

export interface ConfirmationCardConfirmInput {
  companyCode: string | null;
  propertyCode: string | null;
  documentType: string | null;
  isInvoice: boolean;
}

export interface ConfirmationCardLabels {
  title: string;
  titleConfirmed: string;
  titleChanged: string;
  companyLabel: string;
  companyPlaceholder: string;
  noCompanyOption: string;
  companySuggestion: (companyCode: string) => string;
  companySuggestionAccept: string;
  propertyLabel: string;
  propertyPlaceholder: string;
  noPropertyOption: string;
  addressRead: (addressText: string) => string;
  propertySuggestion: (propertyCode: string, propertyName: string) => string;
  propertyUnknown: string;
  documentTypeLabel: string;
  documentTypePlaceholder: string;
  noDocumentTypeOption: string;
  isInvoiceLabel: string;
  isInvoiceYes: string;
  isInvoiceNo: string;
  discard: string;
  confirm: string;
  saved: string;
  saveFailed: (reason: string) => string;
}

export function ConfirmationCard({
  document,
  companies,
  properties,
  propertyCompanyLinks,
  documentTypeOptions,
  noCompanyCode,
  onConfirm,
  labels,
}: {
  document: ConfirmationCardDocument;
  companies: ConfirmationCardCompany[];
  properties: ConfirmationCardProperty[];
  propertyCompanyLinks: ConfirmationCardPropertyCompanyLink[];
  documentTypeOptions: string[];
  noCompanyCode: string;
  onConfirm: (input: ConfirmationCardConfirmInput) => Promise<void>;
  labels: ConfirmationCardLabels;
}) {
  const [companyCode, setCompanyCode] = useState(document.companyCode ?? "");
  const [propertyCode, setPropertyCode] = useState(document.propertyCode ?? "");
  const [documentType, setDocumentType] = useState(document.documentType ?? "");
  const [isInvoice, setIsInvoice] = useState(document.isInvoice);
  const [saving, setSaving] = useState(false);

  const company = useMemo(
    () => companies.find((candidate) => candidate.code === companyCode) ?? null,
    [companies, companyCode],
  );
  const property = useMemo(
    () => properties.find((candidate) => candidate.code === propertyCode) ?? null,
    [properties, propertyCode],
  );

  const companySuggestion = useMemo(() => {
    if (!property) return null;
    const links = propertyCompanyLinks.filter((link) => link.propertyId === property.id);
    if (links.length !== 1) return null;
    const match = companies.find((candidate) => candidate.id === links[0].companyId);
    return match && match.code !== companyCode ? match : null;
  }, [property, propertyCompanyLinks, companies, companyCode]);

  const extractedAddress = !propertyCode
    ? firstAddressText(document.extractedAddressCandidates)
    : null;
  const propertySuggestions = extractedAddress
    ? rankPropertiesForAddress(extractedAddress, properties)
    : [];

  const everyFieldConfirmed =
    document.companyConfirmedByHuman &&
    document.propertyConfirmedByHuman &&
    document.documentTypeConfirmedByHuman &&
    document.isInvoiceConfirmedByHuman;
  const hasChanges =
    companyCode !== (document.companyCode ?? "") ||
    propertyCode !== (document.propertyCode ?? "") ||
    documentType !== (document.documentType ?? "") ||
    isInvoice !== document.isInvoice;
  const showConfirmedLook = everyFieldConfirmed && !hasChanges;
  const showButtons = !everyFieldConfirmed || hasChanges;

  function discard() {
    setCompanyCode(document.companyCode ?? "");
    setPropertyCode(document.propertyCode ?? "");
    setDocumentType(document.documentType ?? "");
    setIsInvoice(document.isInvoice);
  }

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm({
        companyCode: companyCode || null,
        propertyCode: propertyCode || null,
        documentType: documentType || null,
        isInvoice,
      });
      toast.success(labels.saved);
    } catch (error) {
      toast.error(labels.saveFailed(readableErrorMessage(error, "")));
    } finally {
      setSaving(false);
    }
  }

  const companyOptions: ComboboxOption[] = [
    { value: noCompanyCode, label: labels.noCompanyOption },
    ...companies
      .filter((candidate) => candidate.code !== noCompanyCode)
      .map((candidate) => ({
        value: candidate.code,
        label: `${candidate.code} · ${candidate.name}`,
      })),
  ];
  const propertyOptions: ComboboxOption[] = [
    { value: NO_SELECTION, label: labels.noPropertyOption },
    ...properties.map((candidate) => ({
      value: candidate.code,
      label: candidate.name ? `${candidate.code} · ${candidate.name}` : candidate.code,
      keywords: candidate.name ?? "",
    })),
  ];
  const documentTypeAllOptions =
    !documentType || documentTypeOptions.includes(documentType)
      ? documentTypeOptions
      : [documentType, ...documentTypeOptions];
  const documentTypeComboOptions: ComboboxOption[] = [
    { value: NO_SELECTION, label: labels.noDocumentTypeOption },
    ...documentTypeAllOptions.map((value) => ({ value, label: value })),
  ];

  return (
    <section
      data-confirmed={showConfirmedLook}
      className="group rounded-xl border border-amber-300 bg-amber-50/60 p-5 transition-colors data-[confirmed=true]:border-emerald-300 data-[confirmed=true]:bg-emerald-50/40"
    >
      <h2 className="mb-4 flex items-center gap-1.5 text-base font-semibold uppercase tracking-wide text-amber-900 group-data-[confirmed=true]:text-emerald-900">
        {showConfirmedLook ? (
          <Check className="size-4 shrink-0" />
        ) : (
          <TriangleAlert className="size-4 shrink-0" />
        )}
        {showConfirmedLook
          ? labels.titleConfirmed
          : everyFieldConfirmed
            ? labels.titleChanged
            : labels.title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-sm text-amber-900/80 group-data-[confirmed=true]:text-muted-foreground">
            {labels.companyLabel}
          </span>
          <Combobox
            ariaLabel={labels.companyLabel}
            value={companyCode}
            onValueChange={setCompanyCode}
            placeholder={labels.companyPlaceholder}
            options={companyOptions}
          />
          {companySuggestion && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-sm text-sky-800">
              <span>{labels.companySuggestion(companySuggestion.code)}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 border-sky-300 px-2 text-sm text-sky-900 hover:bg-sky-100"
                onClick={() => setCompanyCode(companySuggestion.code)}
              >
                <Check className="size-3" />
                {labels.companySuggestionAccept}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <span className="text-sm text-amber-900/80 group-data-[confirmed=true]:text-muted-foreground">
            {labels.propertyLabel}
          </span>
          <Combobox
            ariaLabel={labels.propertyLabel}
            value={propertyCode || ""}
            onValueChange={(value) => setPropertyCode(value === NO_SELECTION ? "" : value)}
            placeholder={labels.propertyPlaceholder}
            options={propertyOptions}
          />
          {extractedAddress && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-white/60 p-3 text-sm">
              <p className="text-amber-900 group-data-[confirmed=true]:text-emerald-900">
                {labels.addressRead(extractedAddress)}
              </p>
              {propertySuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {propertySuggestions.slice(0, 3).map(({ property: suggestion }) => (
                    <Button
                      key={suggestion.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPropertyCode(suggestion.code)}
                    >
                      {labels.propertySuggestion(
                        suggestion.code,
                        suggestion.name ?? suggestion.code,
                      )}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-amber-900/80 group-data-[confirmed=true]:text-muted-foreground">
                  {labels.propertyUnknown}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <span className="text-sm text-amber-900/80 group-data-[confirmed=true]:text-muted-foreground">
            {labels.documentTypeLabel}
          </span>
          <Combobox
            ariaLabel={labels.documentTypeLabel}
            value={documentType || ""}
            onValueChange={(value) => setDocumentType(value === NO_SELECTION ? "" : value)}
            placeholder={labels.documentTypePlaceholder}
            options={documentTypeComboOptions}
          />
        </div>

        <div className="space-y-1">
          <span className="text-sm text-amber-900/80 group-data-[confirmed=true]:text-muted-foreground">
            {labels.isInvoiceLabel}
          </span>
          <div className="flex items-center gap-2">
            <Switch checked={isInvoice} onCheckedChange={setIsInvoice} />
            <span className="text-sm text-amber-900 group-data-[confirmed=true]:text-emerald-900">
              {isInvoice ? labels.isInvoiceYes : labels.isInvoiceNo}
            </span>
          </div>
        </div>
      </div>

      {showButtons && (
        <div className="mt-4 flex justify-end gap-2">
          {everyFieldConfirmed && (
            <Button type="button" variant="outline" onClick={discard} disabled={saving}>
              {labels.discard}
            </Button>
          )}
          <Button type="button" onClick={confirm} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {labels.confirm}
          </Button>
        </div>
      )}
    </section>
  );
}

export const englishConfirmationCardLabels: ConfirmationCardLabels = {
  title: "Needs your confirmation",
  titleConfirmed: "Confirmed",
  titleChanged: "Changed, not yet confirmed",
  companyLabel: "Company",
  companyPlaceholder: "Choose a company",
  noCompanyOption: "No company",
  companySuggestion: (companyCode) => `Suggested company: ${companyCode}`,
  companySuggestionAccept: "Use this company",
  propertyLabel: "Property",
  propertyPlaceholder: "Choose a property",
  noPropertyOption: "No property",
  addressRead: (addressText) => `The document names this address: ${addressText}`,
  propertySuggestion: (propertyCode, propertyName) => `${propertyCode} · ${propertyName}`,
  propertyUnknown: "No property in your list matches this address.",
  documentTypeLabel: "Document type",
  documentTypePlaceholder: "Choose a document type",
  noDocumentTypeOption: "No document type",
  isInvoiceLabel: "Is this an invoice?",
  isInvoiceYes: "Yes, this is an invoice.",
  isInvoiceNo: "No, this is not an invoice.",
  discard: "Discard changes",
  confirm: "Confirm",
  saved: "Saved.",
  saveFailed: (reason) => `Could not save. ${reason}`,
};
