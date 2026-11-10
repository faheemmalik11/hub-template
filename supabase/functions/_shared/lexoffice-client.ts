import { looksSealed, openSealed } from "./sealed.ts";
import { TABLE } from "./tables.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const TENANT_CHANNEL = "";
const LEXOFFICE_API_URL = "https://api.lexoffice.io/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lexofficeFetch(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const { method = "GET", body } = init;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(`${LEXOFFICE_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
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
  address: LexofficeAddress;
  lineItems: LexofficeLineItem[];
  totalPrice: { currency: string };
  taxConditions: { taxType: "net" };
  contactId?: string;
}

export interface LexofficeInvoiceResult {
  id: string;
  resourceUri?: string;
}

export interface LexofficeInvoice {
  id: string;
  voucherStatus: "draft" | "open" | "paid" | "paidoff" | "voided" | "overdue";
}

export async function searchContacts(apiKey: string, name: string): Promise<LexofficeContact[]> {
  const params = new URLSearchParams({ name });
  const result = (await lexofficeFetch(apiKey, `/contacts?${params}`)) as {
    content?: LexofficeContact[];
  };
  return result.content ?? [];
}

export async function createContact(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<LexofficeContact> {
  return (await lexofficeFetch(apiKey, "/contacts", {
    method: "POST",
    body: payload,
  })) as LexofficeContact;
}

export async function createInvoice(
  apiKey: string,
  payload: LexofficeInvoiceInput,
): Promise<LexofficeInvoiceResult> {
  return (await lexofficeFetch(apiKey, "/invoices?finalize=true", {
    method: "POST",
    body: payload,
  })) as LexofficeInvoiceResult;
}

export async function getInvoice(apiKey: string, id: string): Promise<LexofficeInvoice> {
  return (await lexofficeFetch(apiKey, `/invoices/${id}`)) as LexofficeInvoice;
}

const VOUCHER_STATUS_MAP: Record<LexofficeInvoice["voucherStatus"], string> = {
  draft: "draft",
  open: "sent",
  overdue: "sent",
  paid: "paid",
  paidoff: "paid",
  voided: "cancelled",
};

export function mapLexofficeVoucherStatus(voucherStatus: LexofficeInvoice["voucherStatus"]): string {
  return VOUCHER_STATUS_MAP[voucherStatus] ?? "sent";
}
