// Supabase-Client für Stäy. URL + öffentlicher (publishable) Key des
// Stäy-Projekts. Der service_role-Key gehört NIE hierher (nur Server).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Read from Vite env (VITE_* is exposed to the client bundle). Falls back to
// the bare host if the scheme is missing so createClient always gets an https URL.
const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!rawUrl || !SUPABASE_PUBLISHABLE_KEY) {
  const missing = [
    ...(!rawUrl ? ["VITE_SUPABASE_URL"] : []),
    ...(!SUPABASE_PUBLISHABLE_KEY ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}.`);
}

const SUPABASE_URL = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
