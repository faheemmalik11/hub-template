import { serviceClient } from "../_shared/supabase.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callerEmailFromAuthHeader } from "../_shared/payment-auth.ts";
import { requirePermission } from "../_shared/permission.ts";
import { lexofficeKey, listPostingCategories } from "../_shared/lexoffice-client.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const PERMISSION = "lexoffice.document_sync";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db: Db = serviceClient();

  try {
    const callerEmail = callerEmailFromAuthHeader(req);
    await requirePermission(db, callerEmail, PERMISSION);

    const apiKey = await lexofficeKey(db);
    const categories = await listPostingCategories(db, apiKey);
    return jsonResponse({ categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const forbidden = /permission|not active|caller identity/i.test(message);
    if (!forbidden) console.error("lexoffice-categories failed:", message);
    return jsonResponse({ error: message }, forbidden ? 403 : 502);
  }
});
