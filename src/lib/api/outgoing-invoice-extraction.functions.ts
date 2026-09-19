// Server function backing the "Rechnung hochladen" flow for outgoing invoices. this Hub has no
// LexOffice integration for any real company (client requirement: "no API integration to any
// invoicing tool"), so this upload path is the only way an outgoing invoice gets created here —
// ported from immonetz's equivalent feature, which was built for their own non-LexOffice
// companies. A TanStack Start createServerFn, same convention as bank-statement-ai.functions.ts
// — not a Supabase Edge Function. Read-only: this never writes to
// the DB, it only extracts + best-effort matches so the client can render an editable preview
// before anything is committed (see outgoing-invoice-upload.functions.ts for the actual write,
// which happens only once the user confirms).
//
// Uses OpenAI's Responses API with structured output (json_schema, strict mode) and a PDF/image
// file input, same shape as bank-statement-ai.functions.ts's own OpenAI call. Kept on its own
// OPENAI_EXTRACTION_MODEL env var (default gpt-4o-mini) rather than sharing
// bank-statement-ai's OPENAI_MODEL — a different extraction task with its own tuning.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, OpenAiApiError } from "./errors";
import {
  OUTGOING_INVOICE_UPLOAD_MIME,
  MAX_OUTGOING_INVOICE_UPLOAD_BASE64_CHARS,
} from "./outgoing-invoice-shared";
import { TABLE } from "@/config/tables";
import { tenantCredential } from "@/lib/postfach/channel-credentials.server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

const InputSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(OUTGOING_INVOICE_UPLOAD_MIME),
  // Raw base64, no "data:...;base64," prefix — added server-side once the mime is validated.
  fileBase64: z.string().min(1).max(MAX_OUTGOING_INVOICE_UPLOAD_BASE64_CHARS),
});

interface ExtractedFields {
  issuerName: string | null;
  issuerTaxNumber: string | null;
  matchedCompanyCode: string | null;
  customerName: string | null;
  customerAddress: string | null;
  voucherNumber: string | null;
  voucherDate: string | null;
  dueDate: string | null;
  amountNet: number | null;
  amountGross: number | null;
  vatRate: number | null;
  currency: string | null;
}

interface ExtractionResult {
  isOutgoingInvoice: boolean;
  reason: string | null;
  extracted: ExtractedFields;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function buildJsonSchema(companyCodes: string[]) {
  return {
    type: "object",
    properties: {
      is_outgoing_invoice: {
        type: "boolean",
        description:
          "true only if this document is a sales invoice ISSUED BY one of the listed companies " +
          "TO an external customer. false for an incoming/purchase invoice, a document issued by " +
          "someone else, or anything that isn't a sales invoice at all (delivery note, contract, " +
          "receipt, unrelated document).",
      },
      reason: {
        type: ["string", "null"],
        description: "One short sentence explaining the is_outgoing_invoice verdict, in German.",
      },
      issuer_name: { type: ["string", "null"] },
      issuer_tax_number: { type: ["string", "null"] },
      matched_company_code: {
        type: ["string", "null"],
        description:
          companyCodes.length > 0
            ? `Which of these company codes issued the invoice, if any: ${companyCodes.join(", ")}. null if none match.`
            : "null — no known company codes were supplied.",
      },
      customer_name: { type: ["string", "null"] },
      customer_address: {
        type: ["string", "null"],
        description: "Full postal address of the customer as a single line, if present.",
      },
      invoice_number: { type: ["string", "null"] },
      invoice_date: { type: ["string", "null"], description: "ISO format YYYY-MM-DD." },
      due_date: { type: ["string", "null"], description: "ISO format YYYY-MM-DD." },
      amount_net: { type: ["number", "null"] },
      amount_gross: { type: ["number", "null"] },
      vat_rate: { type: ["number", "null"], description: "Percent, e.g. 19 for 19%." },
      currency: { type: ["string", "null"], description: "ISO 4217 code, e.g. EUR." },
    },
    required: [
      "is_outgoing_invoice",
      "reason",
      "issuer_name",
      "issuer_tax_number",
      "matched_company_code",
      "customer_name",
      "customer_address",
      "invoice_number",
      "invoice_date",
      "due_date",
      "amount_net",
      "amount_gross",
      "vat_rate",
      "currency",
    ],
    additionalProperties: false,
  };
}

interface OpenAiResponsesPayload {
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
  error?: { message?: string } | null;
}

async function callOpenAi(
  mime: string,
  filename: string,
  fileBase64: string,
  companies: { code: string; name: string }[],
): Promise<ExtractionResult> {
  const apiKey = await tenantCredential("OPENAI_API_KEY");
  const model = process.env.OPENAI_EXTRACTION_MODEL || DEFAULT_MODEL;

  const companyList = companies.map((c) => `${c.code} · ${c.name}`).join("\n");
  const instructions =
    "You extract structured data from German outgoing-invoice (Ausgangsrechnung) documents for " +
    "an accounting app. These are the only companies whose invoices count as 'outgoing' here " +
    "(the app never issues invoices on behalf of anyone else):\n" +
    (companyList || "(no companies supplied)") +
    "\n\nBe conservative with is_outgoing_invoice: if the issuer is not recognizably one of the " +
    "companies above, or the document is not a sales invoice at all, set it to false.";

  const fileContent =
    mime === "application/pdf"
      ? { type: "input_file", filename, file_data: `data:${mime};base64,${fileBase64}` }
      : { type: "input_image", image_url: `data:${mime};base64,${fileBase64}` };

  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Extract the outgoing-invoice fields from this document.",
              },
              fileContent,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "outgoing_invoice_extraction",
            schema: buildJsonSchema(companies.map((c) => c.code)),
            strict: true,
          },
        },
      }),
    });
  } catch (e) {
    throw new OpenAiApiError(`OpenAI request failed: ${errorMessage(e)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new OpenAiApiError(`OpenAI API returned ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as OpenAiResponsesPayload;
  if (payload.error) {
    throw new OpenAiApiError(`OpenAI API error: ${payload.error.message ?? "unknown"}`);
  }

  const message = (payload.output ?? []).find((o) => o.type === "message");
  const textPart = message?.content?.find((c) => c.type === "output_text");
  if (!textPart?.text) {
    throw new OpenAiApiError("OpenAI response contained no extractable text output.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textPart.text);
  } catch (e) {
    throw new OpenAiApiError(`OpenAI returned non-JSON output: ${errorMessage(e)}`);
  }

  return {
    isOutgoingInvoice: parsed.is_outgoing_invoice === true,
    reason: (parsed.reason as string | null) ?? null,
    extracted: {
      issuerName: (parsed.issuer_name as string | null) ?? null,
      issuerTaxNumber: (parsed.issuer_tax_number as string | null) ?? null,
      matchedCompanyCode: (parsed.matched_company_code as string | null) ?? null,
      customerName: (parsed.customer_name as string | null) ?? null,
      customerAddress: (parsed.customer_address as string | null) ?? null,
      voucherNumber: (parsed.invoice_number as string | null) ?? null,
      voucherDate: (parsed.invoice_date as string | null) ?? null,
      dueDate: (parsed.due_date as string | null) ?? null,
      amountNet: (parsed.amount_net as number | null) ?? null,
      amountGross: (parsed.amount_gross as number | null) ?? null,
      vatRate: (parsed.vat_rate as number | null) ?? null,
      currency: (parsed.currency as string | null) ?? null,
    },
  };
}

// Normalizes a German company/legal-entity name for a loose, deterministic fallback match — drops
// legal-form suffixes and punctuation so "Example GmbH" and "example" line up.
function normalizeLegalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(gmbh & co\.? kg|gmbh|ug|ag|kg|e\.?k\.?|mbh)\b/g, "")
    .replace(/[^a-z0-9äöüß]+/g, "")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// this Hub's companies table has no tax_number column (unlike immonetz's, which added one in a
// later migration) — the exact-tax-number backstop that migration added doesn't apply here.
// Company matching stays on the model's own code pick plus a normalized-name fallback.
async function matchCompany(
  companies: { id: string; code: string; name: string }[],
  extracted: ExtractedFields,
): Promise<string | null> {
  // 1. Trust the model's own pick, but only if it's actually one of the codes we gave it.
  if (extracted.matchedCompanyCode) {
    const byCode = companies.find(
      (c) => c.code.toLowerCase() === extracted.matchedCompanyCode!.toLowerCase(),
    );
    if (byCode) return byCode.id;
  }
  // 2. Deterministic backstop: normalized name match.
  if (extracted.issuerName) {
    const wanted = normalizeLegalName(extracted.issuerName);
    if (wanted) {
      const byName = companies.find((c) => normalizeLegalName(c.name) === wanted);
      if (byName) return byName.id;
    }
  }
  return null;
}

async function matchCustomer(
  db: Db,
  companyId: string,
  customerName: string | null,
): Promise<string | null> {
  if (!customerName) return null;
  const wanted = normalizeLegalName(customerName);
  if (!wanted) return null;

  const { data, error } = await db
    .from(TABLE.customers)
    .select("id, name")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (error) return null; // best-effort — extraction must never fail over a matching lookup
  const match = ((data ?? []) as { id: string; name: string }[]).find(
    (c) => normalizeLegalName(c.name) === wanted,
  );
  return match?.id ?? null;
}

export const extractOutgoingInvoiceFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;

    const { data: companies, error: companiesError } = await db
      .from(TABLE.companies)
      .select("id, code, name");
    if (companiesError) throw new AppError(errorMessage(companiesError), 500, "DB_ERROR");

    const result = await callOpenAi(
      data.mime,
      data.filename,
      data.fileBase64,
      (companies ?? []) as { code: string; name: string }[],
    );

    // Deliberately NOT thrown as a typed error: only Error.message is guaranteed to survive a
    // createServerFn throw across the client boundary, and this outcome needs both a boolean AND
    // the AI's reason text to reach the client reliably. Returning it as normal data sidesteps
    // that serialization gap entirely.
    if (!result.isOutgoingInvoice) {
      return {
        isOutgoingInvoice: false as const,
        reason:
          result.reason ??
          "Das Dokument wurde nicht als Ausgangsrechnung einer unserer Gesellschaften erkannt.",
        extracted: result.extracted,
        matchedCompanyId: null,
        matchedCustomerId: null,
      };
    }

    const matchedCompanyId = await matchCompany(
      (companies ?? []) as { id: string; code: string; name: string }[],
      result.extracted,
    );
    const matchedCustomerId = matchedCompanyId
      ? await matchCustomer(db, matchedCompanyId, result.extracted.customerName)
      : null;

    return {
      isOutgoingInvoice: true as const,
      reason: result.reason,
      extracted: result.extracted,
      matchedCompanyId,
      matchedCustomerId,
    };
  });
