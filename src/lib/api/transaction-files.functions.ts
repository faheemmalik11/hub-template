// Signed URLs for the documents that hang off a BANK TRANSACTION rather than an invoice.
//
// Migration 0074 let an `invoice_files` row belong to a bank_transaction instead of an invoice: a
// Pleo card purchase IS the receipt, and no invoice record exists for it. The sync has been filling
// that in since 2026-08 -- 2,145 files across 2,078 transactions on this client -- and nothing in the app
// has ever read them back, so every one of those transactions looked like it had no document at
// all. That is the dead end the client hit in the 09.09.2026 meeting.
//
// Same shape as getInvoiceFileUrl (invoice-files.functions.ts) and for the same reasons: the
// buckets are private with no storage.objects policies of their own, so the browser can never read
// them directly. The service-role client signs, but only after the caller's OWN RLS-scoped client
// has proved it can see the transaction -- that is what the `bank_transactions!inner` embed does.
// `invoice_files` itself carries a permissive `select using (true)` policy, so without that embed
// this would hand any signed-in user any receipt.
//
// A LIST, not a single file, unlike the invoice version. One Pleo entry can carry several receipts
// (a split bill, a photo plus the emailed PDF), which is why a few transactions carry more files
// than they do rows.
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import { TABLE } from "@/config/tables";

const InputSchema = z.object({
  transactionId: z.string().uuid(),
});

const SIGNED_URL_TTL_SECONDS = 600;

export interface TransactionFile {
  id: string;
  filename: string | null;
  mime: string | null;
  sizeBytes: number | null;
  source: string | null;
  previewUrl: string;
  downloadUrl: string;
}

export const getTransactionFileUrls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }): Promise<TransactionFile[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from(TABLE.documentFiles)
      .select(
        `id, filename, mime, size_bytes, source, storage_bucket, storage_path, created_at, ${TABLE.bankTransactions}!inner(id)`,
      )
      .eq("transaction_id", data.transactionId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) throw new AppError(error.message, 500, "DB_ERROR");
    if (!rows || rows.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const signed = await Promise.all(
      rows.map(async (f: Record<string, unknown>) => {
        const bucketName = f.storage_bucket as string | null;
        const path = f.storage_path as string | null;
        // A row whose bytes never made it to Storage is skipped rather than failing the whole
        // list: one unreadable receipt must not hide the others on the same transaction.
        if (!bucketName || !path) return null;

        const bucket = supabaseAdmin.storage.from(bucketName);
        const filename = (f.filename as string | null) ?? null;
        const [preview, download] = await Promise.all([
          bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
          bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: filename || true }),
        ]);
        if (preview.error || !preview.data || download.error || !download.data) return null;

        return {
          id: f.id as string,
          filename,
          mime: (f.mime as string | null) ?? null,
          sizeBytes: (f.size_bytes as number | null) ?? null,
          source: (f.source as string | null) ?? null,
          previewUrl: preview.data.signedUrl,
          downloadUrl: download.data.signedUrl,
        } satisfies TransactionFile;
      }),
    );

    return signed.filter((f): f is TransactionFile => f !== null);
  });
