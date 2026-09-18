// Mints a short-lived Supabase Storage signed URL for an uploaded outgoing invoice's file — same
// pattern as src/lib/api/invoice-files.functions.ts (getInvoiceFileUrl), mirrored for the
// `outgoing-invoice-files` bucket (migration 0085). The bucket is private with no storage.objects
// RLS policies of its own, so a browser client can never read it directly.
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, NotFoundError } from "./errors";
import { TABLE } from "@/lib/data/tables";

const InputSchema = z.object({
  outgoingInvoiceId: z.string().uuid(),
});

const SIGNED_URL_TTL_SECONDS = 600;

export const getOutgoingInvoiceFileUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }) => {
    // outgoing_invoice_files carries a permissive `select ... using (true)` policy, same as
    // invoice_files — the outgoing_invoices!inner embed is what actually scopes this to invoices
    // THIS caller can see via their own RLS-scoped client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: file, error } = await sb
      .from(TABLE.outgoingInvoiceFiles)
      .select(`storage_bucket, storage_path, filename, mime, ${TABLE.outgoingInvoices}!inner(id)`)
      .eq("outgoing_invoice_id", data.outgoingInvoiceId)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500, "DB_ERROR");
    if (!file) throw new NotFoundError("Outgoing invoice file not found or not accessible");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = supabaseAdmin.storage.from(file.storage_bucket);

    // Only a preview URL — the only caller (OutgoingInvoiceFileButton) opens the file inline and
    // has no separate "download" action to wire a second signed URL to.
    const preview = await bucket.createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS);
    if (preview.error || !preview.data) {
      throw new AppError(
        preview.error?.message ?? "Could not sign preview URL",
        502,
        "STORAGE_ERROR",
      );
    }

    return {
      previewUrl: preview.data.signedUrl,
      filename: (file.filename as string | null) ?? null,
      mime: (file.mime as string | null) ?? null,
    };
  });
