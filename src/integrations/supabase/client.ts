// The browser's Supabase client. Its URL and publishable key come from src/config/env.ts, which
// validates them at startup. The service-role key never belongs here: this file reaches the browser.
import { createClient } from "@supabase/supabase-js";

import { ENV } from "@/config/env";
import type { Database } from "./types";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(ENV.supabaseUrl, ENV.supabasePublishableKey, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
