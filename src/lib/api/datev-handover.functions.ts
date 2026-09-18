// Server function backing the "Jetzt an DATEV übergeben" button (Briefing Screen 9). Replaces an
// earlier Supabase Edge Function version — this app's own convention is createServerFn over Edge
// Functions for backend logic that lives inside this repo (see src/lib/api/example.functions.ts),
// and doing it this way means the Graph credentials only need to be set in ONE place (this app's
// own env), not duplicated into a separate Supabase Edge Function secret store.
//
// Sends every paid + bank-reconciled invoice for one company (incoming direction only — outgoing
// invoices don't exist yet in this app) to that company's configured DATEV upload address, batched
// at <=50 receipts / <=4MB per email (Graph's MIME sendMail ceiling, see MAX_EMAIL_BYTES below),
// converting naked e-invoice XML to a ZUGFeRD-style PDF first. Manual trigger only (a button
// click), no cron.
//
// Marks an invoice "handed over" (datev_handed_over_at) ONLY after Graph confirms the send for its
// batch — a failed send never gets marked. The DB trigger from migration 0038 advances
// workflow_status to 'uebergeben_datev' on its own once that column is set; this function never
// writes workflow_status directly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import { sendGraphMimeMessage } from "@/lib/graph/send-mail.server";
import { wrapEinvoiceXmlAsPdf } from "@/lib/datev/zugferd.server";
import { buildRawEmail, type EmailAttachment } from "@/lib/datev/mime-message.server";
import {
  DATEV_MAX_RAW_BYTES_PER_BATCH,
  datevBlockReason,
  resolveDatevMime,
} from "@/lib/datev/attachment-rules";
import { BRAND } from "@/lib/brand";
import { TABLE } from "@/lib/data/tables";

const MAX_ITEMS_PER_BATCH = 50;
// Two separate caps apply and the SMALLER one binds: DATEV accepts 20MB per email, but Microsoft
// Graph rejects a MIME sendMail request over 4MB (see src/lib/graph/send-mail.server.ts), so 4MB
// is the real ceiling. Sending more than that would need Graph's createUploadSession draft flow,
// which cannot send a pre-built MIME message and is not implemented.
//
// The cap is on the EMAIL, not the raw attachment bytes — base64-encoding (the MIME transport
// encoding every attachment goes through) inflates size by ~4/3, plus ~2.6% more from the CRLF
// line-wrapping at 76 chars/line, so raw bytes at ~1.37x smaller than the cap is what actually
// keeps the final email under it. Budgeting against the raw byte count directly (as an earlier
// version of this code did) would silently let a batch's real email size exceed the limit —
// exactly the kind of failure there's no return channel to catch.
// The 4MB Graph ceiling and the base64 inflation behind it now live in
// `@/lib/datev/attachment-rules`, so the screen's "too large" mark and this function's
// batching are the same number rather than two copies of it.
const MAX_RAW_BYTES_PER_BATCH = DATEV_MAX_RAW_BYTES_PER_BATCH;

const TriggerSchema = z.object({
  companyId: z.string().uuid(),
  direction: z.enum(["incoming", "outgoing"]),
  /**
   * The receipts the operator actually chose to send, when they narrowed the list.
   *
   * Omitted means "everything eligible", which is what every caller did before the send drawer grew
   * checkboxes. An empty array is NOT the same as omitted: it means the operator deselected
   * everything, and must send nothing rather than silently reverting to all.
   *
   * Treated as a FILTER, never as the source of truth. The eligibility query below still decides
   * what may go — company scope, paid, not already handed over, not deleted — and this list can
   * only ever narrow that set. A caller cannot use it to send another company's invoice, or one
   * that has already gone to the tax advisor.
   */
  invoiceIds: z.array(z.string().uuid()).optional(),
});

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; hint?: string; code?: string };
    if (p.message || p.code) {
      return [p.message, p.details, p.hint, p.code && `[${p.code}]`].filter(Boolean).join(" | ");
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e ?? "unknown error");
}

// Deno port would have reused hexToUint8Array/resolveMime from src/lib/data/queries.ts directly,
// but that file also pulls in the browser Supabase client and the whole React Query hook surface
// — duplicating these two small, pure, dependency-free functions here avoids bundling all of that
// into this server function for no reason. Keep in sync with queries.ts's copies if either changes.
function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

interface ReadyInvoice {
  id: string;
  issuer: string | null;
  invoice_number: string | null;
  document_date: string | null;
  amount_net: number | null;
  vat_amount: number | null;
  amount_gross: number | null;
  currency: string | null;
  intake_channel: string | null;
}

interface AttachmentPlan {
  invoice: ReadyInvoice;
  attachment: EmailAttachment;
}

interface BlockedInvoice {
  invoiceId: string;
  reason: string;
}

// deno-lint doesn't apply here; keep the admin client loosely typed like the rest of this repo's
// untyped `sb` writes (the generated Database type is empty).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * The receipt's bytes, from whichever store actually holds them.
 *
 * TWO STORES, and this function knew only one. `docs/FILE_STORAGE.md`: the pipeline used to write
 * the bytes inline into `invoice_files.content` and now writes them to Supabase Storage, leaving
 * `content` null on everything ingested since the cutover. This code still read `content`
 * unconditionally and handed it to `hexToUint8Array`, which called `.startsWith` on null — so every
 * post-cutover receipt died with "Cannot read properties of null (reading 'startsWith')", which the
 * caller's catch then reported to the operator as that receipt's blocking *reason*. On this Hub's
 * live data that was 59 of 61 pending receipts: the handover worked only on invoices old enough to
 * predate the storage migration.
 */
async function readFileBytes(file: {
  content?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
}): Promise<Uint8Array> {
  if (file.content) return hexToUint8Array(file.content);

  if (!file.storage_bucket || !file.storage_path) {
    // datevBlockReason already rejects this, so reaching here means the row changed underneath us.
    throw new Error("file row has neither inline content nor a storage object");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  // A row can point at an object that is not there. Confirmed on this Hub: every `invoice_files`
  // row written on 2026-08-08 has a `storage_path` and a `size_bytes` but no retrievable object —
  // `storage.objects` kept the metadata while the backing file did not survive — while everything
  // from 2026-08-20 on downloads fine. The row cannot be repaired from here, so say plainly which
  // object is missing and let the receipt be reported as blocked rather than failing the whole run.
  if (error || !data) {
    throw new Error(
      `file is recorded in storage but the object is missing (${file.storage_bucket}/${file.storage_path})`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}

// Builds the actual email attachment for one invoice: PDF/TIF pass through as-is, an e-invoice
// XML gets wrapped into a ZUGFeRD-style PDF first, anything else is blocked outright — "only PDF
// and TIF are allowed" is enforced here, not assumed.
async function buildAttachment(
  db: Db,
  invoice: ReadyInvoice,
  direction: "incoming" | "outgoing",
): Promise<{ attachment?: EmailAttachment; blockedReason?: string }> {
  // Two tables, one rule. Incoming receipts keep a multi-row `invoice_files` (role 'original' is
  // the one to send); outgoing invoices have at most one `outgoing_invoice_files` row and no
  // `role` or `content` column at all, since that table postdates the storage cutover.
  const query =
    direction === "outgoing"
      ? db
          .from(TABLE.outgoingInvoiceFiles)
          .select("filename, mime, storage_bucket, storage_path, size_bytes")
          .eq("outgoing_invoice_id", invoice.id)
      : db
          .from(TABLE.documentFiles)
          // NO `content` COLUMN IN THIS HUB. It completed the storage cutover and dropped the inline
          // bytea, unlike Immonetz where pre-cutover rows still carry it. Selecting it here fails the
          // whole query with "column invoice_files.content does not exist", so every receipt would be
          // reported as blocked. `readFileBytes` sees `content` as undefined and goes to Storage.
          .select("filename, mime, storage_bucket, storage_path, size_bytes")
          .eq("document_id", invoice.id)
          .eq("role", "original");
  const { data: row, error } = await query.maybeSingle();
  if (error) throw error;

  // The same call the screen made before offering the send button, so a receipt the preview marked
  // "wird übersprungen" is skipped here for the same stated reason, and one the preview promised
  // cannot be dropped by a rule the preview never saw. `has_inline_content` is the one field only
  // this side can fill in — the browser cannot select `content` to find out.
  const fileRow = row
    ? { ...row, has_inline_content: row.content !== null && row.content !== undefined }
    : null;
  const block = datevBlockReason(fileRow);
  if (block === "no-file") return { blockedReason: "no original file stored" };
  if (block === "unsupported") {
    return { blockedReason: `unsupported file type for DATEV (${resolveDatevMime(fileRow!)})` };
  }
  if (block === "too-large") {
    return {
      blockedReason: `file exceeds the ${Math.floor(MAX_RAW_BYTES_PER_BATCH / (1024 * 1024))}MB per-email limit on its own`,
    };
  }

  const mime = resolveDatevMime(fileRow!);
  const bytes = await readFileBytes(fileRow!);
  const filename = (fileRow!.filename as string | null) ?? `${invoice.id}.pdf`;

  // The actual mime of the stored file is the ground truth for what bytes we have — NOT
  // intake_channel. An invoice with intake_channel='erechnung' can still have its 'original' file
  // row already be a proper PDF (e.g. an already-ZUGFeRD PDF from the supplier); wrapping THOSE
  // bytes as if they were raw XML would corrupt the attachment. Only wrap when the file is
  // genuinely XML, regardless of how it was ingested.
  if (mime === "application/xml") {
    const pdfBytes = await wrapEinvoiceXmlAsPdf(bytes, {
      issuer: invoice.issuer,
      invoiceNumber: invoice.invoice_number,
      documentDate: invoice.document_date,
      amountNet: invoice.amount_net,
      vatAmount: invoice.vat_amount,
      amountGross: invoice.amount_gross,
      currency: invoice.currency,
    });
    // Strip whatever extension the stored filename actually has (not necessarily .xml — the
    // original filename is whatever the supplier/pipeline set) and always append .pdf, so DATEV's
    // extension-based format check never sees a mismatched or missing extension on the wrapper.
    const baseName = filename.replace(/\.[^./\\]+$/, "") || invoice.id;
    return {
      attachment: {
        filename: `${baseName}.pdf`,
        mimeType: "application/pdf",
        bytes: pdfBytes,
      },
    };
  }

  // Everything datevBlockReason let through and did not route to the XML wrapper above.
  return { attachment: { filename, mimeType: mime, bytes } };
}

// Greedy bin-packing: <=50 items AND <=MAX_EMAIL_BYTES per email, in the order invoices were
// fetched.
function chunkAttachments(plans: AttachmentPlan[]): AttachmentPlan[][] {
  const chunks: AttachmentPlan[][] = [];
  let current: AttachmentPlan[] = [];
  let currentBytes = 0;

  for (const plan of plans) {
    const size = plan.attachment.bytes.byteLength;
    const wouldExceed =
      current.length >= MAX_ITEMS_PER_BATCH ||
      (current.length > 0 && currentBytes + size > MAX_RAW_BYTES_PER_BATCH);
    if (wouldExceed) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(plan);
    currentBytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export const triggerDatevHandover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(TriggerSchema)
  .handler(async ({ data, context }) => {
    const { companyId, direction, invoiceIds } = data;

    // Company scope. requireSupabaseAuth only proves WHO is calling — everything below runs through
    // supabaseAdmin, which bypasses RLS, so without this check any authenticated user could hand
    // over any company's invoices by passing its id. Checked through `context.supabase` (the
    // caller's own token) so has_company_access() sees the real user, not the service role.
    // `as Db` for the same reason as the supabaseAdmin cast below: the generated Database type is
    // empty, so every .rpc() name resolves to `never` without it.
    const { data: mayAccess, error: accessError } = await (context.supabase as Db).rpc(
      "has_company_access",
      { p_company: companyId },
    );
    if (accessError) {
      throw new AppError(accessError.message, 500, "ACCESS_CHECK_FAILED");
    }
    if (mayAccess !== true) {
      throw new AppError("Kein Zugriff auf diese Gesellschaft.", 403, "FORBIDDEN");
    }

    if (direction !== "outgoing" && direction !== "incoming") {
      // unreachable given the zod enum, kept for parity with the removed Edge Function's guard
      throw new AppError("Invalid direction", 400, "VALIDATION_ERROR");
    }
    const senderEmail = process.env.DATEV_SENDER_EMAIL;
    if (!senderEmail) {
      throw new AppError("DATEV_SENDER_EMAIL is not set for this app.", 500, "CONFIG_ERROR");
    }

    // supabaseAdmin bypasses RLS and the column-level grant that hides `address` from
    // `authenticated` — dynamic import per client.server.ts's own guidance (top-level imports in
    // a *.functions.ts file ship to the client bundle; only code actually reached inside a
    // .handler() body is tree-shaken out).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const { data: route, error: routeError } = await db
      .from(TABLE.datevRoutes)
      .select("address, is_enabled")
      .eq("company_id", companyId)
      .eq("direction", direction)
      .maybeSingle();
    if (routeError) throw new AppError(errorMessage(routeError), 500, "DB_ERROR");
    if (!route || !route.is_enabled) {
      throw new AppError(
        `No enabled DATEV route configured for this company/${direction} combination.`,
        400,
        "NOT_CONFIGURED",
      );
    }
    const recipientAddress = route.address as string;

    // WHY BOTH DIRECTIONS LOOK THE SAME FROM HERE DOWN. An outgoing invoice is a different table
    // with differently-named columns, so it is mapped into the same `ReadyInvoice` shape once, at
    // the edge. Everything after this — the attachment build, the per-invoice blocking, the
    // batching, the send, the bookkeeping — is one path for both, which is the only way the two
    // directions cannot drift into behaving differently on failure.
    //
    // ELIGIBILITY IS THE SAME RULE BOTH WAYS: not yet handed over, not deleted. Incoming adds
    // `workflow_status = 'bezahlt'`; an outgoing invoice has no equivalent workflow column
    // (`voucher_status` mirrors LexOffice and means something else), so issuance is the whole test.
    let eligible: ReadyInvoice[];
    if (direction === "outgoing") {
      const { data, error } = await db
        .from(TABLE.outgoingInvoices)
        .select(
          `id, voucher_number, voucher_date, amount_net, amount_gross, currency, ${TABLE.customers}(name)`,
        )
        .eq("company_id", companyId)
        .is("datev_handed_over_at", null)
        .is("deleted_at", null)
        .order("voucher_date", { ascending: true });
      if (error) throw new AppError(errorMessage(error), 500, "DB_ERROR");
      eligible = (data ?? []).map(
        (r: {
          id: string;
          voucher_number: string | null;
          voucher_date: string | null;
          amount_net: number | null;
          amount_gross: number | null;
          currency: string | null;
          customers: { name: string | null } | null;
        }) => ({
          id: r.id,
          // The counterparty on an outgoing invoice is the customer it was billed to.
          issuer: r.customers?.name ?? null,
          invoice_number: r.voucher_number,
          document_date: r.voucher_date,
          amount_net: r.amount_net,
          // Not stored per invoice on the outgoing side; only used by the XML wrapper, which an
          // outgoing PDF never reaches.
          vat_amount: null,
          amount_gross: r.amount_gross,
          currency: r.currency,
          intake_channel: null,
        }),
      );
    } else {
      const { data, error } = await db
        .from(TABLE.documents)
        .select(
          "id, issuer, invoice_number, document_date, amount_net, vat_amount, amount_gross, currency, intake_channel",
        )
        .eq("company_id", companyId)
        .eq("workflow_status", "bezahlt")
        .is("datev_handed_over_at", null)
        .is("deleted_at", null)
        .order("document_date", { ascending: true });
      if (error) throw new AppError(errorMessage(error), 500, "DB_ERROR");
      eligible = (data ?? []) as ReadyInvoice[];
    }

    // Intersect rather than trust: `invoiceIds` narrows the eligible set and can never widen it.
    // Anything the operator unticked simply never gets `datev_handed_over_at`, so it stays eligible
    // and comes back in the next send, which is the whole point of being able to exclude one.
    const auswahl = invoiceIds ? new Set(invoiceIds) : null;
    const readyInvoices: ReadyInvoice[] = auswahl
      ? eligible.filter((c) => auswahl.has(c.id))
      : eligible;

    if (readyInvoices.length === 0) {
      return { batches: [], readyCount: 0, blockedInvoices: [] as BlockedInvoice[] };
    }

    const plans: AttachmentPlan[] = [];
    const blocked: BlockedInvoice[] = [];
    for (const invoice of readyInvoices) {
      // One invoice's bad file row or an encoding error must not abort the whole run and drop
      // every other invoice — block just that one and keep going.
      try {
        const { attachment, blockedReason } = await buildAttachment(db, invoice, direction);
        if (!attachment) {
          blocked.push({ invoiceId: invoice.id, reason: blockedReason ?? "unknown" });
        } else if (attachment.bytes.byteLength > MAX_RAW_BYTES_PER_BATCH) {
          // A single file over the cap can never fit in any batch, however it's chunked — block
          // it outright rather than let chunkAttachments silently produce an oversized email.
          blocked.push({
            invoiceId: invoice.id,
            reason: `file exceeds the ${(MAX_RAW_BYTES_PER_BATCH / (1024 * 1024)).toFixed(1)}MB per-email limit on its own`,
          });
        } else {
          plans.push({ invoice, attachment });
        }
      } catch (e) {
        blocked.push({ invoiceId: invoice.id, reason: errorMessage(e) });
      }
    }

    const chunks = chunkAttachments(plans);
    const batchResults: Array<{
      status: "success" | "error";
      invoiceCount: number;
      totalBytes: number;
      error?: string;
    }> = [];

    for (const chunk of chunks) {
      const totalBytes = chunk.reduce((sum, p) => sum + p.attachment.bytes.byteLength, 0);
      // MINTED BEFORE THE SEND so the reference in the subject and the row written afterwards are
      // the same id. It also closes a gap: if the process dies between sending and recording, the
      // mail that went out can still be traced to an intended batch.
      const batchId = crypto.randomUUID();
      try {
        const raw = buildRawEmail({
          from: senderEmail,
          to: recipientAddress,
          // `[ref: …]` is how a non-delivery report is matched back to this batch. A report quotes
          // the original subject, and Graph is not trusted to preserve a Message-ID header.
          // Changing this format breaks the pipeline's `datev_bounce` stage.
          subject: `DATEV-Übergabe ${direction === "incoming" ? "Eingang" : "Ausgang"}: ${chunk.length} Beleg(e) [ref: ${batchId}]`,
          bodyText:
            `Automatische DATEV-Übergabe aus ${BRAND.productName}.\n` +
            `Anzahl Belege: ${chunk.length}\n` +
            `Gesamtgröße: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
          attachments: chunk.map((p) => p.attachment),
        });

        await sendGraphMimeMessage(senderEmail, raw);

        // The email is now irreversibly sent — everything from here on is bookkeeping, not the
        // send itself. A transient DB failure at this exact point must not look like "send
        // failed" (which would legitimately be retried, re-emailing the tax advisor for receipts
        // that already went out) — retry the bookkeeping a few times before giving up, and if it
        // still fails, say so unambiguously so a human reconciles manually instead of re-sending.
        let recordError: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { data: batchRow, error: batchError } = await db
              .from(TABLE.datevHandoverBatches)
              .insert({
                id: batchId,
                company_id: companyId,
                direction,
                invoice_count: chunk.length,
                total_bytes: totalBytes,
                status: "success",
              })
              .select("id")
              .single();
            if (batchError) throw batchError;

            const { error: updateError } = await db
              .from(direction === "outgoing" ? TABLE.outgoingInvoices : TABLE.documents)
              .update({
                datev_handed_over_at: new Date().toISOString(),
                datev_batch_id: batchRow.id,
              })
              .in(
                "id",
                chunk.map((p) => p.invoice.id),
              );
            if (updateError) throw updateError;

            recordError = undefined;
            break;
          } catch (e) {
            recordError = e;
            if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }

        if (recordError) {
          const message = `EMAIL WAS SENT but recording it failed after 3 attempts — these ${chunk.length} invoice(s) must be reconciled manually, do NOT resend: ${errorMessage(recordError)}`;
          await db.from(TABLE.datevHandoverBatches).insert({
            id: batchId,
            company_id: companyId,
            direction,
            invoice_count: chunk.length,
            total_bytes: totalBytes,
            status: "error",
            error_message: message,
          });
          batchResults.push({
            status: "error",
            invoiceCount: chunk.length,
            totalBytes,
            error: message,
          });
        } else {
          batchResults.push({ status: "success", invoiceCount: chunk.length, totalBytes });
        }
      } catch (e) {
        const message = errorMessage(e);
        // A failed SEND is never marked handed over — only the failure itself is logged, so the
        // invoices in this chunk stay "ready" and can be retried on the next manual trigger. This
        // branch is only reached for failures before sendGraphMimeMessage succeeds; a post-send
        // bookkeeping failure is handled separately above with its own, more careful message.
        await db.from(TABLE.datevHandoverBatches).insert({
          id: batchId,
          company_id: companyId,
          direction,
          invoice_count: chunk.length,
          total_bytes: totalBytes,
          status: "error",
          error_message: message,
        });
        batchResults.push({
          status: "error",
          invoiceCount: chunk.length,
          totalBytes,
          error: message,
        });
      }
    }

    return {
      batches: batchResults,
      readyCount: readyInvoices.length,
      blockedInvoices: blocked,
    };
  });
