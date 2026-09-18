// Service-role Supabase client for Edge Functions. Bypasses RLS — server-side only.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into the
// Supabase Edge runtime; for `supabase functions serve` they come from the local env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the function env.");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
