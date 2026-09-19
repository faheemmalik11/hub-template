export interface Confidence {
  issuer?: number;
  invoiceNumber?: number;
  documentDate?: number;
  amountNet?: number;
  vatAmount?: number;
  amountGross?: number;
  companyCode?: number;
  propertyCode?: number;
  [field: string]: number | undefined;
}

export interface Validation {
  summe_ok?: boolean;
  datum_vorhanden?: boolean;
  brutto_vorhanden?: boolean;
  steller_vorhanden?: boolean;
  rechnungsnr_vorhanden?: boolean;
  ust_satz_ok?: boolean | null;
  iban_ok?: boolean | null;
  datum_plausibel?: boolean | null;
  kleinbetrag?: boolean;
  decision_reason?: string;
  [field: string]: unknown;
}

export interface Extracted {
  konfidenz?: Confidence;
  validation_detail?: Record<string, unknown> | null;
  validation?: Validation | null;
  richtung?: string | null;
  zwischensumme_brutto?: number | string | null;
  iban?: string | null;
  review_checks?: unknown;
  [field: string]: unknown;
}

export interface InvoiceReviewFields {
  extracted: Extracted | null;
  validation: Validation | null;
  validation_detail?: Record<string, unknown> | null;
  status: string | null;
  issuer: string | null;
  document_date: string | null;
  invoice_number: string | null;
  amount_net: number | null;
  vat_amount: number | null;
  amount_gross: number | null;
  vat_rate: number | null;
  recipient_name: string | null;
  company_code: string | null;
}

export interface InvoiceHistoryEntry {
  id: number;
  invoiceId: string;
  type: string;
  text: string | null;
  data: Record<string, unknown> | null;
  actor: string | null;
  createdAt: string;
}
