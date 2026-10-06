import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/config/permissions";
import { AppError, ForbiddenError } from "./errors";
import { requirePermission } from "./require-permission";

type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface PropertySyncResult {
  fetched: number;
  created: number;
  linkedBrokers: number;
  dealsOpened: number;
  updated: number;
  syncedAt: string;
}

function callerEmailFrom(context: { claims?: unknown }): string {
  const email = (context.claims as { email?: string } | undefined)?.email;
  if (!email) throw new ForbiddenError("No email on the authenticated session");
  return email;
}

async function failureMessage(error: { context?: unknown; message: string }): Promise<string> {
  const response = error.context as Response | undefined;
  const body = await response?.json?.().catch(() => null);
  return body?.error ?? error.message;
}

export const syncPropertyListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PropertySyncResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;
    const email = callerEmailFrom(context);
    await requirePermission(
      db,
      email,
      PERMISSIONS.propertiesCrmSync,
      "Properties from the CRM are switched off",
    );
    await requirePermission(
      db,
      email,
      PERMISSIONS.masterDataWrite,
      "Only people who maintain master data may sync",
    );

    const { data, error } = await db.functions.invoke("propstack-sync", { body: { wait: true } });
    if (error) throw new AppError(await failureMessage(error), 502, "CRM_SYNC_FAILED");
    return data as PropertySyncResult;
  });
