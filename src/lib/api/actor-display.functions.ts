// Resolves an audit email (mail_settings.updated_by and friends) to the person's display name
// and role, so screens can say "Zuletzt geändert von Philipp Netz [Admin]" instead of showing a
// raw email address. Auth-gated; returns strictly LESS than the email the caller already holds —
// name and role are the same fields chain_people() exposes to every signed-in user.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TABLE } from "@/lib/data/tables";

const InputSchema = z.object({ email: z.string().trim().min(3).max(255) });

export interface ActorDisplay {
  name: string | null;
  roleName: string | null;
}

export const getActorDisplay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(InputSchema)
  .handler(async ({ data }): Promise<ActorDisplay> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // app_users is not in the generated Database stub — same `as any` convention as `sb` in
    // src/lib/data/queries.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: row } = await admin
      .from(TABLE.appUsers)
      .select(`name, ${TABLE.roles}(name)`)
      .ilike("email", data.email)
      .maybeSingle();
    const typed = row as { name: string | null; roles: { name: string } | null } | null;
    return { name: typed?.name ?? null, roleName: typed?.roles?.name ?? null };
  });
