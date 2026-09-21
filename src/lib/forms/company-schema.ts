import { z } from "zod";

/**
 * What a Gesellschaft needs before it can be created.
 *
 * The dialog asks for seven fields and, until now, said nothing about which of them it actually
 * required: no asterisks, no messages under the inputs. Submitting without a code or a name
 * produced a single toast ("Code und Name sind erforderlich.") that named both problems at once,
 * disappeared after a few seconds, and never pointed at a field.
 *
 * Only `code` and `name` are required -- everything else on the company record is genuinely
 * optional, so they stay unmarked. `code` is additionally constrained: it is the key the ingest
 * pipeline matches against and the string `entity_aliases.entity_code` and `invoices.company_code`
 * are keyed by (see the rename-cascade migration), so a code with surrounding whitespace or
 * lowercase drift causes silent mismatches later. Trim and normalise it here rather than storing
 * whatever was typed.
 *
 * Mirrors kunde-schema.ts deliberately, including feldFehler()'s shape, so both dialogs validate
 * and render errors the same way.
 */
export function companySchema(t: (key: string) => string) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, t("companies.validierung.code"))
      .max(16, t("companies.validierung.codeLaenge"))
      .regex(/^[A-Za-z0-9]+$/, t("companies.validierung.codeFormat")),
    name: z.string().trim().min(1, t("companies.validierung.name")),
  });
}

/** One message per field, in the shape a form can render under its inputs. */
export function fieldError(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !out[field]) out[field] = issue.message;
  }
  return out;
}
