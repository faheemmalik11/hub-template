import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  classifyIntent,
  generateSqlPreview,
  type ModelUsage,
  type ModelUsageContext,
  type SqlPreview,
} from "@/kit/lib/ai-search-sql";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSqlPreviewConfig, loadIntentVocabulary } from "./invoice-intent-config";
import { AppError } from "./errors";
import { TABLE } from "@/config/tables";

const InputSchema = z.object({
  query: z.string().trim().min(1).max(500),
});

export interface InvoiceSearchOutcome {
  preview: SqlPreview;
  ids: string[] | null;
}

async function recordAiSearchUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  question: string,
  language: string,
  intent: string,
  events: { usage: ModelUsage; context: ModelUsageContext }[],
): Promise<void> {
  if (events.length === 0) return;
  const searchId = crypto.randomUUID();
  const rows = events.map((event) => ({
    search_id: searchId,
    question,
    language,
    intent,
    stage: event.context.stage,
    attempt: event.context.attempt,
    provider: event.usage.provider,
    model: event.usage.model,
    input_tokens: event.usage.inputTokens,
    output_tokens: event.usage.outputTokens,
  }));
  try {
    await db.from(TABLE.assistantUsage).insert(rows);
  } catch {
    // Recording only — a failed write here must never fail the search itself.
  }
}

export const searchInvoicesByQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data, context }): Promise<InvoiceSearchOutcome> => {
    const config = await buildSqlPreviewConfig();
    const usageEvents: { usage: ModelUsage; context: ModelUsageContext }[] = [];
    config.onModelUsage = (usage, usageContext) =>
      usageEvents.push({ usage, context: usageContext });

    const vocabulary = await loadIntentVocabulary(context.supabase);
    const classification = await classifyIntent(config, vocabulary, data.query);
    const preview = await generateSqlPreview(config, classification, data.query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    await recordAiSearchUsage(
      db,
      data.query,
      preview.classification.language,
      preview.classification.intent,
      usageEvents,
    );

    if (preview.classification.intent === "off_topic") {
      return { preview, ids: null };
    }
    const { data: idRows, error } = await db.rpc("invoices_search_ids", {
      p_where: preview.whereClause,
      p_archived: preview.classification.entities.archived,
    });
    if (error) throw new AppError(String(error.message ?? error), 500, "DB_ERROR");
    return { preview, ids: (idRows ?? []) as string[] };
  });
