// Mints short-lived Supabase Storage signed URLs for an invoice's file (docs/FILE_STORAGE.md).
// The `belege-files` bucket is private with no storage.objects RLS policies of its own, so a
// browser client can never read it directly — this server function does it instead, using the
// service-role client, only after re-checking the caller can actually see the underlying invoice
// through THEIR OWN RLS-scoped client (see the invoices!inner embed below). Never expose
// SUPABASE_SERVICE_ROLE_KEY or the admin client itself to the browser.

import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, NotFoundError } from "./errors";
import { TABLE } from "@/config/tables";

const InputSchema = z.object({
  invoiceId: z.string().uuid(),
  role: z.enum(["original", "xml", "rendered"]).default("original"),
  // Overrides the Content-Disposition filename on the DOWNLOAD url only — never the preview url,
  // which must stay undecorated so a PDF still renders inline in an iframe instead of forcing a
  // save-as dialog. Computed client-side via src/lib/filename.ts (the uniform naming convention).
  downloadFilename: z.string().min(1).max(255).optional(),
});

const SIGNED_URL_TTL_SECONDS = 600;

export const getInvoiceFileUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }) => {
    // `invoice_files` itself carries a permissive `select ... using (true)` policy (predates the
    // 0046 company-scoping work, and postdates the generated Database type stub — hence the `any`
    // cast, same convention as `sb` in src/lib/data/queries.ts). The `invoices!inner(id)` embed is
    // what actually enforces has_company_access() here: if the joined invoices row is filtered out
    // by RLS for this caller, the whole query returns nothing, exactly as if the file didn't exist.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: file, error } = await sb
      .from(TABLE.documentFiles)
      .select(`storage_bucket, storage_path, filename, mime, ${TABLE.documents}!inner(id)`)
      .eq("document_id", data.invoiceId)
      .eq("role", data.role)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500, "DB_ERROR");
    if (!file) throw new NotFoundError("Invoice file not found or not accessible");
    if (!file.storage_bucket || !file.storage_path) {
      throw new NotFoundError("File has no Supabase Storage copy yet");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = supabaseAdmin.storage.from(file.storage_bucket);

    const [preview, download] = await Promise.all([
      bucket.createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS),
      bucket.createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: data.downloadFilename || file.filename || true,
      }),
    ]);

    if (preview.error || !preview.data) {
      throw new AppError(
        preview.error?.message ?? "Could not sign preview URL",
        502,
        "STORAGE_ERROR",
      );
    }
    if (download.error || !download.data) {
      throw new AppError(
        download.error?.message ?? "Could not sign download URL",
        502,
        "STORAGE_ERROR",
      );
    }

    return {
      previewUrl: preview.data.signedUrl,
      downloadUrl: download.data.signedUrl,
      filename: (file.filename as string | null) ?? null,
      mime: (file.mime as string | null) ?? null,
    };
  });
