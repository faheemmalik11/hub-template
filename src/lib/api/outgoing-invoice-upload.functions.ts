// Server function that commits an uploaded outgoing invoice (the confirm step after
// extractOutgoingInvoiceFields — see that file's header for the full picture). Writes go through
// the service-role client so the invoice row, its file record, and an inline new-customer row (if
// any) all commit as one server-side unit instead of several separate client-side inserts.
//
// The file is already in Storage before this runs: the browser uploads straight to the bucket
// (src/features/file-upload) and hands over the resulting path, so nothing large passes through
// this function. An orphaned Storage object with no DB row is harmless clutter; a DB row with no
// file behind it is a ghost invoice with nothing to show, so the rows are written last and any
// partial state is disclosed in the thrown error rather than silently swallowed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, ValidationError } from "./errors";
import { OUTGOING_INVOICE_UPLOAD_MIME } from "./outgoing-invoice-shared";
import { TABLE } from "@/lib/data/tables";

const STORAGE_BUCKET = "outgoing-invoice-files";

const NewCustomerSchema = z.object({
  name: z.string().min(1),
  // Unparsed single-line address (best-effort from AI extraction or manual entry) — no billing
  // address is required to create a customer (see /kunden's useCreateCustomer).
  address: z.string().nullish(),
});

const CreateUploadedInvoiceSchema = z
  .object({
    companyId: z.string().uuid(),
    customerId: z.string().uuid().nullish(),
    newCustomer: NewCustomerSchema.nullish(),
    voucherNumber: z.string().min(1),
    voucherDate: z.string().min(1), // ISO date, e.g. "2026-07-30"
    dueDate: z.string().nullish(),
    amountNet: z.number().nullish(),
    amountGross: z.number(),
    vatRate: z.number().nullish(),
    currency: z.string().length(3).default("EUR"),
    invoiceId: z.string().uuid(),
    filename: z.string().min(1).max(255),
    mime: z.enum(OUTGOING_INVOICE_UPLOAD_MIME),
    storagePath: z.string().min(1).max(1024),
    sizeBytes: z.number().int().nonnegative(),
    checksumSha256: z.string().length(64).nullish(),
  })
  .refine((d) => !!d.customerId || !!d.newCustomer, {
    message: "Either customerId or newCustomer is required",
  });

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function resolveCustomerId(
  db: Db,
  companyId: string,
  data: z.infer<typeof CreateUploadedInvoiceSchema>,
): Promise<string> {
  if (data.customerId) {
    // Re-check ownership rather than trusting a well-formed but possibly foreign id (a customer
    // from a different company must never be attachable to this invoice).
    const { data: existing, error } = await db
      .from(TABLE.customers)
      .select("id")
      .eq("id", data.customerId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new AppError(errorMessage(error), 500, "DB_ERROR");
    if (!existing) {
      throw new ValidationError("customerId does not belong to the given company");
    }
    return data.customerId;
  }

  const { data: created, error } = await db
    .from(TABLE.customers)
    .insert({
      company_id: companyId,
      is_company: true,
      name: data.newCustomer!.name,
      // customers has no created_by column — actor is only logged on the
      // outgoing_invoices/change_history side.
      address_street: data.newCustomer!.address ?? null,
      source: "upload",
    })
    .select("id")
    .single();
  if (error) throw new AppError(errorMessage(error), 500, "DB_ERROR");
  return created.id as string;
}

export const createUploadedOutgoingInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(CreateUploadedInvoiceSchema)
  .handler(async ({ data, context }) => {
    const actor =
      (context.claims as { email?: string } | undefined)?.email ??
      (context.userId as string) ??
      "hub";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const { data: company, error: companyError } = await db
      .from(TABLE.companies)
      .select("id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw new AppError(errorMessage(companyError), 500, "DB_ERROR");
    if (!company) throw new ValidationError("companyId not found");

    const customerId = await resolveCustomerId(db, data.companyId, data);

    const invoiceId = data.invoiceId;
    const storagePath = data.storagePath;

    const { error: invoiceError } = await db.from(TABLE.outgoingInvoices).insert({
      id: invoiceId,
      company_id: data.companyId,
      customer_id: customerId,
      source: "upload",
      voucher_status: "open",
      voucher_number: data.voucherNumber,
      voucher_date: data.voucherDate,
      due_date: data.dueDate ?? null,
      amount_net: data.amountNet ?? null,
      amount_gross: data.amountGross,
      currency: data.currency,
      created_by: actor,
    });
    if (invoiceError) {
      throw new AppError(
        `File was uploaded to Storage (path ${storagePath}) but the invoice row failed to save: ${errorMessage(invoiceError)}`,
        500,
        "DB_ERROR",
      );
    }

    const { error: fileError } = await db.from(TABLE.outgoingInvoiceFiles).insert({
      outgoing_invoice_id: invoiceId,
      filename: data.filename,
      mime: data.mime,
      size_bytes: data.sizeBytes,
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      checksum_sha256: data.checksumSha256 ?? null,
      created_by: actor,
    });
    if (fileError) {
      throw new AppError(
        `Invoice ${invoiceId} was created but its file record failed to save: ${errorMessage(fileError)}`,
        500,
        "DB_ERROR",
      );
    }

    await db.from(TABLE.changeHistory).insert({
      table_name: "outgoing_invoices",
      record_id: invoiceId,
      type: "aenderung",
      text: "Per Upload erfasst (KI-Extraktion)",
      actor,
    });

    const { data: row, error: readError } = await db
      .from(TABLE.outgoingInvoices)
      .select(`*, ${TABLE.customers}(*)`)
      .eq("id", invoiceId)
      .single();
    if (readError) throw new AppError(errorMessage(readError), 500, "DB_ERROR");

    return row;
  });
