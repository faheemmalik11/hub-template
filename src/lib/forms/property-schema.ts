import { z } from "zod";

/**
 * What an Objekt needs before it can be created.
 *
 * Mirrors gesellschaft-schema.ts and kunde-schema.ts, including feldFehler()'s shape, so every
 * create dialog in this app validates and renders errors the same way. Two deliberate differences:
 *
 * 1. NO FORMAT RULE. The company schema restricts its code to `[A-Za-z0-9]+`, which would be wrong
 *    here: real property codes in the live databases contain hyphens and umlauts (Eiffler: every
 *    one of its 55 codes looks like `DU-BAH`; Immonetz has `GÜEI11` and `KLMÜ4`). A regex copied
 *    from the company dialog would reject codes this app already stores, so the only shape rules
 *    are "not empty" and a generous length ceiling.
 *
 * 2. IT CHECKS FOR A DUPLICATE. `properties.code` is UNIQUE in all three Hubs, so a duplicate was
 *    already impossible -- but nothing said so before the round trip, and the rejection came back
 *    as a raw Postgres error interpolated into a generic toast. The dialog already holds the full
 *    property list it needs to answer this itself, so it now answers before submitting.
 *
 * The comparison is case-insensitive on purpose even though the unique index is not: `grsc12`
 * alongside `GRSC12` would be accepted by Postgres and is, in every realistic case, someone
 * re-entering a property that already exists rather than a genuinely different one.
 */
export function propertySchema(t: (key: string) => string, assignedCodes: Set<string>) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, t("properties.validierung.code"))
      .max(32, t("properties.validierung.codeLaenge"))
      .refine(
        (c) => !assignedCodes.has(c.toLocaleLowerCase()),
        t("properties.validierung.codeVergeben"),
      ),
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
