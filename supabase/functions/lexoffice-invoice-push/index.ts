import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { TABLE } from "../_shared/tables.ts";
import {
  createContact,
  createInvoice,
  featureIsLive,
  getInvoice,
  type LexofficeAddress,
  type LexofficeInvoiceInput,
  lexofficeKey,
  mapLexofficeVoucherStatus,
  searchContacts,
} from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const PERMISSION = "lexoffice.sync";

const KIND_LABEL: Record<string, string> = {
  commission: "Provision",
  coaching: "Coaching",
  referral_credit: "Tippgeber-Gutschrift",
};

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

async function releaseClaim(db: Db, id: string): Promise<void> {
  await db.from(TABLE.outgoingInvoices).update({ lexoffice_sync_requested_at: null }).eq("id", id);
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
            countryCode: customer.address_country_code ?? "DE",
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

function buildAddress(customer: CustomerRow, contactId: string): LexofficeAddress {
  return {
    contactId,
    name: customer.name,
    street: customer.address_street ?? undefined,
    zip: customer.address_zip ?? undefined,
    city: customer.address_city ?? undefined,
    countryCode: customer.address_country_code ?? "DE",
  };
}

function buildInvoicePayload(
  invoice: OutgoingInvoiceRow,
  customer: CustomerRow,
  deal: DealRow | null,
  contactId: string,
): LexofficeInvoiceInput {
  const netAmount = invoice.amount_net ?? 0;
  const vatRate = deal?.vat_rate ?? 19;
  const label = KIND_LABEL[invoice.kind ?? "commission"] ?? "Rechnung";
  const property = deal?.property;
  const description = property ? `${label}: ${property.name}` : label;

  return {
    voucherDate: new Date().toISOString().slice(0, 10),
    dueDate: invoice.due_date ?? undefined,
    address: buildAddress(customer, contactId),
    lineItems: [
      {
        type: "custom",
        name: description,
        quantity: 1,
        unitName: "Pauschal",
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
    const callerEmail = callerEmailFromAuthHeader(req);
    if (callerEmail) {
      await requirePermission(db, callerEmail, PERMISSION);
    } else if (!(await featureIsLive(db, PERMISSION))) {
      return jsonResponse({ skipped: "feature not live" });
    }

    const body = await req.json().catch(() => ({}));
    const outgoingInvoiceId = body.outgoing_invoice_id as string | undefined;
    if (!outgoingInvoiceId) return jsonResponse({ error: "outgoing_invoice_id is required" }, 400);

    const invoice = await claimInvoice(db, outgoingInvoiceId);
    if (!invoice) {
      return jsonResponse(
        { error: "invoice not eligible — already synced, not a draft, or being synced right now" },
        409,
      );
    }
    claimedId = invoice.id;

    if (!invoice.customer_id) throw new Error("invoice has no customer to bill");
    const customer = await loadCustomer(db, invoice.customer_id);
    const deal = invoice.deal_id ? await loadDeal(db, invoice.deal_id) : null;

    const apiKey = await lexofficeKey(db);
    const contactId = await resolveContactId(db, apiKey, customer);
    const payload = buildInvoicePayload(invoice, customer, deal, contactId);

    const created = await createInvoice(db, apiKey, payload);
    const lexofficeInvoice = await getInvoice(db, apiKey, created.id);

    const { error: updateError } = await db
      .from(TABLE.outgoingInvoices)
      .update({
        accounting_external_id: created.id,
        status: mapLexofficeVoucherStatus(lexofficeInvoice.voucherStatus),
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    if (updateError) {
      throw new Error(`could not record the Lexoffice invoice id: ${updateError.message}`);
    }

    return jsonResponse({ outgoingInvoiceId: invoice.id, lexofficeInvoiceId: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const forbidden = /permission|not active|caller identity/i.test(message);
    if (claimedId) await releaseClaim(db, claimedId);
    if (!forbidden) console.error("lexoffice-invoice-push failed:", message);
    return jsonResponse({ error: message }, forbidden ? 403 : 502);
  }
});
