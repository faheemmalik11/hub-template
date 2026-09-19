// Server function backing the "Mit KI importieren" flow on the Kontenrahmen tab: a tax advisor's
// chart-of-accounts file (CSV/Excel/PDF/image) gets its account numbers + descriptions extracted,
// each best-matched against the client's own bwa_categories, so the user gets an editable preview
// before anything is written (the actual write reuses useImportBwaAccountMapping, same mutation
// the manual "Konto;Kategorie-Code" import used to use before it was removed in favor of this).
// Ported from immonetz's equivalent feature.
//
// Same TanStack Start createServerFn convention as outgoing-invoice-extraction.functions.ts — NOT
// a Supabase Edge Function. Read-only: this never writes to the DB.
//
// Uses OpenAI's Responses API with structured output (json_schema, strict mode). PDF/image go in
// as a file (input_file/input_image with a base64 data URI); CSV/Excel are parsed to plain text
// CLIENT-SIDE first (see ki-import-kontenrahmen-dialog.tsx) and sent as input_text instead, since
// the Responses API has no generic "arbitrary text file" input type.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, OpenAiApiError } from "./errors";
import {
  CHART_OF_ACCOUNTS_FILE_MIME,
  MAX_CHART_OF_ACCOUNTS_UPLOAD_BASE64_CHARS,
  MAX_CHART_OF_ACCOUNTS_TEXT_CHARS,
} from "./chart-of-accounts-extraction-shared";
import { TABLE } from "@/config/tables";
import { tenantCredential } from "@/lib/postfach/channel-credentials.server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

const InputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("file"),
    filename: z.string().min(1).max(255),
    mime: z.enum(CHART_OF_ACCOUNTS_FILE_MIME),
    // Raw base64, no "data:...;base64," prefix — added server-side once the mime is validated.
    fileBase64: z.string().min(1).max(MAX_CHART_OF_ACCOUNTS_UPLOAD_BASE64_CHARS),
  }),
  z.object({
    mode: z.literal("text"),
    filename: z.string().min(1).max(255),
    textContent: z.string().min(1).max(MAX_CHART_OF_ACCOUNTS_TEXT_CHARS),
  }),
]);

interface ExtractedRow {
  account: string;
  description: string | null;
  suggestedCategoryCode: string | null;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function buildJsonSchema() {
  return {
    type: "object",
    properties: {
      rows: {
        type: "array",
        description: "One entry per account line in the chart of accounts.",
        items: {
          type: "object",
          properties: {
            account: {
              type: "string",
              description: 'The DATEV account number, exactly as written (e.g. "4200").',
            },
            description: {
              type: ["string", "null"],
              description:
                'The account\'s own label/description, if present (e.g. "Energiekosten").',
            },
            suggested_category_code: {
              type: ["string", "null"],
              description:
                "Which of the given category codes this account most likely belongs to, based on " +
                "its description. null if genuinely unclear — never guess a code that wasn't given.",
            },
          },
          required: ["account", "description", "suggested_category_code"],
          additionalProperties: false,
        },
      },
    },
    required: ["rows"],
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
  input: z.infer<typeof InputSchema>,
  categories: { code: string; name: string }[],
): Promise<ExtractedRow[]> {
  const apiKey = await tenantCredential("OPENAI_API_KEY");
  const model = process.env.OPENAI_EXTRACTION_MODEL || DEFAULT_MODEL;

  const categoryList = categories.map((c) => `${c.code} · ${c.name}`).join("\n");
  const instructions =
    "You extract structured rows from a German chart-of-accounts (Kontenrahmen/DATEV account " +
    "list) for an accounting app. Every row has an account number and usually a description. " +
    "These are the ONLY category codes you may suggest — pick the single best match per row based " +
    "on its description, or null if genuinely unclear. Never invent a code that isn't listed:\n" +
    (categoryList || "(no categories supplied — always return null for suggested_category_code)") +
    "\n\nExtract every account row you can find, even if you're unsure of the category match.";

  const content: Record<string, unknown>[] = [
    { type: "input_text", text: "Extract the chart-of-accounts rows from this document." },
  ];
  if (input.mode === "file") {
    content.push(
      input.mime === "application/pdf"
        ? {
            type: "input_file",
            filename: input.filename,
            file_data: `data:${input.mime};base64,${input.fileBase64}`,
          }
        : { type: "input_image", image_url: `data:${input.mime};base64,${input.fileBase64}` },
    );
  } else {
    content.push({ type: "input_text", text: input.textContent });
  }

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
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "chart_of_accounts_extraction",
            schema: buildJsonSchema(),
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

  let parsed: { rows?: unknown[] };
  try {
    parsed = JSON.parse(textPart.text);
  } catch (e) {
    throw new OpenAiApiError(`OpenAI returned non-JSON output: ${errorMessage(e)}`);
  }

  return (parsed.rows ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        account: String(row.account ?? "").trim(),
        description: (row.description as string | null) ?? null,
        suggestedCategoryCode: (row.suggested_category_code as string | null) ?? null,
      };
    })
    .filter((r) => r.account !== "");
}

export const extractChartOfAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;

    const { data: categories, error: categoriesError } = await db
      .from(TABLE.categories)
      .select("id, code, name")
      .is("deleted_at", null);
    if (categoriesError) throw new AppError(errorMessage(categoriesError), 500, "DB_ERROR");

    const categoryRows = (categories ?? []) as { id: string; code: string; name: string }[];
    const rows = await callOpenAi(data, categoryRows);

    const byCode = new Map(categoryRows.map((c) => [c.code.toLowerCase(), c]));
    return {
      rows: rows.map((r) => ({
        account: r.account,
        description: r.description,
        matchedCategoryId: r.suggestedCategoryCode
          ? (byCode.get(r.suggestedCategoryCode.toLowerCase())?.id ?? null)
          : null,
      })),
    };
  });
