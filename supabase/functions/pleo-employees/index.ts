// pleo-employees — the people with a Pleo account, read live from Pleo.
//
// WHY LIVE AND NOT FROM OUR TABLES. Everything about SPEND is already mirrored into
// bank_transactions by pleo-sync, so asking Pleo for it would only produce a second answer to a
// question the database already answers, and the two would disagree between syncs. What the mirror
// cannot contain is a person who holds a card and has never used it: with no accounting entries
// there is nothing to derive them from. That is the whole reason this endpoint exists.
//
// IT DOES NOT RETURN CARDS. Pleo's public API has no cards endpoint; the documented families are
// accounting entries, export, tags, tax codes, webhooks, employees and the app marketplace. An
// employee row is the closest thing to "who has a card", and it carries no card number, status or
// limit.
//
// Read-only, no body. Any signed-in user may call it: it exposes names, work emails and job titles
// of colleagues, which is the same directory Team & Rollen already shows.
import { fetchEmployees, pleoConfig, PleoError } from "../_shared/pleo.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const cfg = pleoConfig(); // throws with a precise message when the env is incomplete
    const employees = await fetchEmployees(cfg);

    // Narrowed on the way out. The raw row carries whatever Pleo adds next, and a screen listing
    // colleagues has no business shipping fields nobody asked for to the browser.
    return jsonResponse({
      ok: true,
      employees: employees.map((e) => ({
        id: e.id,
        email: e.email ?? null,
        firstName: e.firstName ?? null,
        lastName: e.lastName ?? null,
        code: e.code ?? null,
        jobTitle: e.jobTitle ?? null,
      })),
    });
  } catch (e) {
    const status = e instanceof PleoError && e.status ? e.status : 500;
    // A 403 here is worth distinguishing: it means the API key works for accounting entries but
    // does not carry the `users:read` scope this endpoint needs.
    return jsonResponse(
      { error: e instanceof Error ? e.message : String(e) },
      status === 401 || status === 403 ? 403 : 500,
    );
  }
});
