// Server function backing AI extraction of bank transactions from a PDF statement — a second,
// AI-assisted path alongside the deterministic CSV/XLSX parsers in src/lib/bank-import/. Real
// bank statements the client actually has are mostly PDF, and every bank formats its statement
// differently, so this standardizes whatever shape a given bank uses into the same fields Stäy
// needs everywhere else — but a PDF upload lands on its own editable preview step
// (manual-import-ai-preview-step.tsx), not the read-only CSV/XLSX one, because the model can
// genuinely fail to find a required field (see missing_fields below) and the human has to fill it
// in before anything is sent to bank-manual-import.functions.ts.
//
// SCOPE NOTE: PDF/AI extraction was never part of the client's original ask (they said "XML, CSV,
// or Excel"). It is a genuinely new capability — sending bank-statement content (IBANs, amounts,
// counterparty names) to OpenAI, a third-party US service — worth a deliberate heads-up to the
// client rather than a silent addition. See docs/BANK_MANUAL_IMPORT.md §6.
//
// Must run server-side: needs OPENAI_API_KEY, which must never reach the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, OpenAiApiError, ValidationError } from "./errors";
import { tenantCredential } from "@/lib/postfach/channel-credentials.server";

// Every field a transaction row can carry. Used both in the schema below and as the vocabulary
// for `missing_fields`, so "this row is missing X" always names something the UI can point at.
const EXTRACTION_FIELDS = [
  "booking_date",
  "value_date",
  "amount",
  "currency",
  "counterparty_holder",
  "counterparty_iban",
  "payment_reference",
  "booking_text",
] as const;
export type ExtractionField = (typeof EXTRACTION_FIELDS)[number];

const OPENAI_URL = "https://api.openai.com/v1/responses";
// Model is env-configurable (not hardcoded) so it can be swapped for a cheaper/newer one without
// a code change once OpenAI's lineup has moved on from whatever's current today.
const DEFAULT_MODEL = "gpt-4.1";
// A generous statement can run to many pages; extraction is I/O-bound (waiting on OpenAI), not
// CPU-bound, so a long wall-clock timeout is fine on a Workers-style runtime.
const REQUEST_TIMEOUT_MS = 120_000;
// Base64 inflates size by ~4/3; this caps the DECODED PDF around ~20MB, comfortably above any
// realistic monthly statement while still failing fast on an accidental wrong-file upload.
const MAX_BASE64_LENGTH = 27_000_000;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// OpenAI Structured Outputs (strict json_schema): every property must be listed in `required`;
// fields that are conceptually optional are expressed as nullable types instead of being omitted,
// and every object needs additionalProperties: false. Mirrors NormalizedRow's fields
// (src/lib/bank-import/types.ts) plus two things a deterministic CSV/XLSX parse never has to
// worry about: `confidence` (a signal for which AI-read rows to double check) and
// `missing_fields` (which fields the SOURCE DOCUMENT itself didn't contain, as opposed to
// present-but-uncertain — the wizard's preview step turns these into inline inputs the user fills
// in before import, rather than importing with a guessed or blank value).
//
// booking_date/amount are nullable here even though every other part of this app treats them as
// required (NormalizedRow, the CSV/XLSX validator) -- forcing the model to invent a plausible-
// looking date/amount when the document genuinely doesn't have one would be worse than an honest
// null the human has to fill in.
const TRANSACTION_SCHEMA = {
  type: "object",
  properties: {
    booking_date: {
      type: ["string", "null"],
      description: "ISO date, YYYY-MM-DD, or null if genuinely absent.",
    },
    value_date: { type: ["string", "null"] },
    amount: {
      type: ["number", "null"],
      description:
        "Signed: negative = outgoing/debit/Soll/Belastung, positive = incoming/credit/Haben/Gutschrift. Null if genuinely absent.",
    },
    currency: { type: ["string", "null"] },
    counterparty_holder: { type: ["string", "null"] },
    counterparty_iban: { type: ["string", "null"] },
    payment_reference: { type: ["string", "null"] },
    booking_text: { type: ["string", "null"] },
    confidence: {
      type: "string",
      enum: ["high", "low"],
      description:
        '"low" if a field you DID find is nonetheless uncertain (blurry scan, ambiguous layout) — distinct from missing_fields, which is for fields not found at all.',
    },
    missing_fields: {
      type: "array",
      items: { type: "string", enum: [...EXTRACTION_FIELDS] },
      description:
        "Fields that should exist for a transaction but this document simply does not contain/show for this row — e.g. no IBAN column at all, or a booking date you could not find. Do NOT list a field just because it doesn't apply to this transaction type.",
    },
  },
  required: [
    "booking_date",
    "value_date",
    "amount",
    "currency",
    "counterparty_holder",
    "counterparty_iban",
    "payment_reference",
    "booking_text",
    "confidence",
    "missing_fields",
  ],
  additionalProperties: false,
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    statement_notes: {
      type: "array",
      items: { type: "string" },
      description:
        "Short German sentences about anything unreadable, ambiguous, or otherwise worth a human's attention. Empty array if nothing to flag.",
    },
    transactions: { type: "array", items: TRANSACTION_SCHEMA },
  },
  required: ["statement_notes", "transactions"],
  additionalProperties: false,
} as const;

const EXTRACTION_PROMPT = `You are extracting every transaction/booking line from a German bank account statement (Kontoauszug) PDF for accounting import. This is a real financial document — accuracy matters more than completeness of prose.

Rules:
- Extract EVERY transaction row exactly as it appears. Do not invent, merge, skip, or summarize rows.
- booking_date: the booking date (Buchungstag/Buchungsdatum) in ISO YYYY-MM-DD. Convert from whatever format the statement uses (commonly DD.MM.YYYY). If this row genuinely has no determinable booking date, set it to null and add "booking_date" to missing_fields — do NOT guess or reuse a nearby date.
- value_date: the value date (Wertstellung/Valuta) in ISO YYYY-MM-DD, or null if not shown.
- amount: the signed transaction amount as a plain number. Negative for money leaving the account (Soll/Belastung/Ausgang), positive for money entering it (Haben/Gutschrift/Eingang). Use the statement's own sign, debit/credit column, or column position (Soll vs. Haben) to determine direction — never guess the sign from context alone. If the amount is genuinely illegible or absent, set it to null and add "amount" to missing_fields — do NOT guess a plausible-looking number.
- currency: the ISO currency code (e.g. "EUR") if shown, else null.
- counterparty_holder: the other party's name (Empfänger/Auftraggeber/Zahlungspflichtiger).
- counterparty_iban: their IBAN if shown, else null.
- payment_reference: the payment reference / purpose text (Verwendungszweck).
- booking_text: the bank's own transaction-type text (Buchungstext/Umsatzart), if distinct from the reference.
- confidence: "low" if a field you DID find is nonetheless uncertain (blurry scan, ambiguous table, overlapping text) — otherwise "high".
- missing_fields: list ONLY fields that should exist for this transaction but the document does not show/contain for this specific row (e.g. the statement has no IBAN column at all, or a date cell is blank/cut off). Do NOT list a field just because it naturally doesn't apply to this transaction (e.g. a card payment typically has no counterparty_iban — that is normal, not missing).
- statement_notes: short GERMAN sentences (shown to a human reviewer) about anything you could not read confidently — an unreadable page, an ambiguous total, an unclear column layout. Empty array if there is nothing to flag.
- Never fabricate a transaction that is not clearly present in the document, and never fabricate a field value to avoid an empty field — use null + missing_fields instead.`;

interface OpenAiResponsePayload {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  output_text?: string;
  error?: { message?: string };
}

function extractResponseText(payload: OpenAiResponsePayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw new OpenAiApiError("OpenAI response contained no extractable text output.", payload);
}

const ExtractedTransactionSchema = z.object({
  booking_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  value_date: z.string().nullable(),
  amount: z.number().finite().nullable(),
  currency: z.string().nullable(),
  counterparty_holder: z.string().nullable(),
  counterparty_iban: z.string().nullable(),
  payment_reference: z.string().nullable(),
  booking_text: z.string().nullable(),
  confidence: z.enum(["high", "low"]),
  missing_fields: z.array(z.enum(EXTRACTION_FIELDS)),
});

const ExtractionResponseSchema = z.object({
  statement_notes: z.array(z.string()),
  transactions: z.array(ExtractedTransactionSchema),
});

// Deliberately NOT NormalizedRow: booking_date/amount are nullable here (§ TRANSACTION_SCHEMA
// above), whereas NormalizedRow treats them as always-present — this row shape is only ever
// consumed by the AI-specific editable preview step, which fills the gaps and converts to a real
// NormalizedRow[] before anything is sent to the import server function.
export interface AiExtractedRow {
  booking_date: string | null;
  value_date: string | null;
  amount: number | null;
  currency: string | null;
  counterparty_holder: string | null;
  counterparty_iban: string | null;
  payment_reference: string | null;
  booking_text: string | null;
  confidence: "high" | "low";
  missingFields: ExtractionField[];
}

export interface ExtractBankStatementResult {
  rows: AiExtractedRow[];
  statementNotes: string[];
}

const ExtractBankStatementSchema = z.object({
  filename: z.string().trim().min(1),
  // Base64-encoded PDF bytes (data URI prefix stripped client-side before sending).
  pdfBase64: z.string().min(1),
});

export const extractBankStatementFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(ExtractBankStatementSchema)
  .handler(async ({ data }): Promise<ExtractBankStatementResult> => {
    if (data.pdfBase64.length > MAX_BASE64_LENGTH) {
      throw new ValidationError(
        "PDF is too large (limit ~20MB). Split the statement and upload in parts.",
      );
    }

    const apiKey = await tenantCredential("OPENAI_API_KEY");
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

    let response: Response;
    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: EXTRACTION_PROMPT },
                {
                  type: "input_file",
                  filename: data.filename,
                  file_data: `data:application/pdf;base64,${data.pdfBase64}`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "bank_statement_extraction",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      });
    } catch (e) {
      throw new OpenAiApiError(`OpenAI request failed: ${errorMessage(e)}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new OpenAiApiError(`OpenAI API returned ${response.status}: ${body.slice(0, 500)}`, {
        status: response.status,
      });
    }

    const payload = (await response.json()) as OpenAiResponsePayload;
    const text = extractResponseText(payload);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch (e) {
      throw new OpenAiApiError(`OpenAI response was not valid JSON: ${errorMessage(e)}`, {
        text: text.slice(0, 500),
      });
    }

    const parsed = ExtractionResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new OpenAiApiError(
        "OpenAI response did not match the expected extraction schema.",
        parsed.error.flatten(),
      );
    }

    const rows: AiExtractedRow[] = parsed.data.transactions.map((t) => ({
      booking_date: t.booking_date,
      value_date: t.value_date,
      amount: t.amount,
      currency: t.currency,
      counterparty_holder: t.counterparty_holder,
      counterparty_iban: t.counterparty_iban,
      payment_reference: t.payment_reference,
      booking_text: t.booking_text,
      confidence: t.confidence,
      missingFields: t.missing_fields,
    }));

    return { rows, statementNotes: parsed.data.statement_notes };
  });
