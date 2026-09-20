import type { InvoiceDetailRecord } from "../../adapters/invoice-detail";

export const NONE = "__none";

export interface OverviewForm {
  issuer: string;
  invoice_number: string;
  order_number: string;
  document_date: string;
  due_date: string;
  service_date: string;
  amount_net: string;
  vat_rate: string;
  vat_amount: string;
  amount_gross: string;
  currency: string;
  company_code: string;
  property_code: string;
  category_id: string;
}

export function overviewFormFrom(invoice: InvoiceDetailRecord): OverviewForm {
  const s = (v: string | null) => v ?? "";
  const n = (v: number | null) => (v == null ? "" : String(v));
  return {
    issuer: s(invoice.issuer),
    invoice_number: s(invoice.invoice_number),
    order_number: s(invoice.order_number),
    document_date: s(invoice.document_date),
    due_date: s(invoice.due_date),
    service_date: s(invoice.service_date),
    amount_net: n(invoice.amount_net),
    vat_rate: n(invoice.vat_rate),
    vat_amount: n(invoice.vat_amount),
    amount_gross: n(invoice.amount_gross),
    currency: s(invoice.currency),
    company_code: s(invoice.company_code),
    property_code: s(invoice.property_code),
    category_id: s(invoice.category_id),
  };
}

export interface DetailsForm {
  recipient_name: string;
  customer_number: string;
  payment_reference: string;
  payment_method: string;
  tax_note: string;
  service_description: string;
}

export function detailsFormFrom(invoice: InvoiceDetailRecord): DetailsForm {
  const s = (v: string | null) => v ?? "";
  return {
    recipient_name: s(invoice.recipient_name),
    customer_number: s(invoice.customer_number),
    payment_reference: s(invoice.payment_reference),
    payment_method: s(invoice.payment_method),
    tax_note: s(invoice.tax_note),
    service_description: s(invoice.service_description),
  };
}

export function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function changedFields(
  form: Record<string, string>,
  base: Record<string, unknown>,
  numericKeys: string[],
  labelFor: (key: string) => string,
): { changes: Record<string, unknown>; labels: string[]; invalid: string[] } {
  const changes: Record<string, unknown> = {};
  const labels: string[] = [];
  const invalid: string[] = [];
  for (const key of Object.keys(form)) {
    const isNumeric = numericKeys.includes(key);
    const raw = form[key];
    const next = isNumeric ? parseNumber(raw) : raw.trim() === "" ? null : raw.trim();
    if (isNumeric && Number.isNaN(next)) {
      invalid.push(labelFor(key));
      continue;
    }
    const prev = (base[key] as string | number | null) ?? null;
    if (next !== prev) {
      changes[key] = next;
      labels.push(labelFor(key));
    }
  }
  return { changes, labels, invalid };
}
