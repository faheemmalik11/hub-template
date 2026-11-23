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
  totals: InvoiceSearchTotals | null;
  breakdown: InvoiceSearchGroup[] | null;
}

export interface InvoiceSearchGroup {
  key: string;
  invoiceCount: number;
  gross: number;
}

export interface InvoiceSearchTotals {
  invoiceCount: number;
  gross: number;
  net: number;
  vat: number;
}

async function recordAiSearchUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  question: string,
  language: string,
  intent: string,
  events: { usage: ModelUsage; context: ModelUsageContext }[],
  clause: {
    whereClause: string | null;
    rejectedWhereClause: string | null;
    matchCount: number | null;
  },
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
    where_clause: clause.whereClause,
    rejected_where_clause: clause.rejectedWhereClause,
    match_count: clause.matchCount,
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
    const config = await buildSqlPreviewConfig(context.supabase);
    const usageEvents: { usage: ModelUsage; context: ModelUsageContext }[] = [];
    config.onModelUsage = (usage, usageContext) =>
      usageEvents.push({ usage, context: usageContext });

    const vocabulary = await loadIntentVocabulary(context.supabase);
    const classification = await classifyIntent(config, vocabulary, data.query);
    const preview = await generateSqlPreview(config, classification, data.query);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const record = (matchCount: number | null) =>
      recordAiSearchUsage(
        db,
        data.query,
        preview.classification.language,
        preview.classification.intent,
        usageEvents,
        {
          whereClause: preview.whereClause,
          rejectedWhereClause: preview.rejectedWhereClause,
          matchCount,
        },
      );

    if (preview.classification.intent === "off_topic") {
      await record(null);
      return { preview, ids: null, totals: null, breakdown: null };
    }
    const { data: idRows, error } = await db.rpc("invoices_search_ids", {
      p_where: preview.whereClause,
      p_archived: preview.classification.entities.archived,
    });
    if (error) throw new AppError(String(error.message ?? error), 500, "DB_ERROR");
    const ids = (idRows ?? []) as string[];
    await record(ids.length);

    // Asked for a sum or a count, not a list. Same clause and same archived flag as the ids above,
    // so the number always describes exactly the rows shown underneath it.
    const wantsATotal =
      preview.classification.intent === "total_amount" ||
      preview.classification.intent === "count_invoices";
    let totals: InvoiceSearchTotals | null = null;
    if (wantsATotal) {
      const { data: totalRows, error: totalsError } = await db.rpc("invoices_search_totals", {
        p_where: preview.whereClause,
        p_archived: preview.classification.entities.archived,
      });
      if (totalsError)
        throw new AppError(String(totalsError.message ?? totalsError), 500, "DB_ERROR");
      const row = (totalRows ?? [])[0];
      if (row) {
        totals = {
          invoiceCount: Number(row.invoice_count ?? 0),
          gross: Number(row.total_gross ?? 0),
          net: Number(row.total_net ?? 0),
          vat: Number(row.total_vat ?? 0),
        };
      }
    }
    // "Which supplier cost us the most" names a dimension, not a filter: the rows are right but
    // the answer is the ranking over them.
    let breakdown: InvoiceSearchGroup[] | null = null;
    if (preview.classification.intent === "rank_breakdown") {
      const { data: groupRows, error: groupError } = await db.rpc("invoices_search_breakdown", {
        p_where: preview.whereClause,
        p_archived: preview.classification.entities.archived,
        p_group_by: preview.classification.entities.groupBy ?? "issuer",
      });
      if (groupError) throw new AppError(String(groupError.message ?? groupError), 500, "DB_ERROR");
      breakdown = ((groupRows ?? []) as Record<string, unknown>[]).map((row) => ({
        key: String(row.group_key ?? ""),
        invoiceCount: Number(row.invoice_count ?? 0),
        gross: Number(row.total_gross ?? 0),
      }));
    }

    return { preview, ids, totals, breakdown };
  });
