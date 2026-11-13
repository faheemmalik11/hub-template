import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { TABLE } from "../_shared/tables.ts";
import {
  createContact,
  createInvoice,
  featureIsLive,
  friendlyLexofficeError,
  getInvoice,
  getInvoiceFile,
  type LexofficeAddress,
  type LexofficeInvoiceInput,
  lexofficeKey,
  mapLexofficeVoucherStatus,
  searchContacts,
  staleClaimFilter,
} from "../_shared/lexoffice-client.ts";
import { invoiceWording, taxDefaults } from "../_shared/tenant-config.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const PERMISSION = "lexoffice.sync";
const FILE_FETCH_FEATURE = "lexoffice.invoice_file_fetch";
const OUTGOING_INVOICE_BUCKET = "outgoing-invoice-files";

interface OutgoingInvoiceRow {
  id: string;
  customer_id: string | null;
  deal_id: string | null;
  kind: string | null;
  amount_net: number | null;
  amount_gross: number | null;
  currency: string;
  source: string;
  status: string;
  accounting_external_id: string | null;
  due_date: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  is_company: boolean;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country_code: string | null;
  accounting_external_id: string | null;
}

interface DealRow {
  id: string;
  vat_rate: number;
  property: { name: string; address: string | null } | null;
}

// Never reclaimable on staleness, unlike claimForFileFetch below: createInvoice has no dedup
// lookup before it (the document side's findPurchaseVoucher has no equivalent here), so a crash
// between createInvoice succeeding and persistCreated's write must stay stuck forever rather than
// risk a retry finalizing a second, undeletable invoice at Lexware.
async function claimInvoice(db: Db, id: string): Promise<OutgoingInvoiceRow | null> {
  const { data, error } = await db
    .from(TABLE.outgoingInvoices)
    .update({ lexoffice_sync_requested_at: new Date().toISOString() })
    .eq("id", id)
    .eq("source", "app")
    .eq("status", "draft")
    .is("accounting_external_id", null)
    .is("lexoffice_sync_requested_at", null)
    .is("deleted_at", null)
    .select(
      "id, customer_id, deal_id, kind, amount_net, amount_gross, currency, source, status, accounting_external_id, due_date",
    )
    .maybeSingle();
  if (error) throw new Error(`claim failed: ${error.message}`);
  return data as OutgoingInvoiceRow | null;
}

async function releaseClaim(db: Db, id: string, errorMessage: string): Promise<void> {
  await db
    .from(TABLE.outgoingInvoices)
    .update({
      lexoffice_sync_requested_at: null,
      lexoffice_sync_error: friendlyLexofficeError(errorMessage),
    })
    .eq("id", id);
}

async function claimForFileFetch(
  db: Db,
  id: string,
): Promise<{ id: string; accounting_external_id: string } | null> {
  const { data, error } = await staleClaimFilter(
    db
      .from(TABLE.outgoingInvoices)
      .update({ lexoffice_sync_requested_at: new Date().toISOString() })
      .eq("id", id)
      .not("accounting_external_id", "is", null)
      .is("lexoffice_file_fetched_at", null)
      .is("deleted_at", null),
  )
    .select("id, accounting_external_id")
    .maybeSingle();
  if (error) throw new Error(`claim failed: ${error.message}`);
  return data as { id: string; accounting_external_id: string } | null;
}

// Retried a few times in place, not left to the caller's own retry: createInvoice has already
// succeeded by the time this runs, so failing to record its id here and letting the outer retry
// re-claim the row would call createInvoice a second time for an invoice that already exists.
async function persistCreated(db: Db, id: string, lexofficeId: string): Promise<void> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await db
      .from(TABLE.outgoingInvoices)
      .update({ accounting_external_id: lexofficeId })
      .eq("id", id);
    if (!error) return;
    lastError = error.message;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(`could not record the Lexoffice invoice id after retrying: ${lastError}`);
}

async function fetchNumberAndFile(
  db: Db,
  apiKey: string,
  id: string,
  lexofficeId: string,
): Promise<void> {
  const invoice = await getInvoice(db, apiKey, lexofficeId);
  // deno-lint-ignore no-explicit-any
  const update: Record<string, any> = {
    status: mapLexofficeVoucherStatus(invoice.voucherStatus),
    sent_at: new Date().toISOString(),
    invoice_number: invoice.voucherNumber ?? null,
  };

  if (await featureIsLive(db, FILE_FETCH_FEATURE)) {
    const bytes = await getInvoiceFile(db, apiKey, lexofficeId);
    const path = `${id}/invoice.pdf`;
    const { error: uploadError } = await db.storage
      .from(OUTGOING_INVOICE_BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(`could not store the Lexware PDF: ${uploadError.message}`);

    const { error: fileError } = await db
      .from(TABLE.outgoingInvoiceFiles)
      .upsert(
        {
          outgoing_invoice_id: id,
          filename: "invoice.pdf",
          mime: "application/pdf",
          size_bytes: bytes.byteLength,
          storage_bucket: OUTGOING_INVOICE_BUCKET,
          storage_path: path,
          created_by: "lexoffice-invoice-push",
        },
        { onConflict: "outgoing_invoice_id" },
      );
    if (fileError) throw new Error(`could not record the Lexware PDF: ${fileError.message}`);
    update.lexoffice_file_fetched_at = new Date().toISOString();
  }

  update.lexoffice_sync_error = null;
  const { error } = await db.from(TABLE.outgoingInvoices).update(update).eq("id", id);
  if (error) throw new Error(`could not record the Lexware invoice details: ${error.message}`);
}

async function loadCustomer(db: Db, customerId: string): Promise<CustomerRow> {
  const { data, error } = await db
    .from(TABLE.customers)
    .select(
      "id, name, is_company, address_street, address_zip, address_city, address_country_code, accounting_external_id",
    )
    .eq("id", customerId)
    .single();
  if (error) throw new Error(`customer lookup failed: ${error.message}`);
  return data as CustomerRow;
}

async function loadDeal(db: Db, dealId: string): Promise<DealRow | null> {
  const { data, error } = await db
    .from(TABLE.deals)
    .select("id, vat_rate, property:properties(name, address)")
    .eq("id", dealId)
    .maybeSingle();
  if (error) throw new Error(`deal lookup failed: ${error.message}`);
  return data as DealRow | null;
}

async function resolveContactId(db: Db, apiKey: string, customer: CustomerRow): Promise<string> {
  if (customer.accounting_external_id) return customer.accounting_external_id;

  const { country } = await taxDefaults();
  const matches = await searchContacts(db, apiKey, customer.name);
  const existingId = matches[0]?.id;
  const contactId = existingId ??
    (await createContact(db, apiKey, {
      version: 0,
      roles: { customer: {} },
      ...(customer.is_company
        ? { company: { name: customer.name } }
        : { person: { lastName: customer.name } }),
      addresses: {
        billing: [
          {
            street: customer.address_street ?? undefined,
            zip: customer.address_zip ?? undefined,
            city: customer.address_city ?? undefined,
            countryCode: customer.address_country_code ?? country,
          },
        ],
      },
    })).id;

  const { error } = await db
    .from(TABLE.customers)
    .update({ accounting_external_id: contactId })
    .eq("id", customer.id);
  if (error) throw new Error(`could not store the Lexoffice contact id: ${error.message}`);

  return contactId;
}

function buildAddress(
  customer: CustomerRow,
  contactId: string,
  fallbackCountryCode: string,
): LexofficeAddress {
  return {
    contactId,
    name: customer.name,
    street: customer.address_street ?? undefined,
    zip: customer.address_zip ?? undefined,
    city: customer.address_city ?? undefined,
    countryCode: customer.address_country_code ?? fallbackCountryCode,
  };
}

// /v1/invoices rejects a date-only value, unlike /v1/vouchers which the document side posts to.
function lexofficeTimestamp(date: string | null): string {
  return date ? new Date(`${date}T00:00:00Z`).toISOString() : new Date().toISOString();
}

async function buildInvoicePayload(
  invoice: OutgoingInvoiceRow,
  customer: CustomerRow,
  deal: DealRow | null,
  contactId: string,
): Promise<LexofficeInvoiceInput> {
  const tax = await taxDefaults();
  const wording = await invoiceWording();
  const netAmount = invoice.amount_net ?? 0;
  const vatRate = deal?.vat_rate ?? tax.defaultVatRate;
  const label = wording.invoiceKindLabels[invoice.kind ?? "commission"] ??
    wording.invoiceFallbackLabel;
  const property = deal?.property;
  const description = property ? `${label}: ${property.name}` : label;

  const voucherDate = lexofficeTimestamp(null);

  return {
    voucherDate,
    dueDate: invoice.due_date ? lexofficeTimestamp(invoice.due_date) : undefined,
    shippingConditions: { shippingDate: voucherDate, shippingType: "service" },
    address: buildAddress(customer, contactId, tax.country),
    lineItems: [
      {
        type: "custom",
        name: description,
        quantity: 1,
        unitName: wording.invoiceUnitName,
        unitPrice: {
          currency: invoice.currency ?? "EUR",
          netAmount,
          taxRatePercentage: vatRate,
        },
      },
    ],
    totalPrice: { currency: invoice.currency ?? "EUR" },
    taxConditions: { taxType: "net" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();
  let claimedId: string | null = null;

  try {
    if (!(await featureIsLive(db, PERMISSION))) {
      return jsonResponse({ skipped: "feature not live" });
    }
    const callerEmail = callerEmailFromAuthHeader(req);
    if (callerEmail) {
      await requirePermission(db, callerEmail, PERMISSION);
    }

    const body = await req.json().catch(() => ({}));
    const outgoingInvoiceId = body.outgoing_invoice_id as string | undefined;
    if (!outgoingInvoiceId) return jsonResponse({ error: "outgoing_invoice_id is required" }, 400);

    const invoice = await claimInvoice(db, outgoingInvoiceId);
    if (invoice) {
      claimedId = invoice.id;

      if (invoice.kind === "referral_credit") {
        throw new Error("a referral credit note is never sent to Lexoffice");
      }
      if (!invoice.customer_id) throw new Error("invoice has no customer to bill");
      const customer = await loadCustomer(db, invoice.customer_id);
      const deal = invoice.deal_id ? await loadDeal(db, invoice.deal_id) : null;

      const apiKey = await lexofficeKey(db);
      const contactId = await resolveContactId(db, apiKey, customer);
      const payload = await buildInvoicePayload(invoice, customer, deal, contactId);

      const created = await createInvoice(db, apiKey, payload);
      await persistCreated(db, invoice.id, created.id);
      await fetchNumberAndFile(db, apiKey, invoice.id, created.id);

      return jsonResponse({ outgoingInvoiceId: invoice.id, lexofficeInvoiceId: created.id });
    }

    const resumed = await claimForFileFetch(db, outgoingInvoiceId);
    if (!resumed) {
      return jsonResponse(
        { error: "invoice not eligible — already synced, not a draft, or being synced right now" },
        409,
      );
    }
    claimedId = resumed.id;
    const apiKey = await lexofficeKey(db);
    await fetchNumberAndFile(db, apiKey, resumed.id, resumed.accounting_external_id);

    return jsonResponse({
      outgoingInvoiceId: resumed.id,
      lexofficeInvoiceId: resumed.accounting_external_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const forbidden = /permission|not active|caller identity/i.test(message);
    if (claimedId) await releaseClaim(db, claimedId, message);
    if (!forbidden) console.error("lexoffice-invoice-push failed:", message);
    return jsonResponse({ error: forbidden ? message : friendlyLexofficeError(message) }, forbidden ? 403 : 502);
  }
});
