import { InvoiceReviewFields } from "../../components/invoice-review/pipeline-types";
import {
  SOURCE_HUMAN,
  validationBase,
  writeValidationDetail,
  ValidationDetail,
  ValidationDetailEntry,
} from "../../components/invoice-review/review";

const IBAN_CHARS = /^[A-Z0-9]{15,34}$/;
const IBAN_SEPARATOR = /[;,/|]|\s{2,}|\bund\b/i;

export function ibanCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(new RegExp(IBAN_SEPARATOR.source, "gi"))
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
}

export function ibanChecksumValid(candidate: string): boolean {
  const s = candidate.trim().toUpperCase().replace(/\s/g, "");
  if (!IBAN_CHARS.test(s)) return false;
  if (!/^[A-Z]{2}[0-9]{2}/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let expanded = "";
  for (const c of rearranged) {
    const value = parseInt(c, 36);
    if (Number.isNaN(value)) return false;
    expanded += String(value);
  }
  return BigInt(expanded) % 97n === 1n;
}

type Result = boolean | null;

const SUM_TOLERANCE = 0.02;

function statusFor(ok: Result): string {
  if (ok === null) return "not_applicable";
  return ok ? "ok" : "failed";
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function applied(entry: ValidationDetailEntry | undefined): boolean {
  return (entry?.status ?? "").trim().toLowerCase() !== "not_applicable";
}

function ibanSource(
  invoice: Pick<InvoiceReviewFields, "extracted">,
  supplierIban: string | null,
): string | null {
  const own = (supplierIban ?? "").trim();
  if (own) return own;
  const fromDocument = invoice.extracted?.iban;
  return typeof fromDocument === "string" ? fromDocument : null;
}

function results(
  invoice: InvoiceReviewFields,
  pipeline: ValidationDetail,
  supplierIban: string | null,
  today: string,
): Record<string, Result> {
  const net = num(invoice.amount_net);
  const vat = num(invoice.vat_amount);
  const gross = num(invoice.amount_gross);
  const subtotal = num(invoice.extracted?.zwischensumme_brutto) ?? gross;

  const rate = num(invoice.vat_rate);
  const activeRates = (pipeline.vat_rate_valid?.values?.active_rates as unknown[] | undefined)
    ?.map(num)
    .filter((n): n is number => n != null);

  const candidates = ibanCandidates(ibanSource(invoice, supplierIban));
  const count = candidates.length;

  return {
    iban_checksum_valid: count === 0 ? null : candidates.every(ibanChecksumValid),
    payable_iban_present: applied(pipeline.payable_iban_present) ? count > 0 : null,
    iban_unambiguous: applied(pipeline.iban_unambiguous) && count > 0 ? count <= 1 : null,
    gross_present: gross != null,
    issuer_present: !!(invoice.issuer ?? "").trim(),
    date_present: !!(invoice.document_date ?? "").trim(),
    invoice_number_present: !!(invoice.invoice_number ?? "").trim(),
    sum_matches:
      subtotal != null && net != null && vat != null
        ? Math.abs(net + vat - subtotal) <= SUM_TOLERANCE
        : null,
    vat_rate_valid:
      rate == null || !activeRates?.length ? null : activeRates.includes(Math.round(rate)),
    date_not_future: invoice.document_date ? invoice.document_date.slice(0, 10) <= today : null,
    recipient_present: applied(pipeline.recipient_present)
      ? !!(invoice.recipient_name ?? "").trim()
      : null,
    assignment_resolved: !!(invoice.company_code ?? "").trim(),
  };
}

export function invoiceRechecked<T extends InvoiceReviewFields>(
  invoice: T,
  opts: { supplierIban?: string | null; actor?: string | null; now?: string } = {},
): T {
  const base = validationBase(invoice);
  if (!base) return invoice;

  const now = opts.now ?? new Date().toISOString();
  const next = results(invoice, base, opts.supplierIban ?? null, now.slice(0, 10));

  const corrections: ValidationDetail = {};
  for (const [field, ok] of Object.entries(next)) {
    const original = base[field];
    if (!original) continue;
    const newStatus = statusFor(ok);
    if (newStatus === (original.status ?? "").trim().toLowerCase()) continue;
    corrections[field] = {
      ...original,
      status: newStatus,
      message: "Re-checked against the current data.",
      source: SOURCE_HUMAN,
      edited_at: now,
      edited_by: opts.actor ?? null,
    };
  }
  return {
    ...invoice,
    validation_detail: writeValidationDetail(base, corrections) as T["validation_detail"],
  };
}
