import type { QueryResult } from "../lib/query-result";

export type FileNamingDescriptionSource = "service_description" | "cost_category" | "none";

export interface FileNamingSettingsInput {
  separator: string;
  vatSuffix: string;
  includeVatSuffix: boolean;
  includeAmount: boolean;
  includeProperty: boolean;
  descriptionSource: FileNamingDescriptionSource;
  transliterateUmlauts: boolean;
}

export interface FileNamingSettings extends FileNamingSettingsInput {
  updatedAt: string | null;
  updatedBy: string | null;
}

// Only the fields the filename builder reads; used for the live preview examples.
export interface FilenamePreviewInvoice {
  documentDate: string | null;
  companyCode: string | null;
  issuer: string | null;
  serviceDescription: string | null;
  costCategory: string | null;
  amountGross: number | null;
  propertyCode: string | null;
  vatRate: number | null;
  vatExempt: boolean;
}

export interface FileNamingAdapter {
  useSettings(): QueryResult<FileNamingSettings>;
  saveSettings(input: FileNamingSettingsInput): Promise<void>;
  // The convention the project specifies; the page warns when the stored settings drift from it.
  standardSettings: FileNamingSettingsInput;
  // Representative invoices for the live preview: complete data, partial data, minimal data.
  previewInvoices: {
    complete: FilenamePreviewInvoice;
    withoutPropertyOrDescription: FilenamePreviewInvoice;
    minimal: FilenamePreviewInvoice;
  };
}
