import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TABLE } from "@/config/tables";
import { AppError } from "@/lib/api/errors";

import { WORKFLOW_STEP_RESULT, workflowStepsToRun } from "./workflow-stand-in-steps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const StandInSchema = z.object({
  documentId: z.string().uuid(),
  step: z.enum(["send-for-review", "approve", "final-approve", "pay"]),
});

export const advancePracticeDocumentAsStandIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(StandInSchema)
  .handler(async ({ data, context }) => {
    const { data: practiceDocument, error } = await (context.supabase as Db)
      .from(TABLE.documents)
      .select("id, workflow_status, demo_owner_user_id")
      .eq("id", data.documentId)
      .eq("is_demo", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500, "DB_ERROR");
    if (!practiceDocument) throw new AppError("Practice document not found", 404, "NOT_FOUND");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    if (data.step === "pay") {
      const { data: match, error: matchError } = await db
        .from(TABLE.documentTransactionMatches)
        .select("id, transaction_id")
        .eq("document_id", practiceDocument.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (matchError) throw new AppError(matchError.message, 500, "DB_ERROR");
      if (!match) throw new AppError("Practice bank match not found", 404, "NOT_FOUND");
      const { error: confirmError } = await db
        .from(TABLE.documentTransactionMatches)
        .update({
          status: "confirmed",
          confirmed_by: "onboarding",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", match.id);
      if (confirmError) throw new AppError(confirmError.message, 500, "DB_ERROR");
      return { status: "paid" as const };
    }

    for (const step of workflowStepsToRun(data.step, practiceDocument.workflow_status)) {
      const result = WORKFLOW_STEP_RESULT[step];
      const { error: updateError } = await db
        .from(TABLE.documents)
        .update({ workflow_status: result.status })
        .eq("id", practiceDocument.id)
        .eq("is_demo", true);
      if (updateError) throw new AppError(updateError.message, 500, "DB_ERROR");
      await db.from(TABLE.documentHistory).insert({
        document_id: practiceDocument.id,
        type: result.historyType,
        text: result.historyText,
        actor: "onboarding",
        data: { demo: true },
      });
    }

    return {
      status:
        WORKFLOW_STEP_RESULT[data.step as keyof typeof WORKFLOW_STEP_RESULT]?.status ??
        practiceDocument.workflow_status,
    };
  });
