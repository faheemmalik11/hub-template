import { looksSealed, openSealed } from "./sealed.ts";
import { TABLE } from "./tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const TENANT_CHANNEL = "";
const LEXOFFICE_API_URL = "https://api.lexware.io/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const STALE_CLAIM_MS = 5 * 60 * 1000;

// A claim this old is treated as abandoned (the invocation that made it was killed by the platform
// before its own catch block could release it), so a retry can take it over instead of being
// refused forever. `column` is the table's own `lexoffice_sync_requested_at` column name.
export function staleClaimFilter<T extends { or: (query: string) => T }>(
  query: T,
  column = "lexoffice_sync_requested_at",
): T {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  return query.or(`${column}.is.null,${column}.lt.${cutoff}`);
}

async function readCredential(db: Db, name: string): Promise<string> {
  const { data, error } = await db
    .from(TABLE.credentials)
    .select("value")
    .eq("channel_key", TENANT_CHANNEL)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  const stored = (data as { value: string | null } | null)?.value;
  if (!stored) throw new Error(`${name} is not stored in the admin panel`);
  if (!looksSealed(stored)) return stored;
  const tenantKey = Deno.env.get("TENANT_SECRET_KEY");
  if (!tenantKey) throw new Error("TENANT_SECRET_KEY is not set as a secret of this function");
  return await openSealed(stored, tenantKey, TENANT_CHANNEL, name);
}

export function lexofficeKey(db: Db): Promise<string> {
  return readCredential(db, "LEXOFFICE_API_KEY");
}

export async function featureIsLive(db: Db, featureKey: string): Promise<boolean> {
  const { data, error } = await db.rpc("live_features");
  if (error) throw new Error(`could not read live features: ${error.message}`);
  const rows = (data ?? []) as { key: string }[];
  return rows.some((row) => row.key === featureKey);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Asks the database for permission to send the next request, 2/second across every concurrent
// Edge Function invocation. A missing/unreachable throttle function must never block a real
// request, so a failure here is swallowed and treated as "go ahead".
async function waitForLexwareTurn(db: Db): Promise<void> {
  const { data, error } = await db.rpc("lexware_throttle_wait");
  if (error || typeof data !== "number" || data <= 0) return;
  await sleep(data);
}

async function lexofficeFetch(
  db: Db,
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown; accept?: string; parse?: "json" | "arraybuffer" } = {},
): Promise<unknown> {
  const { method = "GET", body, accept = "application/json", parse = "json" } = init;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForLexwareTurn(db);
    const response = await fetch(`${LEXOFFICE_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: accept,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Lexoffice refused the API key");
    }
    if (response.status === 429) {
      lastError = new Error("Lexoffice rate limit hit");
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Lexoffice answered ${response.status}: ${text}`);
    }
    if (parse === "arraybuffer") return await response.arrayBuffer();
    return response.status === 204 ? null : await response.json();
  }

  throw lastError ?? new Error("Lexoffice request failed after retries");
}

export interface LexofficeContact {
  id: string;
  roles?: { customer?: Record<string, unknown> };
  company?: { name?: string };
  person?: { firstName?: string; lastName?: string };
}

export interface LexofficeAddress {
  contactId?: string;
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  countryCode: string;
}

export interface LexofficeLineItem {
  type: "custom";
  name: string;
  quantity: number;
  unitName: string;
  unitPrice: {
    currency: string;
    netAmount: number;
    taxRatePercentage: number;
  };
}

export interface LexofficeInvoiceInput {
  voucherDate: string;
  dueDate?: string;
  address: LexofficeAddress;
  lineItems: LexofficeLineItem[];
  totalPrice: { currency: string };
  taxConditions: { taxType: "net" };
  shippingConditions: { shippingDate: string; shippingType: "service" };
  paymentConditions?: { paymentTermLabel: string; paymentTermDuration: number };
  contactId?: string;
}

export interface LexofficeInvoiceResult {
  id: string;
  resourceUri?: string;
}

export interface LexofficeInvoice {
  id: string;
  voucherStatus: "draft" | "open" | "paid" | "paidoff" | "voided" | "overdue";
  voucherNumber?: string;
}

export async function searchContacts(
  db: Db,
  apiKey: string,
  name: string,
): Promise<LexofficeContact[]> {
  const params = new URLSearchParams({ name });
  const result = (await lexofficeFetch(db, apiKey, `/contacts?${params}`)) as {
    content?: LexofficeContact[];
  };
  return result.content ?? [];
}

export async function createContact(
  db: Db,
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<LexofficeContact> {
  return (await lexofficeFetch(db, apiKey, "/contacts", {
    method: "POST",
    body: payload,
  })) as LexofficeContact;
}

export async function createInvoice(
  db: Db,
  apiKey: string,
  payload: LexofficeInvoiceInput,
  finalise = true,
): Promise<LexofficeInvoiceResult> {
  const path = finalise ? "/invoices?finalize=true" : "/invoices";
  return (await lexofficeFetch(db, apiKey, path, {
    method: "POST",
    body: payload,
  })) as LexofficeInvoiceResult;
}

export async function getInvoice(db: Db, apiKey: string, id: string): Promise<LexofficeInvoice> {
  return (await lexofficeFetch(db, apiKey, `/invoices/${id}`)) as LexofficeInvoice;
}

export async function getInvoiceFile(db: Db, apiKey: string, id: string): Promise<Uint8Array> {
  const buffer = (await lexofficeFetch(db, apiKey, `/invoices/${id}/file`, {
    accept: "application/pdf",
    parse: "arraybuffer",
  })) as ArrayBuffer;
  return new Uint8Array(buffer);
}

export interface LexofficePostingCategory {
  id: string;
  name: string;
  type: "outgo" | "income";
}

export async function listPostingCategories(
  db: Db,
  apiKey: string,
): Promise<LexofficePostingCategory[]> {
  const result = (await lexofficeFetch(db, apiKey, "/posting-categories")) as
    LexofficePostingCategory[];
  return result.filter((category) => category.type === "outgo");
}

export interface LexofficeVoucherItem {
  amount: number;
  taxAmount: number;
  taxRatePercent: number;
  categoryId: string;
}

export interface LexofficePurchaseVoucherInput {
  type: "purchaseinvoice";
  voucherStatus: "open" | "unchecked";
  voucherNumber: string;
  voucherDate: string;
  dueDate?: string;
  totalGrossAmount: number;
  totalTaxAmount: number;
  // Lexware rejects taxType "net" on an "unchecked" voucher (confirmed live, 406 invalid_value) --
  // an unchecked voucher can only be gross.
  taxType: "net" | "gross";
  contactId: string;
  voucherItems: LexofficeVoucherItem[];
  remark?: string;
}

export interface LexofficeVoucherResult {
  id: string;
  resourceUri?: string;
}

export interface LexofficeVoucherListEntry {
  id: string;
  voucherNumber?: string;
  voucherDate?: string;
  totalAmount?: number;
}

// A push that failed after Lexware had already created the voucher leaves the document unsynced,
// so the retry would raise a second one for the same invoice. Lexware has no uniqueness of its own
// on a voucher number, so the retry has to look before it writes.
export async function findPurchaseVoucher(
  db: Db,
  apiKey: string,
  voucherNumber: string,
  contactId: string,
  voucherDate?: string,
  totalGrossAmount?: number,
): Promise<string | null> {
  const params = new URLSearchParams({
    voucherType: "purchaseinvoice",
    voucherStatus: "open,paid,paidoff,voided,unchecked",
    contactId,
    size: "250",
  });
  const result = (await lexofficeFetch(db, apiKey, `/voucherlist?${params}`)) as {
    content?: LexofficeVoucherListEntry[];
  };
  // voucherNumber is free text the vendor chose, not a real identifier -- a single match on it
  // alone is not proof it is this document's own voucher. Date and amount, when the caller has
  // them, must also agree before treating a found voucher as a match.
  const matches = (result.content ?? []).filter(
    (one) =>
      one.voucherNumber === voucherNumber &&
      (voucherDate === undefined || one.voucherDate === undefined || one.voucherDate === voucherDate) &&
      (totalGrossAmount === undefined ||
        one.totalAmount === undefined ||
        Math.abs(one.totalAmount - totalGrossAmount) < 0.01),
  );
  return matches[0]?.id ?? null;
}

export async function createPurchaseVoucher(
  db: Db,
  apiKey: string,
  payload: LexofficePurchaseVoucherInput,
): Promise<LexofficeVoucherResult> {
  return (await lexofficeFetch(db, apiKey, "/vouchers", {
    method: "POST",
    body: payload,
  })) as LexofficeVoucherResult;
}

export async function attachVoucherFile(
  db: Db,
  apiKey: string,
  voucherId: string,
  fileBase64: string,
  fileName: string,
): Promise<void> {
  const form = new FormData();
  const binary = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
  form.append("file", new Blob([binary]), fileName);

  await waitForLexwareTurn(db);
  const response = await fetch(`${LEXOFFICE_API_URL}/vouchers/${voucherId}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lexoffice file attach answered ${response.status}: ${text}`);
  }
}

export interface LexofficePayment {
  voucherStatus: LexofficeInvoice["voucherStatus"];
  openAmount: number;
  paymentDate?: string;
}

export async function getVoucherPayment(
  db: Db,
  apiKey: string,
  voucherId: string,
): Promise<LexofficePayment> {
  return (await lexofficeFetch(db, apiKey, `/payments/${voucherId}`)) as LexofficePayment;
}

const VOUCHER_STATUS_MAP: Record<LexofficeInvoice["voucherStatus"], string> = {
  draft: "draft",
  open: "sent",
  overdue: "sent",
  paid: "paid",
  paidoff: "paid",
  voided: "cancelled",
};

export function mapLexofficeVoucherStatus(
  voucherStatus: LexofficeInvoice["voucherStatus"],
): string {
  return VOUCHER_STATUS_MAP[voucherStatus] ?? "sent";
}

const LEXOFFICE_FIELD_LABEL: Record<string, string> = {
  voucherNumber: "the document number",
  voucherDate: "the document date",
  dueDate: "the due date",
  contactId: "the vendor",
  "voucherItems[0].taxRatePercent": "the VAT rate",
  "voucherItems[0].amount": "the amount",
  "voucherItems[0].categoryId": "the category",
  remark: "the note",
  totalGrossAmount: "the total amount",
};

function readableFieldName(source: string): string {
  return LEXOFFICE_FIELD_LABEL[source] ?? source.replace(/\[\d+\]/g, "").replace(/\./g, " → ");
}

interface LexofficeIssue {
  i18nKey?: string;
  source?: string;
}

/**
 * Lexware's own 406 body is a developer-facing validation report, not something to show on
 * screen as-is. Named field + the reader's own next step, falling back to a plain sentence when
 * the body is not this shape (a network error, a timeout, Lexoffice's own 401/403/429 messages,
 * all already plain English from lexofficeFetch above).
 */
export function friendlyLexofficeError(raw: string): string {
  const match = raw.match(/^Lexoffice answered 406: (.+)$/s);
  if (!match) return raw;
  try {
    const body = JSON.parse(match[1]) as { IssueList?: LexofficeIssue[]; message?: string };
    const fields = (body.IssueList ?? [])
      .map((issue) => (issue.source ? readableFieldName(issue.source) : null))
      .filter((label): label is string => label !== null);
    if (fields.length > 0) return `Lexware rejected this document. Please check ${fields.join(", ")}.`;
    if (body.message) return `Lexware rejected this document: ${body.message}`;
    return "Lexware rejected this document for an unknown reason.";
  } catch {
    return "Lexware rejected this document for an unknown reason.";
  }
}
