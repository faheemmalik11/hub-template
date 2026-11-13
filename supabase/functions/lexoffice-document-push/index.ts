import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { TABLE } from "../_shared/tables.ts";
import {
  attachVoucherFile,
  createContact,
  createPurchaseVoucher,
  featureIsLive,
  findPurchaseVoucher,
  friendlyLexofficeError,
  lexofficeKey,
  type LexofficePurchaseVoucherInput,
  type LexofficeVoucherItem,
  searchContacts,
} from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const FEATURE = "lexoffice.document_sync";

interface DocumentRow {
  id: string;
  invoice_number: string | null;
  document_date: string | null;
  due_date: string | null;
  amount_net: number | null;
  amount_gross: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  currency: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  note: string | null;
  service_description: string | null;
  issuer: string | null;
  supplier_id: string | null;
  category_id: string | null;
  workflow_status: string;
  accounting_external_id: string | null;
}

interface SupplierRow {
  id: string;
  name: string;
  vat_id: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  accounting_external_id: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  lexware_category_id: string | null;
}

interface DocumentFileRow {
  storage_bucket: string | null;
  storage_path: string | null;
  filename: string | null;
}

async function claimDocument(db: Db, id: string): Promise<DocumentRow | null> {
  const { data, error } = await db
    .from(TABLE.documents)
    .update({ lexoffice_sync_requested_at: new Date().toISOString() })
    .eq("id", id)
    .in("workflow_status", ["approved_final", "paid"])
    .is("accounting_external_id", null)
    .is("lexoffice_sync_requested_at", null)
    .is("deleted_at", null)
    .select(
      "id, invoice_number, document_date, due_date, amount_net, amount_gross, vat_rate, vat_amount, currency, payment_method, payment_reference, note, service_description, issuer, supplier_id, category_id, workflow_status, accounting_external_id",
    )
    .maybeSingle();
  if (error) throw new Error(`claim failed: ${error.message}`);
  return data as DocumentRow | null;
}

async function loadSupplier(db: Db, supplierId: string): Promise<SupplierRow> {
  const { data, error } = await db
    .from(TABLE.suppliers)
    .select("id, name, vat_id, email, phone, fax, accounting_external_id")
    .eq("id", supplierId)
    .single();
  if (error) throw new Error(`supplier lookup failed: ${error.message}`);
  return data as SupplierRow;
}

async function loadCategory(db: Db, categoryId: string): Promise<CategoryRow> {
  const { data, error } = await db
    .from(TABLE.categories)
    .select("id, name, lexware_category_id")
    .eq("id", categoryId)
    .single();
  if (error) throw new Error(`category lookup failed: ${error.message}`);
  return data as CategoryRow;
}

// Lexware's contacts API accepts at most one entry per emailAddresses/phoneNumbers category
// (https://developers.lexware.io/docs/#contacts-endpoint), so a value is sent as a one-item array
// or left out entirely -- never an empty array, which the API rejects the same as a wrong type.
function newVendorContactPayload(supplier: SupplierRow): Record<string, unknown> {
  const emailAddresses = supplier.email ? { business: [supplier.email] } : undefined;
  const phoneNumbers = supplier.phone || supplier.fax
    ? {
      ...(supplier.phone ? { business: [supplier.phone] } : {}),
      ...(supplier.fax ? { fax: [supplier.fax] } : {}),
    }
    : undefined;
  return {
    version: 0,
    roles: { vendor: {} },
    company: {
      name: supplier.name,
      ...(supplier.vat_id ? { vatRegistrationId: supplier.vat_id } : {}),
    },
    ...(emailAddresses ? { emailAddresses } : {}),
    ...(phoneNumbers ? { phoneNumbers } : {}),
  };
}

async function resolveVendorContactId(
  db: Db,
  apiKey: string,
  supplier: SupplierRow,
): Promise<string> {
  if (supplier.accounting_external_id) return supplier.accounting_external_id;

  const matches = await searchContacts(db, apiKey, supplier.name);
  const existingId = matches[0]?.id;
  const contactId = existingId ??
    (await createContact(db, apiKey, newVendorContactPayload(supplier))).id;

  const { error } = await db
    .from(TABLE.suppliers)
    .update({ accounting_external_id: contactId })
    .eq("id", supplier.id);
  if (error) throw new Error(`could not store the Lexware contact id: ${error.message}`);

  return contactId;
}

async function loadDocumentFile(db: Db, documentId: string): Promise<DocumentFileRow | null> {
  const { data, error } = await db
    .from(TABLE.documentFiles)
    .select("storage_bucket, storage_path, filename")
    .eq("document_id", documentId)
    .eq("role", "original")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`document file lookup failed: ${error.message}`);
  return data as DocumentFileRow | null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildNote(doc: DocumentRow): string {
  const paymentMethod = doc.payment_method ?? "Überweisung";
  const content = doc.payment_reference ?? doc.service_description ?? doc.note ?? doc.issuer ??
    "Beleg";
  return `${paymentMethod} · ${content}`.slice(0, 255);
}

function hasConfidentFigures(doc: DocumentRow): boolean {
  if (doc.vat_rate === null || doc.amount_net === null || doc.amount_gross === null) return false;
  if (doc.currency !== null && doc.currency !== "EUR") return false;
  const expectedGross = doc.amount_net + (doc.vat_amount ?? 0);
  return Math.abs(expectedGross - doc.amount_gross) < 0.01;
}

// Lexware books an `open` voucher into its payables, where a missing due date would leave it with
// no date to chase. Unchecked is the holding pen for exactly that: it reaches Lexware either way.
function canBookAsOpen(doc: DocumentRow): boolean {
  return hasConfidentFigures(doc) && doc.due_date !== null;
}

async function activeVatRates(db: Db): Promise<number[]> {
  const { data, error } = await db
    .from(TABLE.vatRates)
    .select("rate")
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) throw new Error(`VAT rate lookup failed: ${error.message}`);
  return ((data ?? []) as { rate: number }[]).map((row) => Number(row.rate));
}

function refuseAmountsLexwareCannotBook(doc: DocumentRow): void {
  const negative = [doc.amount_net, doc.amount_gross, doc.vat_amount].some(
    (amount) => amount !== null && amount < 0,
  );
  if (negative) {
    throw new Error(
      "this document has a negative amount, so it is a credit note rather than a purchase " +
        "invoice. Book it in Lexware by hand.",
    );
  }
}

function refuseVatRateTheCategoryCannotCarry(doc: DocumentRow, allowed: number[]): void {
  if (doc.vat_rate === null) return;
  const rate = Number(doc.vat_rate);
  if (allowed.some((one) => Math.abs(one - rate) < 0.01)) return;
  throw new Error(
    `VAT rate ${rate}% is not one this Hub has set up (${allowed.join("%, ")}%). ` +
      "Correct the rate on the document, or add the rate under master data.",
  );
}

function buildVoucherPayload(
  doc: DocumentRow,
  category: CategoryRow,
  contactId: string,
): LexofficePurchaseVoucherInput {
  const amountNet = doc.amount_net ?? 0;
  const amountGross = doc.amount_gross ?? amountNet;
  const taxAmount = doc.vat_amount ?? Math.max(0, amountGross - amountNet);

  const voucherItem: LexofficeVoucherItem = {
    amount: amountNet,
    taxAmount,
    taxRatePercent: doc.vat_rate ?? 19,
    categoryId: category.lexware_category_id as string,
  };

  return {
    type: "purchaseinvoice",
    voucherStatus: canBookAsOpen(doc) ? "open" : "unchecked",
    voucherNumber: doc.invoice_number ?? doc.id,
    voucherDate: doc.document_date ?? new Date().toISOString().slice(0, 10),
    dueDate: doc.due_date ?? undefined,
    totalGrossAmount: amountGross,
    totalTaxAmount: taxAmount,
    taxType: "net",
    contactId,
    voucherItems: [voucherItem],
    remark: buildNote(doc),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const db: Db = serviceClient();
  let claimedId: string | null = null;

  try {
    if (!(await featureIsLive(db, FEATURE))) return jsonResponse({ skipped: "feature not live" });

    const body = await req.json().catch(() => ({}));
    const documentId = body.document_id as string | undefined;
    if (!documentId) return jsonResponse({ error: "document_id is required" }, 400);

    const doc = await claimDocument(db, documentId);
    if (!doc) {
      return jsonResponse(
        {
          error: "document not eligible — already synced, not approved, or being synced right now",
        },
        409,
      );
    }
    claimedId = doc.id;

    if (!doc.supplier_id) throw new Error("document has no supplier to bill");
    if (!doc.category_id) throw new Error("document has no category assigned");

    const supplier = await loadSupplier(db, doc.supplier_id);
    const category = await loadCategory(db, doc.category_id);
    if (!category.lexware_category_id) {
      throw new Error(
        `category "${category.name}" has no matching Lexware posting category set up`,
      );
    }

    refuseAmountsLexwareCannotBook(doc);
    refuseVatRateTheCategoryCannotCarry(doc, await activeVatRates(db));

    const apiKey = await lexofficeKey(db);
    const contactId = await resolveVendorContactId(db, apiKey, supplier);
    const payload = buildVoucherPayload(doc, category, contactId);

    const alreadyThere = await findPurchaseVoucher(db, apiKey, payload.voucherNumber, contactId);
    const created = alreadyThere
      ? { id: alreadyThere }
      : await createPurchaseVoucher(db, apiKey, payload);

    const file = alreadyThere ? null : await loadDocumentFile(db, doc.id);
    if (file?.storage_bucket && file?.storage_path) {
      const { data: blob, error: downloadError } = await db.storage
        .from(file.storage_bucket)
        .download(file.storage_path);
      if (downloadError) {
        throw new Error(`could not read the stored file: ${downloadError.message}`);
      }
      const base64 = await blobToBase64(blob as Blob);
      await attachVoucherFile(db, apiKey, created.id, base64, file.filename ?? "document.pdf");
    }

    const { error: updateError } = await db
      .from(TABLE.documents)
      .update({ accounting_external_id: created.id, lexoffice_sync_error: null })
      .eq("id", doc.id);
    if (updateError) {
      throw new Error(`could not record the Lexware voucher id: ${updateError.message}`);
    }

    return jsonResponse({ documentId: doc.id, lexwareVoucherId: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (claimedId) {
      await db
        .from(TABLE.documents)
        .update({
          lexoffice_sync_requested_at: null,
          lexoffice_sync_error: friendlyLexofficeError(message),
        })
        .eq("id", claimedId);
    }
    console.error("lexoffice-document-push failed:", message);
    return jsonResponse({ error: friendlyLexofficeError(message) }, 502);
  }
});
