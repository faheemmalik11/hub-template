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

export interface LexofficePaymentItem {
  postingDate?: string;
  amount?: number;
}

export interface LexofficePayment {
  voucherStatus: LexofficeInvoice["voucherStatus"];
  openAmount: number;
  paidDate?: string;
  paymentItems?: LexofficePaymentItem[];
}

// Lexware has no `paymentDate` field; confirmed against the live API.
export function paidOnFrom(payment: LexofficePayment): string | null {
  const latestItem = (payment.paymentItems ?? [])
    .map((item) => item.postingDate)
    .filter((date): date is string => !!date)
    .sort()
    .at(-1);
  return payment.paidDate ?? latestItem ?? null;
}

export async function getVoucherPayment(
  db: Db,
  apiKey: string,
  voucherId: string,
): Promise<LexofficePayment> {
  return (await lexofficeFetch(db, apiKey, `/payments/${voucherId}`)) as LexofficePayment;
}

export function isLexofficeNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Lexoffice answered 404");
}

// The one place that decides what a Lexware payment status means for a row, used by both
// lexoffice-payment-sync (polling, documents and commission invoices) and lexoffice-webhook
// (real-time, same two tables) -- so a voucher reaching "paid" is applied identically regardless
// of which path noticed it first, instead of two near-duplicate branches drifting apart over time.
export type PayableTable = "documents" | "outgoing_invoices";

export interface PayableRecord {
  table: PayableTable;
  id: string;
  amountGross: number | null;
}

// documents is checked first since it is the far more common case (every incoming invoice), then
// outgoing_invoices restricted to kind = 'commission' -- the only outgoing_invoices rows Lexware
// ever carries a voucher id for.
export async function payableRecordFor(
  db: Db,
  accountingExternalId: string,
): Promise<PayableRecord | null> {
  const { data: documents, error: documentsError } = await db
    .from(TABLE.documents)
    .select("id, amount_gross")
    .eq("accounting_external_id", accountingExternalId)
    .is("deleted_at", null)
    .limit(1);
  if (documentsError) throw documentsError;
  const document = (documents as { id: string; amount_gross: number | null }[])[0];
  if (document) return { table: "documents", id: document.id, amountGross: document.amount_gross };

  const { data: invoices, error: invoicesError } = await db
    .from(TABLE.outgoingInvoices)
    .select("id, amount_gross")
    .eq("accounting_external_id", accountingExternalId)
    .eq("kind", "commission")
    .is("deleted_at", null)
    .limit(1);
  if (invoicesError) throw invoicesError;
  const invoice = (invoices as { id: string; amount_gross: number | null }[])[0];
  if (invoice) return { table: "outgoing_invoices", id: invoice.id, amountGross: invoice.amount_gross };

  return null;
}

function openAmountToStore(amountGross: number | null, openAmount: number | null): number | null {
  if (openAmount === null) return null;
  if (amountGross !== null && openAmount >= amountGross - 0.01) return null;
  return openAmount;
}

export type LexwarePaymentOutcome = "paid" | "voided" | "open";

export async function applyLexwarePayment(
  db: Db,
  apiKey: string,
  record: PayableRecord,
  accountingExternalId: string,
): Promise<LexwarePaymentOutcome> {
  const table = record.table === "documents" ? TABLE.documents : TABLE.outgoingInvoices;

  let payment: LexofficePayment;
  try {
    payment = await getVoucherPayment(db, apiKey, accountingExternalId);
  } catch (error) {
    if (!isLexofficeNotFound(error)) throw error;
    const { error: updateError } = await db
      .from(table)
      .update({ lexoffice_sync_error: "Lexware shows this voucher as voided (cancelled)." })
      .eq("id", record.id);
    if (updateError) throw updateError;
    return "voided";
  }

  if (payment.voucherStatus === "voided") {
    const { error } = await db
      .from(table)
      .update({ lexoffice_sync_error: "Lexware shows this voucher as voided (cancelled)." })
      .eq("id", record.id);
    if (error) throw error;
    return "voided";
  }

  if (payment.voucherStatus !== "paid" && payment.voucherStatus !== "paidoff") {
    if (record.table === "documents") {
      const { error } = await db
        .from(table)
        .update({ lexoffice_open_amount: openAmountToStore(record.amountGross, payment.openAmount ?? null) })
        .eq("id", record.id);
      if (error) throw error;
    }
    return "open";
  }

  const patch: Record<string, unknown> = {
    paid_at: paidOnFrom(payment) ?? new Date().toISOString(),
    paid_source: "lexware",
  };
  if (record.table === "documents") patch.lexoffice_open_amount = 0;
  else patch.status = "paid";
  const { error } = await db.from(table).update(patch).eq("id", record.id);
  if (error) throw error;
  return "paid";
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

// Lexware's own 406/422 body is a developer-facing validation report, not something to show on
// screen as-is. Named field + the reader's own next step, falling back to a plain sentence when
// the body carries no usable field names.
function rejectedDocumentMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { IssueList?: LexofficeIssue[]; message?: string };
    const fields = (parsed.IssueList ?? [])
      .map((issue) => (issue.source ? readableFieldName(issue.source) : null))
      .filter((label): label is string => label !== null);
    if (fields.length > 0) return `Lexware rejected this document. Please check ${fields.join(", ")}.`;
    if (parsed.message) return `Lexware rejected this document: ${parsed.message}`;
    return "Lexware rejected this document for an unknown reason.";
  } catch {
    return "Lexware rejected this document for an unknown reason.";
  }
}

/**
 * Turns the raw string lexofficeFetch throws with (`Lexoffice answered ${status}: ${body}` for
 * every non-ok, non-401/403/429 response, already-plain English for the handful it throws
 * directly) into a short sentence a non-technical reader can act on. Never echoes the raw body
 * back — a status this function has no specific wording for still gets a generic fallback
 * sentence, never the JSON/text Lexware sent.
 */
export function friendlyLexofficeError(raw: string): string {
  const match = raw.match(/^Lexoffice answered (\d+): (.+)$/s);
  if (!match) return raw;
  const status = Number(match[1]);
  const body = match[2];

  if (status === 406 || status === 422) return rejectedDocumentMessage(body);
  if (status === 400) {
    return "Lexware could not accept this document because of an invalid value. Please check the document and try again.";
  }
  if (status === 404) {
    return "Lexware could not find something this document refers to, such as the vendor or an earlier voucher. Please check the linked record.";
  }
  if (status === 409) {
    return "Lexware already has a matching entry for this document. Please check Lexware before sending it again.";
  }
  if (status >= 500) {
    return "Lexware is temporarily unavailable. Please try again in a few minutes.";
  }
  return "Lexware rejected this document for an unknown reason.";
}
