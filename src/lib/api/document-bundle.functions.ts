// Every document of one month for one company, as a single archive.
//
// Ported from Eiffler's `accounting-document-bundle` edge function (SPEC 6.2 "Fallback B"), which
// exists so a month's receipts can be uploaded to DATEV as a batch by hand. The spec calls it "a
// useful feature regardless", not only a contingency, and it answers a different need from the
// DATEV handover next to it:
//
//   * The handover PUSHES paid receipts by email to the tax advisor's upload address and records
//     itself, because the mail provider confirms the send.
//   * This PULLS a zip to the operator's machine and records nothing. What somebody does with the
//     archive afterwards is invisible here, so stamping `datev_handed_over_at` would mark
//     documents as handed over that may never arrive.
//
// NO IBAN COLUMN in the manifest, unlike Eiffler's original. `invoices.iban` exists only there;
// in this Hub the IBAN belongs to the supplier and its bank accounts, so putting it on a per
// invoice line would mean a join for a convenience column. Everything the archive is reconciled
// against the month with is still on the line.
//
// A server function rather than an edge function: this repo's own convention is `createServerFn`
// for backend logic that lives in this repo, and the storage credentials it needs are already set
// in this app's env.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError } from "./errors";
import { TABLE } from "@/lib/data/tables";

// Held well under the archive a browser can hold in memory as one base64 string. Reaching it stops
// the archive growing rather than failing the whole export: a partial archive whose manifest names
// what was left out is more use than no archive at all.
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

const InputSchema = z.object({
  companyId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export interface BundleSummary {
  total: number;
  included: number;
  bytes: number;
  omitted: { invoiceId: string; reason: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const p = e as { message?: string; details?: string; code?: string };
    if (p.message || p.code) return [p.message, p.details, p.code].filter(Boolean).join(" | ");
  }
  return String(e ?? "unknown error");
}

/** Safe as a file name inside a zip, on Windows as well. */
function safeName(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/**
 * The receipt's bytes, from whichever store holds them.
 *
 * This Hub has two, unlike Eiffler which is storage-only: `docs/FILE_STORAGE.md` describes the
 * cutover from an inline `content` bytea to Supabase Storage, and rows from before it still carry
 * the inline copy. Reading only one store is the bug that made the DATEV handover fail on 59 of 61
 * receipts, so this reads both.
 */
async function readBytes(file: {
  content?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
}): Promise<Uint8Array> {
  if (file.content) return hexToUint8Array(file.content);
  if (!file.storage_bucket || !file.storage_path) {
    throw new Error("weder Inhalt noch Storage-Pfad hinterlegt");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(file.storage_bucket)
    .download(file.storage_path);
  if (error || !data) {
    throw new Error(
      `in Storage vermerkt, Datei fehlt (${file.storage_bucket}/${file.storage_path})`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}

export const buildMonthlyBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }) => {
    const { companyId, year, month } = data;

    // Company scope. `requireSupabaseAuth` proves WHO is asking, not which companies they may see,
    // and everything below runs through supabaseAdmin, which bypasses RLS. Checked through the
    // caller's own token so has_company_access() sees the real user.
    const { data: mayAccess, error: accessError } = await (context.supabase as Db).rpc(
      "has_company_access",
      { p_company: companyId },
    );
    if (accessError) throw new AppError(accessError.message, 500, "ACCESS_CHECK_FAILED");
    if (mayAccess !== true)
      throw new AppError("Kein Zugriff auf diese Gesellschaft.", 403, "FORBIDDEN");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    // Half-open range on the first of the month, so December and leap years need no special case.
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const toYear = month === 12 ? year + 1 : year;
    const toMonth = month === 12 ? 1 : month + 1;
    const to = `${toYear}-${String(toMonth).padStart(2, "0")}-01`;

    const { data: company } = await db
      .from(TABLE.companies)
      .select("code, name")
      .eq("id", companyId)
      .maybeSingle();

    // THE PERIOD IS THE INVOICE'S OWN `document_date`, not when it was ingested or paid: a payment
    // run is worked by the date on the paper. NO WORKFLOW FILTER, deliberately. A month's batch is
    // everything of that month, and silently omitting a receipt because it sits in an unexpected
    // state is how one goes missing for a month with nobody noticing. The status travels in the
    // manifest instead.
    const { data: invoices, error: invErr } = await db
      .from(TABLE.documents)
      .select(
        "id, issuer, invoice_number, document_date, amount_gross, currency, workflow_status, payment_reference",
      )
      .eq("company_id", companyId)
      .gte("document_date", from)
      .lt("document_date", to)
      .is("deleted_at", null)
      .order("document_date", { ascending: true });
    if (invErr) throw new AppError(errorMessage(invErr), 500, "DB_ERROR");

    if (!invoices || invoices.length === 0) {
      throw new AppError("Für diesen Monat gibt es keine Belege.", 404, "EMPTY");
    }

    // Imported INSIDE the handler, not at the top of the file. `client.server.ts` spells out why:
    // a top-level import in a `*.functions.ts` file ships to the client bundle, and only code
    // reached inside a `.handler()` body is split out. With jszip at the top the server half of
    // this module failed to register at all, and every call came back "Invalid server function ID"
    // while the client happily emitted one.
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const manifest: string[] = [
      [
        "Datei",
        "Beleg-Nr",
        "Datum",
        "Rechnungssteller",
        "Betrag",
        "Währung",
        "Status",
        "Verwendungszweck",
        "Hinweis",
      ].join(";"),
    ];

    let totalBytes = 0;
    let included = 0;
    const omitted: { invoiceId: string; reason: string }[] = [];
    const usedNames = new Set<string>();

    type Row = {
      id: string;
      issuer: string | null;
      invoice_number: string | null;
      document_date: string | null;
      amount_gross: number | null;
      currency: string | null;
      workflow_status: string | null;
      payment_reference: string | null;
    };

    for (const inv of invoices as Row[]) {
      let note = "";
      let fileName = "";
      try {
        const { data: fileRow } = await db
          .from(TABLE.documentFiles)
          // NO `content` COLUMN IN THIS HUB. It completed the storage cutover and dropped the inline
          // bytea, unlike Immonetz where pre-cutover rows still carry it. Selecting it here fails the
          // whole query with "column invoice_files.content does not exist", so every receipt would be
          // reported as blocked. `readFileBytes` sees `content` as undefined and goes to Storage.
          .select("filename, storage_bucket, storage_path")
          .eq("document_id", inv.id)
          .eq("role", "original")
          .maybeSingle();

        if (!fileRow) {
          note = "kein Original hinterlegt";
          omitted.push({ invoiceId: inv.id, reason: note });
        } else {
          const bytes = await readBytes(fileRow);
          if (totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
            note = "übersprungen: Archivgrenze erreicht";
            omitted.push({ invoiceId: inv.id, reason: note });
          } else {
            // Date and invoice number first, so the archive sorts the way a payment run is worked
            // through and two suppliers' "rechnung.pdf" cannot collide.
            const base = safeName(
              [
                inv.document_date ?? "ohne-datum",
                inv.invoice_number ?? inv.id.slice(0, 8),
                inv.issuer ?? "",
              ]
                .filter(Boolean)
                .join("_"),
            );
            const ext = String(fileRow.filename ?? "").match(/\.[A-Za-z0-9]+$/)?.[0] ?? ".pdf";
            let candidate = `${base}${ext}`;
            // Suffix rather than overwrite: JSZip replaces a duplicate entry silently, and a
            // document would vanish from the archive.
            let n = 2;
            while (usedNames.has(candidate)) candidate = `${base} (${n++})${ext}`;
            usedNames.add(candidate);

            zip.file(candidate, bytes);
            totalBytes += bytes.byteLength;
            included += 1;
            fileName = candidate;
          }
        }
      } catch (e) {
        note = `Fehler: ${errorMessage(e)}`;
        omitted.push({ invoiceId: inv.id, reason: note });
      }

      // EVERY invoice gets a manifest row, including the ones with no file. The manifest is how the
      // archive is reconciled against the month: a document that is missing has to be visible AS
      // missing, otherwise the archive quietly redefines what "all documents" means.
      manifest.push(
        [
          fileName,
          inv.invoice_number,
          inv.document_date,
          inv.issuer,
          inv.amount_gross,
          inv.currency,
          inv.workflow_status,
          inv.payment_reference,
          note,
        ]
          .map(csvCell)
          .join(";"),
      );
    }

    // UTF-8 BOM: this gets opened in Excel, and without it every umlaut in a supplier name is
    // mojibake.
    zip.file("_uebersicht.csv", "﻿" + manifest.join("\r\n"));

    const label = safeName(company?.code ?? company?.name ?? "Gesellschaft");
    const stamp = `${year}-${String(month).padStart(2, "0")}`;

    // Base64 rather than a raw Response: a server function's result is serialised as JSON, so the
    // bytes have to survive that. The client turns it straight back into a Blob.
    const archive = await zip.generateAsync({ type: "base64" });

    return {
      base64: archive,
      filename: `Belege_${label}_${stamp}.zip`,
      summary: { total: invoices.length, included, bytes: totalBytes, omitted } as BundleSummary,
    };
  });
