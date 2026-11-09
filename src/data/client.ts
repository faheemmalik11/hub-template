import { supabase } from "@/integrations/supabase/client";
import { SEED_MODE } from "@/config/seed";
import { seedClient } from "@/seed/client";

/**
 * The one database client every query uses, and the helpers every domain needs.
 *
 * The generated `Database` type covers a minority of the tables, so writes would resolve to
 * `never`. They go through this untyped handle instead, the same way reads cast their results.
 *
 * This is also the one place seed mode is decided. Every query in the app goes through `sb`, so
 * switching it here switches the whole Hub over at once, and no screen needs to know.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = (SEED_MODE ? seedClient : supabase) as any;

/** How long a query stays fresh before React Query refetches it. */
export const STALE = 60_000;

export async function actorEmail(): Promise<string | null> {
  const { data } = await sb.auth.getUser();
  return data.user?.email ?? null;
}

/**
 * Who changed what, for the tables that keep a trail.
 *
 * Goes through the `log_change_history` RPC, not a direct table insert: `change_history`'s own RLS
 * policy allows nobody to write it directly (see supabase/schema/0010_access.sql), on purpose, so
 * the actor is derived server-side from the caller's own session rather than trusted from the
 * client.
 */
export async function insertChangeHistory(
  tableName: string,
  recordId: string,
  type: string,
  text: string | null,
  data: Record<string, unknown> | null = null,
) {
  const { error } = await sb.rpc("log_change_history", {
    p_table_name: tableName,
    p_record_id: recordId,
    p_type: type,
    p_text: text,
    p_data: data,
  });
  if (error) throw error;
}

/** The all-zero uuid stands in for "the one row" on a singleton table keyed on `id = true`. */
export const SINGLETON_ROW_ID = "00000000-0000-0000-0000-000000000000";
