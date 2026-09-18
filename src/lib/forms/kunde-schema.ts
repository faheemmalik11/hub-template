import { z } from "zod";

/**
 * What a customer needs before it can be created.
 *
 * One definition, so every screen that creates a customer asks for the same things. Today that is
 * the new-customer dialog on the Kunden screen (`src/routes/kunden/index.tsx`), which passes
 * `adressePflicht: false`: Stäy keeps its customers locally and no external system demands an
 * address there.
 *
 * `adressePflicht: true` is for a caller that hands the customer to LexOffice, which refuses to
 * invoice a contact with no billing address. No such screen exists yet, so that branch has no call
 * site: it is the rule written down where the schema is, not a promise that something uses it.
 *
 * Messages come in through `t` and each names a fix, with an example where the format matters. A
 * rule that only says "invalid" leaves the reader to guess what shape the answer has.
 */
export function kundeSchema(
  t: (key: string) => string,
  { adressePflicht = true }: { adressePflicht?: boolean } = {},
) {
  // Trimmed BEFORE the union, not inside its second branch. A field holding only spaces is empty as
  // far as the person filling it in is concerned, but `z.literal("")` does not match "  " and the
  // rule behind it then rejects it, so an optional field answered with a stray space produced
  // "Bitte eine gültige PLZ eingeben".
  const optional = <T extends z.ZodTypeAny>(feld: T) =>
    adressePflicht
      ? feld
      : z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.union([z.literal(""), feld]));
  return z.object({
    companyId: z.string().min(1, t("kunden.validierung.gesellschaft")),
    name: z.string().trim().min(1, t("kunden.validierung.name")),
    addressStreet: optional(z.string().trim().min(1, t("kunden.validierung.strasse"))),
    addressZip: optional(
      z
        .string()
        .trim()
        .regex(/^\d{4,5}$/, t("kunden.validierung.plz")),
    ),
    addressCity: optional(z.string().trim().min(1, t("kunden.validierung.ort"))),
    email: z.union([z.literal(""), z.string().trim().email(t("kunden.validierung.email"))]),
  });
}

/** One message per field, in the shape a form can render under its inputs. */
export function feldFehler(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const feld = String(issue.path[0] ?? "");
    if (feld && !out[feld]) out[feld] = issue.message;
  }
  return out;
}
