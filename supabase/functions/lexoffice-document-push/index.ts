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
  listPostingCategories,
  type LexofficePurchaseVoucherInput,
  type LexofficeVoucherItem,
  searchContacts,
  staleClaimFilter,
} from "../_shared/lexoffice-client.ts";
import { invoiceWording, taxDefaults, type InvoiceWording } from "../_shared/tenant-config.ts";

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
  size_bytes: number | null;
}

const LEXWARE_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

async function claimDocument(db: Db, id: string): Promise<DocumentRow | null> {
  const { data, error } = await staleClaimFilter(
    db
      .from(TABLE.documents)
      .update({ lexoffice_sync_requested_at: new Date().toISOString() })
      .eq("id", id)
      .in("workflow_status", ["approved_final", "paid"])
      .is("accounting_external_id", null)
      .is("deleted_at", null),
  )
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
    .select("storage_bucket, storage_path, filename, size_bytes")
    .eq("document_id", documentId)
    .eq("role", "original")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`document file lookup failed: ${error.message}`);
  return data as DocumentFileRow | null;
}

function refuseOversizedAttachment(sizeBytes: number | null): void {
  if (sizeBytes === null || sizeBytes <= LEXWARE_MAX_ATTACHMENT_BYTES) return;
  const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
  throw new Error(
    `The file is ${sizeMb} MB. Lexware only accepts files up to 5 MB. Save the file smaller, ` +
      "then try again.",
  );
}

async function downloadAttachment(
  db: Db,
  file: DocumentFileRow,
): Promise<{ base64: string; filename: string }> {
  const { data, error } = await db.storage
    .from(file.storage_bucket as string)
    .download(file.storage_path as string);
  if (error) throw new Error(`could not read the stored file: ${error.message}`);
  const blob = data as Blob;
  refuseOversizedAttachment(blob.size);
  return { base64: await blobToBase64(blob), filename: file.filename ?? "document.pdf" };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buildNote(doc: DocumentRow, wording: InvoiceWording): string {
  const paymentMethod = doc.payment_method ?? wording.defaultPaymentMethod;
  const content = doc.payment_reference ?? doc.service_description ?? doc.note ?? doc.issuer ??
    wording.documentFallbackLabel;
  return `${paymentMethod} · ${content}`.slice(0, 255);
}

function hasConfidentFigures(doc: DocumentRow): boolean {
  if (doc.vat_rate === null || doc.amount_net === null || doc.amount_gross === null) return false;
  if (doc.currency !== null && doc.currency !== "EUR") return false;
  const expectedGross = doc.amount_net + (doc.vat_amount ?? 0);
  return Math.abs(expectedGross - doc.amount_gross) < 0.01;
}

function addDays(isoDate: string, days: number): string {
  const moved = new Date(`${isoDate}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// An open voucher must carry a due date or Lexware refuses to save it later, so one is worked out
// from the payment term when the document itself does not name it.
function dueDateFor(doc: DocumentRow, paymentTermDays: number): string {
  if (doc.due_date) return doc.due_date;
  const term = Number.isFinite(paymentTermDays) && paymentTermDays >= 0 ? paymentTermDays : 0;
  return addDays(doc.document_date ?? today(), term);
}

// vat_rates.country exists because the same percentage can be valid in one country and not
// another (its own unique index is (country, rate)); this validation is for domestic documents,
// so it reads only this tenant's own country's rates, not whatever a cross-border supplier added.
async function activeVatRates(db: Db): Promise<number[]> {
  const { country } = await taxDefaults();
  const { data, error } = await db
    .from(TABLE.vatRates)
    .select("rate")
    .eq("country", country)
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
      "This document has a negative amount, so it is a credit note, not an invoice. " +
        "Enter it in Lexware by hand.",
    );
  }
}

function refuseVatRateTheCategoryCannotCarry(doc: DocumentRow, allowed: number[]): void {
  if (doc.vat_rate === null) return;
  const rate = Number(doc.vat_rate);
  if (allowed.some((one) => Math.abs(one - rate) < 0.01)) return;
  throw new Error(
    `The VAT rate ${rate}% is not set up here. Allowed rates: ${allowed.join("%, ")}%. ` +
      "Change the rate on the document, or add it under master data.",
  );
}

// Lexware rejects a nonzero rate on these reverse-charge categories; confirmed live (406
// invalid_taxamount), not guessed. No field marks this on the category, only the name.
const REVERSE_CHARGE_CATEGORY_NAME = /§13b|Innergemeinschaftlicher Erwerb/;

async function refuseReverseChargeRateMismatch(
  db: Db,
  apiKey: string,
  doc: DocumentRow,
  category: CategoryRow,
): Promise<void> {
  if (doc.vat_rate === null || Number(doc.vat_rate) === 0) return;
  const postingCategories = await listPostingCategories(db, apiKey);
  const matched = postingCategories.find((one) => one.id === category.lexware_category_id);
  if (!matched || !REVERSE_CHARGE_CATEGORY_NAME.test(matched.name)) return;
  throw new Error(
    `The category "${matched.name}" only allows a VAT rate of 0% in Lexware, but this document ` +
      `has ${doc.vat_rate}%. Change the category or the rate, then try again.`,
  );
}

async function buildVoucherPayload(
  doc: DocumentRow,
  category: CategoryRow,
  contactId: string,
): Promise<LexofficePurchaseVoucherInput> {
  const tax = await taxDefaults();
  const wording = await invoiceWording();
  const amountNet = doc.amount_net ?? 0;
  const amountGross = doc.amount_gross ?? amountNet;
  const taxAmount = doc.vat_amount ?? Math.max(0, amountGross - amountNet);
  const open = hasConfidentFigures(doc);

  const voucherItem: LexofficeVoucherItem = {
    amount: open ? amountNet : amountGross,
    taxAmount,
    taxRatePercent: doc.vat_rate ?? tax.defaultVatRate,
    categoryId: category.lexware_category_id as string,
  };

  return {
    type: "purchaseinvoice",
    voucherStatus: open ? "open" : "unchecked",
    voucherNumber: doc.invoice_number ?? doc.id,
    voucherDate: doc.document_date ?? today(),
    dueDate: open ? dueDateFor(doc, tax.paymentTermDays) : doc.due_date ?? undefined,
    totalGrossAmount: amountGross,
    totalTaxAmount: taxAmount,
    taxType: open ? "net" : "gross",
    contactId,
    voucherItems: [voucherItem],
    remark: buildNote(doc, wording),
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

    if (!doc.supplier_id) throw new Error("This document has no supplier yet. Add one first.");
    if (!doc.category_id) throw new Error("This document has no category yet. Add one first.");

    const supplier = await loadSupplier(db, doc.supplier_id);
    const category = await loadCategory(db, doc.category_id);
    if (!category.lexware_category_id) {
      throw new Error(
        `The category "${category.name}" is not linked to a Lexware category yet. ` +
          "Link it under master data, then try again.",
      );
    }

    refuseAmountsLexwareCannotBook(doc);
    refuseVatRateTheCategoryCannotCarry(doc, await activeVatRates(db));

    const apiKey = await lexofficeKey(db);
    await refuseReverseChargeRateMismatch(db, apiKey, doc, category);

    const file = await loadDocumentFile(db, doc.id);
    const stored = file?.storage_bucket && file?.storage_path ? file : null;
    if (stored) refuseOversizedAttachment(stored.size_bytes);

    // Fetched before the voucher exists: size_bytes is not guaranteed present on every row, and
    // weighing the real bytes only after creating the voucher would leave one behind that can
    // never carry its own file, however often the push is retried.
    const attachment = stored ? await downloadAttachment(db, stored) : null;

    const contactId = await resolveVendorContactId(db, apiKey, supplier);
    const payload = await buildVoucherPayload(doc, category, contactId);

    const alreadyThere = await findPurchaseVoucher(
      db,
      apiKey,
      payload.voucherNumber,
      contactId,
      payload.voucherDate,
      payload.totalGrossAmount,
    );
    const created = alreadyThere
      ? { id: alreadyThere }
      : await createPurchaseVoucher(db, apiKey, payload);

    // Attempted even for a found (not just-created) voucher: there is no way to ask Lexware
    // whether it already has a file, and re-attaching is safer than risking one with none at all.
    if (attachment) {
      await attachVoucherFile(db, apiKey, created.id, attachment.base64, attachment.filename);
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
