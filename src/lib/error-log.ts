import { TABLE } from "@/config/tables";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export async function logClientError(error: unknown, context: { boundary: string }): Promise<void> {
  if (typeof window === "undefined") return;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  try {
    await sb.from(TABLE.clientErrorLog).insert({
      message,
      stack,
      route: window.location.pathname,
      boundary: context.boundary,
      user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
    });
  } catch {
    return;
  }
}
